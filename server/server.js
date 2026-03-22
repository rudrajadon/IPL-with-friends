require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const path = require("path");
const rawPlayers = require("../1.json");

const PORT = Number(process.env.PORT) || 4000;
const ALLOWED_ORIGINS = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const IS_OPEN_CORS = ALLOWED_ORIGINS.length === 0;

const isOriginAllowed = (origin) => {
  if (IS_OPEN_CORS) return true;
  if (!origin) return true;
  return ALLOWED_ORIGINS.includes(origin);
};

const TIMER_DURATION_MS = 15000;
const LOT_RESULT_DELAY_MS = 3000;
const MIN_BID_INCREMENT = 2500000;
const STARTING_PURSE = 1000000000;
const MAX_SQUAD_PLAYERS = 15;
const MAX_FOREIGN_PLAYERS = 6;
const RESULTS_WAIT_MS = 15000;
const WINNER_POPUP_DELAY_MS = 0;

const parseBasePriceToRupees = (basePrice) => {
  if (typeof basePrice === "number") return basePrice;
  if (!basePrice) return 0;

  const value = String(basePrice).trim().toLowerCase();
  const numberMatch = value.match(/\d+(?:\.\d+)?/);
  const amount = numberMatch ? Number(numberMatch[0]) : 0;

  if (value.includes("cr")) {
    return Math.round(amount * 10000000);
  }
  if (value.includes("lakh") || value.includes("lac") || value.includes("l")) {
    return Math.round(amount * 100000);
  }
  return Math.round(amount);
};

const auctionPlayers = rawPlayers.map((player, index) => ({
  player_id: index + 1,
  player_name: player.name,
  role: player.role,
  nationality: player.nationality,
  country: player.country || player.nationality,
  image:
    player.image ||
    player.photo ||
    player.img ||
    player.player_image ||
    player.image_url ||
    null,
  points: Number(player.points) || 0,
  base_price: parseBasePriceToRupees(player.base_price),
}));

const createShuffledPlayers = () => {
  const shuffled = [...auctionPlayers];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const teams = [
  { id: 1, name: "CSK", logo: "csk.png" },
  { id: 2, name: "MI", logo: "mi.png" },
  { id: 3, name: "RCB", logo: "rcb.png" },
  { id: 4, name: "KKR", logo: "kkr.png" },
  { id: 5, name: "SRH", logo: "srh.png" },
  { id: 6, name: "RR", logo: "rr.png" },
  { id: 7, name: "KXIP", logo: "kxip.png" },
  { id: 8, name: "DD", logo: "dd.png" },
];

const app = express();
app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
  }),
);
app.use("/files", express.static("files"));
app.use("/audio", express.static(path.join(__dirname, "../files_mp3")));
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
  },
});

let rooms = {};
const accountsById = {};
const accountIdByUsername = {};
const accountIdByGoogleId = {};
const accountIdByClerkId = {};

const DISCONNECT_GRACE_MS = 60000;

const generatePlayerId = () =>
  `P${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const clearRoomTimer = (room) => {
  if (room.auction?.timeout) {
    clearTimeout(room.auction.timeout);
    room.auction.timeout = null;
  }
  if (room.auction?.tickInterval) {
    clearInterval(room.auction.tickInterval);
    room.auction.tickInterval = null;
  }
  if (room.auction) {
    room.auction.endsAt = null;
  }
};

const getActiveParticipantIds = (room) => {
  const ids = new Set();
  room.teams.forEach((team) => {
    if (!team.owner) return;
    const user = room.users[team.owner];
    if (user && user.connected !== false) {
      ids.add(team.owner);
    }
  });
  return ids;
};

const getAutoLockedTeamIds = (room) => {
  const lockedTeamIds = new Set();
  room.teams.forEach((team) => {
    if (!team.owner) return;
    const user = room.users[team.owner];
    if (!user || user.connected === false) return;
    if ((team.players || []).length >= MAX_SQUAD_PLAYERS) {
      lockedTeamIds.add(team.id);
    }
  });
  return lockedTeamIds;
};

const areAllActiveSquadsCompleted = (room) => {
  const activeTeams = room.teams.filter((team) => {
    if (!team.owner) return false;
    const user = room.users[team.owner];
    return Boolean(user && user.connected !== false);
  });

  if (activeTeams.length === 0) return false;
  return activeTeams.every(
    (team) => (team.players || []).length >= MAX_SQUAD_PLAYERS,
  );
};

const endAuction = (roomId) => {
  const room = rooms[roomId];
  if (!room) return;
  const now = Date.now();
  room.auction.phase = "ended";
  room.auction.started = false;
  room.auction.paused = false;
  room.auction.remainingMs = 0;
  room.auction.endsAt = null;
  if (!room.auction.resultsRevealAt) {
    room.auction.resultsRevealAt = now + RESULTS_WAIT_MS;
  }
  if (!room.auction.winnerPopupAt) {
    room.auction.winnerPopupAt =
      room.auction.resultsRevealAt + WINNER_POPUP_DELAY_MS;
  }
  clearRoomTimer(room);
  emitRoomUpdate(roomId);
  io.to(roomId).emit("auctionEnded");
};

const applyAutoLotActions = (room) => {
  const autoLockedTeamIds = getAutoLockedTeamIds(room);
  autoLockedTeamIds.forEach((teamId) => {
    room.auction.skipSet.add(teamId);
    if (!room.auction.activeBid || room.auction.activeBid.teamId !== teamId) {
      room.auction.withdrawSet.add(teamId);
    }
  });
};

const serializeRoom = (room) => {
  const remainingMs = room.auction?.paused
    ? room.auction.remainingMs
    : Math.max(0, (room.auction?.endsAt || 0) - Date.now());
  const participantCount = getActiveParticipantIds(room).size;

  return {
    id: room.id,
    users: room.users,
    teams: room.teams,
    admin: room.admin,
    currentPlayerIndex: room.auction.currentPlayerIndex,
    currentPlayer: room.auction.currentPlayer,
    paused: room.auction.paused,
    pauseRemainingMs: room.auction.paused ? remainingMs : null,
    auctionStarted: room.auction.started,
    activeBid: room.auction.activeBid,
    recentBids: room.auction.recentBids || [],
    participantCount,
    skipCount: room.auction.skipSet?.size || 0,
    withdrawCount: room.auction.withdrawSet?.size || 0,
    timerSeconds: room.auction.started
      ? Math.max(0, Math.ceil(remainingMs / 1000))
      : null,
    timerRemainingMs: room.auction.started ? remainingMs : null,
    waitingMusicStartedAt: room.auction.waitingMusicStartedAt || null,
    auctionStartSoundAt: room.auction.auctionStartSoundAt || null,
    resultsRevealAt: room.auction.resultsRevealAt || null,
    winnerPopupAt: room.auction.winnerPopupAt || null,
    phase: room.auction.phase,
  };
};

const emitRoomUpdate = (roomId) => {
  const room = rooms[roomId];
  if (!room) return;
  io.to(roomId).emit("updateRoom", serializeRoom(room));
};

const emitTick = (roomId) => {
  const room = rooms[roomId];
  if (!room || !room.auction.started) return;

  const remainingMs = room.auction.paused
    ? room.auction.remainingMs
    : Math.max(0, room.auction.endsAt - Date.now());

  io.to(roomId).emit("auctionTick", {
    remainingMs,
    seconds: Math.max(0, Math.ceil(remainingMs / 1000)),
  });
};

const getCurrentPlayer = (room) => {
  const queue = room?.auction?.playerQueue || auctionPlayers;
  return queue[room.auction.currentPlayerIndex] || null;
};

const startAuctionTimer = (roomId, durationMs = TIMER_DURATION_MS) => {
  const room = rooms[roomId];
  if (!room || !room.auction.started || room.auction.phase !== "running")
    return;

  clearRoomTimer(room);
  room.auction.timerVersion += 1;
  const timerVersion = room.auction.timerVersion;
  room.auction.remainingMs = durationMs;
  room.auction.endsAt = Date.now() + durationMs;

  emitTick(roomId);

  room.auction.tickInterval = setInterval(() => {
    const latestRoom = rooms[roomId];
    if (
      !latestRoom ||
      !latestRoom.auction.started ||
      latestRoom.auction.paused
    ) {
      return;
    }
    latestRoom.auction.remainingMs = Math.max(
      0,
      latestRoom.auction.endsAt - Date.now(),
    );
    emitTick(roomId);
  }, 250);

  room.auction.timeout = setTimeout(() => {
    const latestRoom = rooms[roomId];
    if (!latestRoom) return;
    if (latestRoom.auction.timerVersion !== timerVersion) return;
    handleTimerExpired(roomId);
  }, durationMs);
};

const moveToNextLot = (roomId) => {
  const room = rooms[roomId];
  if (!room) return;

  room.auction.resolving = false;

  if (areAllActiveSquadsCompleted(room)) {
    endAuction(roomId);
    return;
  }

  room.auction.currentPlayerIndex += 1;
  room.auction.currentPlayer = getCurrentPlayer(room);
  room.auction.activeBid = null;
  room.auction.recentBids = [];
  room.auction.skipSet.clear();
  room.auction.withdrawSet.clear();
  applyAutoLotActions(room);

  if (!room.auction.currentPlayer) {
    endAuction(roomId);
    return;
  }

  emitRoomUpdate(roomId);
  io.to(roomId).emit("nextPlayer", room.auction.currentPlayer);
  const autoResolved = evaluateAutoLotCompletion(roomId);
  if (!autoResolved) {
    startAuctionTimer(roomId, TIMER_DURATION_MS);
  }
};

const finalizeCurrentPlayer = (roomId, sellBid = null) => {
  const room = rooms[roomId];
  if (!room || room.auction.phase !== "running") return;
  if (room.auction.resolving) return;

  room.auction.resolving = true;

  clearRoomTimer(room);

  const player = room.auction.currentPlayer;
  if (!player) {
    moveToNextLot(roomId);
    return;
  }

  if (sellBid) {
    const team = room.teams.find((t) => t.id === sellBid.teamId);
    if (team) {
      const alreadyOwned = (team.players || []).some(
        (p) => p?.player_id === player?.player_id,
      );

      if (!alreadyOwned) {
        team.purse -= sellBid.amount;
        team.players.push({
          ...player,
          soldPrice: sellBid.amount,
        });
        team.points = (team.points || 0) + (player.points || 0);

        io.to(roomId).emit("playerSold", {
          team,
          player,
          amount: sellBid.amount,
        });
      }
    }
  } else {
    io.to(roomId).emit("playerUnsold", { player });
  }

  setTimeout(() => {
    const latestRoom = rooms[roomId];
    if (!latestRoom || latestRoom.auction.phase !== "running") return;
    if (areAllActiveSquadsCompleted(latestRoom)) {
      latestRoom.auction.resolving = false;
      endAuction(roomId);
      return;
    }
    moveToNextLot(roomId);
  }, LOT_RESULT_DELAY_MS);
};

const handleTimerExpired = (roomId) => {
  const room = rooms[roomId];
  if (!room || room.auction.phase !== "running" || room.auction.paused) return;
  if (room.auction.resolving) return;
  clearRoomTimer(room);

  const winningBid = room.auction.activeBid;
  finalizeCurrentPlayer(roomId, winningBid);
};

const evaluateAutoLotCompletion = (roomId) => {
  const room = rooms[roomId];
  if (!room || room.auction.phase !== "running") return false;
  if (room.auction.paused || room.auction.resolving) return false;

  const participantCount = getActiveParticipantIds(room).size;
  if (participantCount === 0) return false;

  applyAutoLotActions(room);
  emitRoomUpdate(roomId);

  if (!room.auction.activeBid) {
    if (room.auction.skipSet.size >= participantCount) {
      finalizeCurrentPlayer(roomId, null);
      return true;
    }
    return false;
  }

  if (room.auction.withdrawSet.size >= Math.max(0, participantCount - 1)) {
    finalizeCurrentPlayer(roomId, room.auction.activeBid);
    return true;
  }

  return false;
};

const createRoomState = (
  roomId,
  adminSocketId,
  adminPlayerId,
  adminName,
  adminTeam,
) => {
  const room = {
    id: roomId,
    users: {
      [adminSocketId]: {
        playerId: adminPlayerId,
        name: adminName,
        team: adminTeam,
        connected: true,
      },
    },
    teams: teams.map((t) => ({
      ...t,
      owner: null,
      purse: STARTING_PURSE,
      players: [],
      points: 0,
    })),
    admin: adminSocketId,
    auction: {
      started: false,
      phase: "lobby",
      paused: false,
      currentPlayerIndex: 0,
      playerQueue: createShuffledPlayers(),
      currentPlayer: null,
      activeBid: null,
      recentBids: [],
      skipSet: new Set(),
      withdrawSet: new Set(),
      remainingMs: TIMER_DURATION_MS,
      endsAt: null,
      timeout: null,
      tickInterval: null,
      timerVersion: 0,
      resolving: false,
      waitingMusicStartedAt: Date.now(),
      auctionStartSoundAt: null,
      resultsRevealAt: null,
      winnerPopupAt: null,
    },
    pendingDisconnects: {},
  };

  room.auction.currentPlayer = getCurrentPlayer(room);

  room.teams.find((t) => t.id === adminTeam.id).owner = adminSocketId;
  return room;
};

// New endpoint to get all teams
app.get("/teams", (req, res) => {
  res.json(teams);
});

app.get("/rooms/:roomId/teams", (req, res) => {
  const { roomId } = req.params;
  const room = rooms[roomId];
  if (!room) {
    return res.status(404).json([]);
  }
  const takenTeams = room.teams.filter((t) => t.owner).map((t) => t.id);
  const availableTeams = teams.filter((team) => !takenTeams.includes(team.id));
  res.json(availableTeams);
});

io.on("connection", (socket) => {
  console.log("New client connected");

  socket.on("clerkAuth", ({ clerkId, username, email }, ack) => {
    const cleanClerkId = String(clerkId || "").trim();
    const cleanUsername = String(username || "").trim();
    const cleanEmail = String(email || "").trim();

    if (!cleanClerkId || !cleanUsername) {
      if (ack) ack({ ok: false, error: "Invalid Clerk account data" });
      return;
    }

    const existingPlayerId = accountIdByClerkId[cleanClerkId];
    if (existingPlayerId && accountsById[existingPlayerId]) {
      accountsById[existingPlayerId].username = cleanUsername;
      accountsById[existingPlayerId].email = cleanEmail;
      if (ack) {
        ack({
          ok: true,
          playerId: existingPlayerId,
          username: cleanUsername,
        });
      }
      return;
    }

    let playerId = generatePlayerId();
    while (accountsById[playerId]) {
      playerId = generatePlayerId();
    }

    accountsById[playerId] = {
      playerId,
      username: cleanUsername,
      email: cleanEmail,
      clerkId: cleanClerkId,
      authProvider: "clerk",
    };
    accountIdByClerkId[cleanClerkId] = playerId;

    if (ack) ack({ ok: true, playerId, username: cleanUsername });
  });

  socket.on("googleAuth", ({ googleId, username, email }, ack) => {
    const cleanGoogleId = String(googleId || "").trim();
    const cleanUsername = String(username || "").trim();
    const cleanEmail = String(email || "").trim();

    if (!cleanGoogleId || !cleanUsername) {
      if (ack) ack({ ok: false, error: "Invalid Google account data" });
      return;
    }

    const existingPlayerId = accountIdByGoogleId[cleanGoogleId];
    if (existingPlayerId && accountsById[existingPlayerId]) {
      accountsById[existingPlayerId].username = cleanUsername;
      accountsById[existingPlayerId].email = cleanEmail;
      if (ack) {
        ack({
          ok: true,
          playerId: existingPlayerId,
          username: cleanUsername,
        });
      }
      return;
    }

    let playerId = generatePlayerId();
    while (accountsById[playerId]) {
      playerId = generatePlayerId();
    }

    accountsById[playerId] = {
      playerId,
      username: cleanUsername,
      email: cleanEmail,
      googleId: cleanGoogleId,
      authProvider: "google",
    };
    accountIdByGoogleId[cleanGoogleId] = playerId;

    if (ack) ack({ ok: true, playerId, username: cleanUsername });
  });

  socket.on("registerAccount", ({ username, password }, ack) => {
    const cleanUsername = String(username || "").trim();
    const cleanPassword = String(password || "").trim();
    if (!cleanUsername || !cleanPassword) {
      if (ack) ack({ ok: false, error: "Username and password are required" });
      return;
    }

    const key = cleanUsername.toLowerCase();
    if (accountIdByUsername[key]) {
      if (ack) ack({ ok: false, error: "Username already exists" });
      return;
    }

    let playerId = generatePlayerId();
    while (accountsById[playerId]) {
      playerId = generatePlayerId();
    }

    accountsById[playerId] = {
      playerId,
      username: cleanUsername,
      password: cleanPassword,
    };
    accountIdByUsername[key] = playerId;

    if (ack) ack({ ok: true, playerId, username: cleanUsername });
  });

  socket.on("loginAccount", ({ username, password }, ack) => {
    const cleanUsername = String(username || "").trim();
    const cleanPassword = String(password || "").trim();
    const accountId = accountIdByUsername[cleanUsername.toLowerCase()];
    const account = accountId ? accountsById[accountId] : null;

    if (!account || account.password !== cleanPassword) {
      if (ack) ack({ ok: false, error: "Invalid username or password" });
      return;
    }

    if (ack) {
      ack({ ok: true, playerId: account.playerId, username: account.username });
    }
  });

  socket.on("createRoom", (data) => {
    if (!data) return socket.emit("error", "Invalid data");
    const { playerId, teamId } = data;
    const account = accountsById[playerId];
    if (!account) return socket.emit("error", "Please login first");

    const name = account.username;
    const roomId = Math.random().toString(36).substring(2, 8);
    const team = teams.find((t) => t.id === parseInt(teamId));
    if (!team) return socket.emit("error", "Invalid team selected");

    const room = createRoomState(roomId, socket.id, playerId, name, team);
    rooms[roomId] = room;

    socket.join(roomId);
    socket.emit("roomCreated", { roomId, roomState: serializeRoom(room) });
    emitRoomUpdate(roomId);
  });

  socket.on("joinRoom", ({ playerId, roomId, teamId }) => {
    const account = accountsById[playerId];
    if (!account) return socket.emit("error", "Please login first");

    const name = account.username;
    const room = rooms[roomId];
    if (room) {
      const team = teams.find((t) => t.id === parseInt(teamId));
      if (!team) return socket.emit("error", "Invalid team selected");

      if (room.teams.find((t) => t.id === team.id).owner) {
        return socket.emit("error", "Team already taken");
      }

      socket.join(roomId);
      room.users[socket.id] = { playerId, name, team, connected: true };
      room.teams.find((t) => t.id === team.id).owner = socket.id;
      socket.emit("roomJoined", { roomId, roomState: serializeRoom(room) });
      emitRoomUpdate(roomId);
    } else {
      socket.emit("error", "Room not found");
    }
  });

  socket.on("reconnectRoom", ({ roomId, playerId }) => {
    const room = rooms[roomId];
    if (!room || !playerId) return;

    const oldSocketId = Object.keys(room.users).find(
      (sid) => room.users[sid]?.playerId === playerId,
    );

    if (!oldSocketId) return;

    const existingUser = room.users[oldSocketId];
    delete room.users[oldSocketId];
    room.users[socket.id] = { ...existingUser, connected: true };

    if (room.pendingDisconnects[oldSocketId]) {
      clearTimeout(room.pendingDisconnects[oldSocketId]);
      delete room.pendingDisconnects[oldSocketId];
    }

    room.teams.forEach((team) => {
      if (team.owner === oldSocketId) {
        team.owner = socket.id;
      }
    });

    if (room.admin === oldSocketId) {
      room.admin = socket.id;
    }

    socket.join(roomId);
    socket.emit("roomJoined", { roomId, roomState: serializeRoom(room) });
    emitRoomUpdate(roomId);
  });

  socket.on("selectTeam", ({ roomId, teamId }) => {
    const room = rooms[roomId];
    if (!room || !room.users[socket.id]) return;

    const selectedTeam = room.teams.find((t) => t.id === Number(teamId));
    if (!selectedTeam) {
      socket.emit("error", "Invalid team selected");
      return;
    }

    if (selectedTeam.owner && selectedTeam.owner !== socket.id) {
      socket.emit("error", "Team already taken");
      return;
    }

    const alreadyOwnedTeam = room.teams.find(
      (t) => t.owner === socket.id && t.id !== selectedTeam.id,
    );

    if (alreadyOwnedTeam) {
      socket.emit("error", "You can select only one team");
      return;
    }

    selectedTeam.owner = socket.id;
    room.users[socket.id].team = selectedTeam;
    emitRoomUpdate(roomId);
  });

  socket.on("startAuction", (roomId) => {
    const room = rooms[roomId];
    if (!room || room.admin !== socket.id || room.auction.started) return;

    const now = Date.now();
    room.auction.started = true;
    room.auction.phase = "running";
    room.auction.paused = false;
    room.auction.playerQueue = createShuffledPlayers();
    room.auction.currentPlayerIndex = 0;
    room.auction.currentPlayer = getCurrentPlayer(room);
    room.auction.activeBid = null;
    room.auction.recentBids = [];
    room.auction.skipSet.clear();
    room.auction.withdrawSet.clear();
    room.auction.remainingMs = TIMER_DURATION_MS;
    room.auction.waitingMusicStartedAt = null;
    room.auction.auctionStartSoundAt = now + 1200;
    room.auction.resultsRevealAt = null;
    room.auction.winnerPopupAt = null;

    applyAutoLotActions(room);

    emitRoomUpdate(roomId);
    io.to(roomId).emit("auctionStarted", room.auction.currentPlayer);
    const autoResolved = evaluateAutoLotCompletion(roomId);
    if (!autoResolved) {
      startAuctionTimer(roomId, TIMER_DURATION_MS);
    }
  });

  socket.on("stopAuction", (payload) => {
    const roomId = typeof payload === "string" ? payload : payload?.roomId;
    const room = rooms[roomId];
    if (room && room.admin === socket.id && room.auction.started) {
      const liveRemainingMs = Math.max(0, room.auction.endsAt - Date.now());
      const incomingRemainingMs = Number(payload?.remainingMs);
      const remainingMs = Number.isFinite(incomingRemainingMs)
        ? Math.max(0, incomingRemainingMs)
        : liveRemainingMs;

      room.auction.paused = true;
      room.auction.remainingMs = remainingMs;
      clearRoomTimer(room);

      io.to(roomId).emit("auctionPaused", {
        message: "Auction paused by admin",
        remainingMs,
      });
      emitRoomUpdate(roomId);
    }
  });

  socket.on("resumeAuction", (roomId) => {
    const room = rooms[roomId];
    if (room && room.admin === socket.id && room.auction.started) {
      room.auction.paused = false;
      const remainingMs =
        typeof room.auction.remainingMs === "number"
          ? room.auction.remainingMs
          : TIMER_DURATION_MS;

      io.to(roomId).emit("auctionResumed", { remainingMs });
      emitRoomUpdate(roomId);
      startAuctionTimer(roomId, Math.max(1, remainingMs));
    }
  });

  socket.on("endAuctionNow", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.admin !== socket.id) return;
    if (room.auction.phase === "ended") return;

    clearRoomTimer(room);
    endAuction(roomId);
  });

  socket.on("bid", ({ roomId, teamId, amount }) => {
    const room = rooms[roomId];
    if (!room || !room.auction.started || room.auction.phase !== "running")
      return;
    if (room.auction.paused || room.auction.resolving) return;
    if (!room.users[socket.id]) return;

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;

    const numericTeamId = Number(teamId);
    const userTeamId = Number(
      room.users[socket.id]?.team?.id || room.users[socket.id]?.teamId,
    );

    const team = room.teams.find((t) => t.id === numericTeamId);
    if (!team) return;

    const isSocketOwner = team.owner === socket.id;
    const isMappedUserTeam =
      Number.isFinite(userTeamId) && team.id === userTeamId;
    if (!isSocketOwner && !isMappedUserTeam) return;

    if (!isSocketOwner) {
      team.owner = socket.id;
      room.users[socket.id].team = team;
    }

    // Prevent self-outbidding: the team currently leading cannot raise its own bid.
    if (room.auction.activeBid?.teamId === team.id) {
      return;
    }

    const minAllowed = room.auction.activeBid
      ? room.auction.activeBid.amount + MIN_BID_INCREMENT
      : room.auction.currentPlayer?.base_price || 0;

    if ((team.players || []).length >= MAX_SQUAD_PLAYERS) return;

    const normalizeCountry = (value = "") =>
      String(value || "")
        .trim()
        .toLowerCase();
    const isIndianCountry = (value = "") => normalizeCountry(value) === "india";
    const currentPlayer = room.auction.currentPlayer;
    const currentPlayerCountry =
      currentPlayer?.country || currentPlayer?.nationality || "";
    const isCurrentPlayerForeign =
      Boolean(currentPlayer) && !isIndianCountry(currentPlayerCountry);
    const foreignPlayersOwned = (team.players || []).filter((player) => {
      const playerCountry = player?.country || player?.nationality || "";
      return !isIndianCountry(playerCountry);
    }).length;

    if (isCurrentPlayerForeign && foreignPlayersOwned >= MAX_FOREIGN_PLAYERS)
      return;

    if (numericAmount < minAllowed) return;
    if (team.purse < numericAmount) return;

    room.auction.activeBid = {
      teamId: team.id,
      teamName: team.name,
      amount: numericAmount,
      bidderSocketId: socket.id,
      placedAt: Date.now(),
    };

    room.auction.recentBids.push({
      teamId: team.id,
      teamName: team.name,
      amount: numericAmount,
      placedAt: Date.now(),
    });
    if (room.auction.recentBids.length > 5) {
      room.auction.recentBids = room.auction.recentBids.slice(-5);
    }

    room.auction.skipSet.clear();
    room.auction.withdrawSet.clear();
    applyAutoLotActions(room);

    io.to(roomId).emit("newBid", {
      team,
      amount: numericAmount,
    });
    emitRoomUpdate(roomId);
    const autoResolved = evaluateAutoLotCompletion(roomId);
    if (!autoResolved) {
      startAuctionTimer(roomId, TIMER_DURATION_MS);
    }
  });

  socket.on("lotAction", ({ roomId, action }, ack) => {
    const room = rooms[roomId];
    if (!room || !room.auction.started || room.auction.phase !== "running")
      return ack?.({ ok: false });
    if (room.auction.paused || room.auction.resolving)
      return ack?.({ ok: false });
    if (!room.users[socket.id]) return ack?.({ ok: false });

    const userTeamId = Number(
      room.users[socket.id]?.team?.id || room.users[socket.id]?.teamId,
    );

    let team = room.teams.find((t) => t.owner === socket.id);
    if (!team && Number.isFinite(userTeamId)) {
      team = room.teams.find((t) => t.id === userTeamId) || null;
      if (team) {
        team.owner = socket.id;
        room.users[socket.id].team = team;
      }
    }

    if (!team) return ack?.({ ok: false });

    const participantCount = getActiveParticipantIds(room).size;
    if (participantCount === 0) return ack?.({ ok: false });

    const hasBid = Boolean(room.auction.activeBid);
    const normalizedAction = hasBid ? "withdraw" : action;

    if (normalizedAction === "skip" && !hasBid) {
      room.auction.skipSet.add(team.id);
      evaluateAutoLotCompletion(roomId);
      return ack?.({ ok: true });
    }

    if (normalizedAction === "withdraw" && hasBid) {
      if (room.auction.activeBid?.teamId === team.id)
        return ack?.({ ok: false });

      room.auction.withdrawSet.add(team.id);
      evaluateAutoLotCompletion(roomId);
      return ack?.({ ok: true });
    }

    return ack?.({ ok: false });
  });

  socket.on("sellPlayer", ({ roomId, teamId, amount }) => {
    const room = rooms[roomId];
    if (!room || room.admin !== socket.id || room.auction.phase !== "running")
      return;
    if (room.auction.resolving) return;

    const team = room.teams.find((t) => t.id === Number(teamId));
    const numericAmount = Number(amount);
    if (!team || !Number.isFinite(numericAmount) || numericAmount <= 0) return;
    if (team.purse < numericAmount) return;

    clearRoomTimer(room);
    room.auction.activeBid = {
      teamId: team.id,
      amount: numericAmount,
    };
    finalizeCurrentPlayer(roomId, room.auction.activeBid);
  });

  socket.on("nextPlayer", (roomId) => {
    const room = rooms[roomId];
    if (!room || room.admin !== socket.id || room.auction.phase !== "running")
      return;
    clearRoomTimer(room);
    moveToNextLot(roomId);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
    for (const roomId in rooms) {
      if (rooms[roomId].users[socket.id]) {
        const room = rooms[roomId];
        room.users[socket.id].connected = false;

        const timeout = setTimeout(() => {
          const activeRoom = rooms[roomId];
          if (!activeRoom || !activeRoom.users[socket.id]) return;

          delete activeRoom.users[socket.id];
          activeRoom.teams.forEach((team) => {
            if (team.owner === socket.id) {
              team.owner = null;
            }
          });

          if (activeRoom.admin === socket.id) {
            const remainingUserIds = Object.keys(activeRoom.users);
            activeRoom.admin = remainingUserIds[0] || null;
          }

          delete activeRoom.pendingDisconnects[socket.id];

          if (Object.keys(activeRoom.users).length === 0) {
            clearRoomTimer(activeRoom);
            delete rooms[roomId];
          } else {
            emitRoomUpdate(roomId);
          }
        }, DISCONNECT_GRACE_MS);

        room.pendingDisconnects[socket.id] = timeout;
        emitRoomUpdate(roomId);
      }
    }
  });
});

server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
