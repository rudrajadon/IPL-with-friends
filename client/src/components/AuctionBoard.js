import React, { useState, useEffect, useRef } from "react";
import { audioUrl, fileUrl } from "../config";
import "./AuctionRoom.css";

const installGlobalAudioUnlock = () => {
  if (typeof window === "undefined") return () => {};
  if (window.__auctionAudioUnlocked) return () => {};

  let removed = false;

  const cleanup = () => {
    if (removed) return;
    removed = true;
    window.removeEventListener("pointerdown", tryUnlock);
    window.removeEventListener("keydown", tryUnlock);
    window.removeEventListener("touchstart", tryUnlock);
  };

  const tryUnlock = () => {
    if (window.__auctionAudioUnlocked) {
      cleanup();
      return;
    }

    const probe = new Audio(audioUrl("ipl-start.mp3"));
    probe.muted = true;
    probe
      .play()
      .then(() => {
        probe.pause();
        try {
          probe.currentTime = 0;
        } catch {
          // no-op
        }
        window.__auctionAudioUnlocked = true;
        cleanup();
      })
      .catch(() => {
        // wait for next gesture
      });
  };

  window.addEventListener("pointerdown", tryUnlock);
  window.addEventListener("keydown", tryUnlock);
  window.addEventListener("touchstart", tryUnlock);

  return cleanup;
};

const AuctionBoard = ({ socket, room, initialRoomState }) => {
  const [roomState, setRoomState] = useState(initialRoomState);
  const [currentPlayer, setCurrentPlayer] = useState(
    initialRoomState?.currentPlayer || null,
  );
  const [highestBid, setHighestBid] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [isPaused, setIsPaused] = useState(initialRoomState?.paused || false);
  const [pauseMessage, setPauseMessage] = useState("");
  const [expandedTeamId, setExpandedTeamId] = useState(null);
  const [copiedRoom, setCopiedRoom] = useState(false);
  const [lotActionLoading, setLotActionLoading] = useState(false);
  const [recentBids, setRecentBids] = useState(
    initialRoomState?.recentBids || [],
  );
  const [lotResultPopup, setLotResultPopup] = useState(null);
  const [pendingLotResult, setPendingLotResult] = useState(null);
  const [pendingNextPlayer, setPendingNextPlayer] = useState(null);
  const [isQuickTimerReset, setIsQuickTimerReset] = useState(false);
  const lotResultPopupRef = useRef(null);
  const pendingLotResultRef = useRef(null);
  const currentPlayerRef = useRef(initialRoomState?.currentPlayer || null);
  const quickResetTimeoutRef = useRef(null);
  const popupStartTimeoutRef = useRef(null);
  const lotActionTimeoutRef = useRef(null);
  const previousTimeRef = useRef(
    typeof initialRoomState?.timerSeconds === "number"
      ? initialRoomState.timerSeconds
      : null,
  );
  const auctionStartAudioRef = useRef(null);
  const lastAuctionStartPlayedAtRef = useRef(null);

  useEffect(() => {
    const cleanup = installGlobalAudioUnlock();
    return cleanup;
  }, []);

  const playWithRetryOnGesture = (audio) => {
    if (!audio) return;
    audio.play().catch(() => {
      const retry = () => {
        document.removeEventListener("pointerdown", retry);
        document.removeEventListener("keydown", retry);
        audio.play().catch(() => {});
      };

      document.addEventListener("pointerdown", retry, { once: true });
      document.addEventListener("keydown", retry, { once: true });
    });
  };

  function formatCr(amount = 0) {
    return `₹ ${(amount / 10000000).toFixed(2)} Cr`;
  }

  useEffect(() => {
    lotResultPopupRef.current = lotResultPopup;
  }, [lotResultPopup]);

  useEffect(() => {
    pendingLotResultRef.current = pendingLotResult;
  }, [pendingLotResult]);

  useEffect(() => {
    currentPlayerRef.current = currentPlayer;
  }, [currentPlayer]);

  useEffect(() => {
    if (typeof timeLeft !== "number") return undefined;

    const previous = previousTimeRef.current;
    previousTimeRef.current = timeLeft;

    if (typeof previous !== "number") return undefined;
    if (timeLeft <= previous) return undefined;

    setIsQuickTimerReset(true);
    if (quickResetTimeoutRef.current) {
      clearTimeout(quickResetTimeoutRef.current);
    }
    quickResetTimeoutRef.current = setTimeout(() => {
      setIsQuickTimerReset(false);
      quickResetTimeoutRef.current = null;
    }, 220);

    return undefined;
  }, [timeLeft]);

  useEffect(
    () => () => {
      if (quickResetTimeoutRef.current) {
        clearTimeout(quickResetTimeoutRef.current);
      }
      if (popupStartTimeoutRef.current) {
        clearTimeout(popupStartTimeoutRef.current);
      }
      if (lotActionTimeoutRef.current) {
        clearTimeout(lotActionTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const startAt = Number(roomState?.auctionStartSoundAt);
    if (!Number.isFinite(startAt)) return;
    if (lastAuctionStartPlayedAtRef.current === startAt) return;

    if (!auctionStartAudioRef.current) {
      auctionStartAudioRef.current = new Audio(audioUrl("ipl-start.mp3"));
      auctionStartAudioRef.current.preload = "auto";
      auctionStartAudioRef.current.volume = 0.7;
    }

    const audio = auctionStartAudioRef.current;
    const fire = () => {
      lastAuctionStartPlayedAtRef.current = startAt;
      try {
        audio.currentTime = 0;
      } catch {
        // no-op
      }
      playWithRetryOnGesture(audio);
    };

    const delay = Math.max(0, startAt - Date.now());
    const timer = setTimeout(fire, delay);
    return () => clearTimeout(timer);
  }, [roomState?.auctionStartSoundAt]);

  useEffect(() => {
    const handleRoomUpdate = (updatedRoom) => {
      setRoomState(updatedRoom);
      setLotActionLoading(false);
      const nextFromRoom = updatedRoom.currentPlayer || null;
      const activePopup =
        lotResultPopupRef.current || pendingLotResultRef.current;
      const shownPlayerId = currentPlayerRef.current?.player_id;
      const nextPlayerId = nextFromRoom?.player_id;

      if (activePopup && shownPlayerId !== nextPlayerId) {
        setPendingNextPlayer(nextFromRoom);
      } else {
        setCurrentPlayer(nextFromRoom);
      }
      if (activePopup) {
        setTimeLeft(0);
      } else {
        setTimeLeft(
          typeof updatedRoom?.timerSeconds === "number"
            ? updatedRoom.timerSeconds
            : null,
        );
      }
      if (Array.isArray(updatedRoom?.recentBids)) {
        setRecentBids(updatedRoom.recentBids);
      }
      if (updatedRoom?.activeBid) {
        const bidTeam = (updatedRoom.teams || []).find(
          (team) => team.id === updatedRoom.activeBid.teamId,
        );
        setHighestBid(
          bidTeam
            ? {
                team: bidTeam,
                amount: updatedRoom.activeBid.amount,
              }
            : null,
        );
      } else {
        setHighestBid(null);
      }

      if (typeof updatedRoom.paused === "boolean") {
        setIsPaused(updatedRoom.paused);
        if (updatedRoom.paused) {
          setPauseMessage("Auction paused by admin");
        }
      }
    };

    const handleNextPlayer = (player) => {
      setLotActionLoading(false);
      if (lotResultPopupRef.current || pendingLotResultRef.current) {
        setPendingNextPlayer(player || null);
        return;
      }
      setCurrentPlayer(player || null);
      setHighestBid(null);
      setRecentBids([]);
    };

    const handleNewBid = (bid) => {
      setHighestBid(bid);
      setRecentBids((prev) => {
        const next = [
          ...prev,
          {
            teamId: bid?.team?.id,
            teamName: bid?.team?.name,
            amount: bid?.amount,
            placedAt: Date.now(),
          },
        ];
        return next.slice(-5);
      });
    };

    const handleAuctionTick = (payload) => {
      if (lotResultPopupRef.current || pendingLotResultRef.current) {
        setTimeLeft(0);
        return;
      }
      if (typeof payload?.seconds === "number") {
        setTimeLeft(payload.seconds);
      }
    };

    const handleAuctionPaused = (payload) => {
      const message =
        typeof payload === "string"
          ? payload
          : payload?.message || "Auction paused by admin";
      const sharedRemainingMs =
        typeof payload === "object" && typeof payload?.remainingMs === "number"
          ? Math.max(0, payload.remainingMs)
          : Math.max(0, ((timeLeft ?? 15) - 0.1) * 1000);

      setIsPaused(true);
      setPauseMessage(message);
      setTimeLeft(Math.ceil(sharedRemainingMs / 1000));
    };

    const handleAuctionResumed = () => {
      setIsPaused(false);
      setPauseMessage("");
    };

    const handlePlayerSold = ({ team, player, amount }) => {
      setLotActionLoading(false);
      setTimeLeft(0);
      setPendingLotResult({
        type: "sold",
        playerName: player?.player_name || "Player",
        teamName: team?.name || "Team",
        teamLogo: team?.logo || null,
        amount: Number(amount) || 0,
      });
    };

    const handlePlayerUnsold = ({ player }) => {
      setLotActionLoading(false);
      setTimeLeft(0);
      setPendingLotResult({
        type: "unsold",
        playerName: player?.player_name || "Player",
      });
    };

    socket.on("updateRoom", handleRoomUpdate);
    socket.on("nextPlayer", handleNextPlayer);
    socket.on("newBid", handleNewBid);
    socket.on("auctionTick", handleAuctionTick);
    socket.on("auctionPaused", handleAuctionPaused);
    socket.on("auctionResumed", handleAuctionResumed);
    socket.on("playerSold", handlePlayerSold);
    socket.on("playerUnsold", handlePlayerUnsold);

    return () => {
      socket.off("updateRoom", handleRoomUpdate);
      socket.off("nextPlayer", handleNextPlayer);
      socket.off("newBid", handleNewBid);
      socket.off("auctionTick", handleAuctionTick);
      socket.off("auctionPaused", handleAuctionPaused);
      socket.off("auctionResumed", handleAuctionResumed);
      socket.off("playerSold", handlePlayerSold);
      socket.off("playerUnsold", handlePlayerUnsold);
    };
  }, [socket]);

  useEffect(() => {
    if (!pendingLotResult) return undefined;
    if (timeLeft !== 0) return undefined;

    if (popupStartTimeoutRef.current) {
      clearTimeout(popupStartTimeoutRef.current);
    }

    popupStartTimeoutRef.current = setTimeout(() => {
      setLotResultPopup(pendingLotResult);
      setPendingLotResult(null);
      popupStartTimeoutRef.current = null;
    }, 1050);

    return () => {
      if (popupStartTimeoutRef.current) {
        clearTimeout(popupStartTimeoutRef.current);
      }
    };
  }, [pendingLotResult, timeLeft]);

  useEffect(() => {
    if (!lotResultPopup) return undefined;
    const timeout = setTimeout(() => {
      setLotResultPopup(null);
    }, 3000);
    return () => clearTimeout(timeout);
  }, [lotResultPopup]);

  useEffect(() => {
    if (lotResultPopup || pendingLotResult || !pendingNextPlayer) return;
    setCurrentPlayer(pendingNextPlayer);
    setHighestBid(null);
    setRecentBids([]);
    setPendingNextPlayer(null);
  }, [lotResultPopup, pendingLotResult, pendingNextPlayer]);

  useEffect(() => {
    setRoomState(initialRoomState);
    const incomingPlayer = initialRoomState?.currentPlayer || null;
    const activePopup =
      lotResultPopupRef.current || pendingLotResultRef.current;
    const shownPlayerId = currentPlayerRef.current?.player_id;
    const incomingPlayerId = incomingPlayer?.player_id;

    if (activePopup && shownPlayerId !== incomingPlayerId) {
      setPendingNextPlayer(incomingPlayer);
    } else {
      setCurrentPlayer(incomingPlayer);
    }
    setIsPaused(Boolean(initialRoomState?.paused));
    if (activePopup) {
      setTimeLeft(0);
    } else {
      setTimeLeft(
        typeof initialRoomState?.timerSeconds === "number"
          ? initialRoomState.timerSeconds
          : null,
      );
    }
    if (Array.isArray(initialRoomState?.recentBids)) {
      setRecentBids(initialRoomState.recentBids);
    }
    if (initialRoomState?.activeBid) {
      const bidTeam = (initialRoomState.teams || []).find(
        (team) => team.id === initialRoomState.activeBid.teamId,
      );
      setHighestBid(
        bidTeam
          ? {
              team: bidTeam,
              amount: initialRoomState.activeBid.amount,
            }
          : null,
      );
    } else {
      setHighestBid(null);
    }
  }, [initialRoomState]);

  const resolveMyTeam = () => {
    const byOwner = roomState?.teams?.find((t) => t.owner === socket.id);
    if (byOwner) return byOwner;

    const userTeamId = Number(
      roomState?.users?.[socket.id]?.team?.id ||
        roomState?.users?.[socket.id]?.teamId,
    );

    if (Number.isFinite(userTeamId)) {
      return roomState?.teams?.find((t) => t.id === userTeamId) || null;
    }

    return null;
  };

  const placeBid = (amount) => {
    const team = resolveMyTeam();
    if (!team) {
      console.warn("Cannot place bid: no team mapped for current socket");
      return;
    }
    socket.emit("bid", { roomId: room, teamId: team.id, amount });
  };

  const placeOpeningBid = () => {
    if (highestBid || !currentPlayer) return;
    const openingAmount = Number(currentPlayer.base_price) || 0;
    if (openingAmount <= 0) return;
    placeBid(openingAmount);
  };

  const sellPlayer = () => {
    if (highestBid) {
      socket.emit("sellPlayer", {
        roomId: room,
        teamId: highestBid.team.id,
        amount: highestBid.amount,
      });
    }
  };

  const pauseAuction = () => {
    setIsPaused(true);
    socket.emit("stopAuction", { roomId: room });
  };

  const resumeAuction = () => {
    setIsPaused(false);
    socket.emit("resumeAuction", room);
  };

  const endAuctionNow = () => {
    if (!room || !isAdmin) return;
    const confirmed = window.confirm(
      "Are you sure you want to end the auction now? This action will immediately move everyone to results.",
    );
    if (!confirmed) return;
    socket.emit("endAuctionNow", { roomId: room });
  };

  const handleLotAction = () => {
    if (!room || lotActionLoading) return;
    const action = highestBid ? "withdraw" : "skip";
    setLotActionLoading(true);
    if (lotActionTimeoutRef.current) {
      clearTimeout(lotActionTimeoutRef.current);
    }

    socket.emit("lotAction", { roomId: room, action }, () => {
      setLotActionLoading(false);
      if (lotActionTimeoutRef.current) {
        clearTimeout(lotActionTimeoutRef.current);
        lotActionTimeoutRef.current = null;
      }
    });

    lotActionTimeoutRef.current = setTimeout(() => {
      setLotActionLoading(false);
      lotActionTimeoutRef.current = null;
    }, 1200);
  };

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(room || "");
      setCopiedRoom(true);
      setTimeout(() => setCopiedRoom(false), 1200);
    } catch (err) {
      console.error("Failed to copy room code", err);
    }
  };

  if (!roomState) {
    return <div>Loading...</div>;
  }

  const isAdmin = roomState?.admin === socket.id;
  const auctionActive = !isPaused;
  const hasActiveBid = Boolean(highestBid);
  const displayedBid = highestBid?.amount ?? currentPlayer?.base_price ?? 0;
  const highestBidderName = highestBid?.team?.name ?? "Unknown Team";
  const highestBidLogo = highestBid?.team?.logo || null;
  const playerImageRaw =
    currentPlayer?.image ||
    currentPlayer?.photo ||
    currentPlayer?.img ||
    currentPlayer?.player_image ||
    currentPlayer?.image_url ||
    "";
  const defaultAvatarSrc = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    currentPlayer?.player_name || "Player",
  )}&background=334155&color=ffffff&size=256`;
  const playerImageSrc = playerImageRaw
    ? /^https?:\/\//i.test(String(playerImageRaw))
      ? String(playerImageRaw)
      : `${fileUrl(encodeURI(String(playerImageRaw)))}`
    : defaultAvatarSrc;
  const playerInitials = (currentPlayer?.player_name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
  const visibleRecentBids =
    recentBids.length > 0
      ? recentBids
      : highestBid
        ? [
            {
              teamName: highestBid?.team?.name,
              amount: highestBid?.amount,
              placedAt: Date.now(),
            },
          ]
        : [];
  const displayedRecentBids = [...visibleRecentBids].slice(-5).reverse();
  const emptyRecentBidSlots = Math.max(0, 5 - displayedRecentBids.length);
  const timerPercent =
    timeLeft !== null ? Math.min(100, Math.max(0, (timeLeft / 15) * 100)) : 0;

  const myTeam = resolveMyTeam();
  const isHighestBidder = Boolean(
    highestBid && myTeam && highestBid.team?.id === myTeam.id,
  );
  const normalizeCountry = (value = "") =>
    String(value || "")
      .trim()
      .toLowerCase();
  const isIndianCountry = (value = "") => normalizeCountry(value) === "india";
  const myForeignPlayersCount = (myTeam?.players || []).filter((player) => {
    const playerCountry = player?.country || player?.nationality || "";
    return !isIndianCountry(playerCountry);
  }).length;
  const currentPlayerCountry =
    currentPlayer?.country || currentPlayer?.nationality || "";
  const isCurrentPlayerForeign =
    Boolean(currentPlayer) && !isIndianCountry(currentPlayerCountry);
  const hasReachedForeignLimit =
    isCurrentPlayerForeign && myForeignPlayersCount >= 6;
  const hasCompletedSquad = (myTeam?.players || []).length >= 15;
  const myTeamPurse = Number(myTeam?.purse) || 0;
  const openingAmount = Number(currentPlayer?.base_price) || 0;
  const nextBid25 = (highestBid?.amount || 0) + 2500000;
  const nextBid50 = (highestBid?.amount || 0) + 5000000;
  const nextBid100 = (highestBid?.amount || 0) + 10000000;

  const canBidCommon = Boolean(currentPlayer) && !isPaused && Boolean(myTeam);
  const canPlaceOpeningBid =
    canBidCommon && openingAmount > 0 && openingAmount <= myTeamPurse;
  const canBid25 = canBidCommon && hasActiveBid && nextBid25 <= myTeamPurse;
  const canBid50 = canBidCommon && hasActiveBid && nextBid50 <= myTeamPurse;
  const canBid100 = canBidCommon && hasActiveBid && nextBid100 <= myTeamPurse;

  const activeTeams = (roomState.teams || []).filter((t) => Boolean(t.owner));
  const participantCount = roomState?.participantCount || activeTeams.length;
  const skipCount = roomState?.skipCount || 0;
  const withdrawCount = roomState?.withdrawCount || 0;
  const lotActionLabel = highestBid ? "Withdraw" : "Skip";

  const rankedTeams = [...activeTeams].sort(
    (a, b) => (b.points || 0) - (a.points || 0),
  );
  let lastPoints = null;
  let lastRank = 0;
  const rankedWithPositions = rankedTeams.map((team, idx) => {
    const currentPoints = team.points || 0;
    if (idx === 0) {
      lastRank = 1;
      lastPoints = currentPoints;
      return { ...team, _rank: lastRank };
    }

    if (currentPoints === lastPoints) {
      return { ...team, _rank: lastRank };
    }

    lastRank = idx + 1;
    lastPoints = currentPoints;
    return { ...team, _rank: lastRank };
  });

  const toggleTeamExpansion = (teamId) => {
    setExpandedTeamId((prev) => (prev === teamId ? null : teamId));
  };

  const getRoleDotClass = (role = "") => {
    const normalized = String(role).toLowerCase();
    if (normalized.includes("all")) return "role-dot allrounder";
    if (normalized.includes("wk") || normalized.includes("wicket")) {
      return "role-dot wk";
    }
    if (normalized.includes("bowl")) return "role-dot bowler";
    return "role-dot batsman";
  };

  return (
    <div className="auction-page">
      {roomState?.phase === "ended" && (
        <div className="auction-ended-overlay">
          <div className="auction-ended-modal">
            <div className="auction-ended-brand-row">
              <img
                src={fileUrl("ipl.png")}
                alt="IPL"
                className="auction-ended-logo"
              />
              <span className="auction-ended-brand-text">
                Auction Control Center
              </span>
            </div>
            <div className="auction-ended-title">
              Auction <span className="auction-ended-highlight">Ended</span>
            </div>
            <div className="auction-ended-subtitle">
              Final standings are being prepared...
            </div>
            <div className="auction-ended-chip">Redirecting to Results</div>
          </div>
        </div>
      )}
      {lotResultPopup && (
        <div className="lot-result-overlay">
          <div className={`lot-result-toast ${lotResultPopup.type}`}>
            {lotResultPopup.type === "sold" ? (
              <>
                <div className="lot-result-title">SOLD</div>
                <div className="lot-result-team-logo-wrap">
                  <img
                    src={
                      lotResultPopup.teamLogo
                        ? fileUrl(lotResultPopup.teamLogo)
                        : fileUrl("ipl.png")
                    }
                    alt={lotResultPopup.teamName || "Winning team logo"}
                    className="lot-result-team-logo"
                    onError={(e) => {
                      if (!e.currentTarget.dataset.fallbackTried) {
                        e.currentTarget.dataset.fallbackTried = "true";
                        e.currentTarget.src = lotResultPopup.teamLogo
                          ? `/logos/${lotResultPopup.teamLogo}`
                          : fileUrl("ipl.png");
                      }
                    }}
                  />
                </div>
                <div className="lot-result-amount-label">Sold at</div>
                <div className="lot-result-amount-value">
                  {formatCr(lotResultPopup.amount || 0)}
                </div>
              </>
            ) : (
              <div className="lot-result-title">UNSOLD</div>
            )}
          </div>
        </div>
      )}
      {isPaused && (
        <div className="pause-overlay">
          <div className="pause-modal">
            <div className="pause-icon-wrap">
              <div className="pause-icon-pulse" />
              <div className="pause-icon-core">
                <svg
                  className="pause-icon-svg"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
            <h3 className="pause-title">Auction Paused</h3>
            <p className="pause-subtitle">
              {pauseMessage ||
                "Admin has paused the auction. Please wait for it to resume."}
            </p>
            <div className="pause-actions">
              <div className="pause-timer-pill">
                Resumes from 00:{String(timeLeft ?? 15).padStart(2, "0")}
              </div>
              {isAdmin && (
                <button onClick={resumeAuction} className="pause-resume-btn">
                  Resume Auction
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="auction-container">
        {/* Header */}
        <header className="auction-header glass-card">
          <div className="header-title">
            <img src={fileUrl("ipl.png")} alt="IPL" className="logo-image" />
            <div>
              <h1 className="title">
                War Room <span className="highlight">Live.</span>
              </h1>
            </div>
          </div>
          <div className="room-stats">
            <button
              className="stat-box compact copy-room-btn"
              onClick={copyRoomCode}
              title="Copy room code"
            >
              <span className="stat-label">Room</span>
              <span className="stat-value highlight-text small-code">
                {copiedRoom ? "Copied" : room}
              </span>
            </button>
            {isAdmin && (
              <>
                <button
                  className={`nav-action ${!auctionActive ? "resume" : ""}`}
                  onClick={auctionActive ? pauseAuction : resumeAuction}
                >
                  {auctionActive ? "Stop" : "Resume"}
                </button>
                <button
                  className="nav-action end-now"
                  onClick={endAuctionNow}
                  disabled={roomState?.phase === "ended"}
                >
                  End Auction
                </button>
              </>
            )}
          </div>
        </header>

        {/* Main 3-Column Layout */}
        <main className="auction-grid">
          {/* Center Column: Arena & Controls */}
          <section className="center-panel">
            {/* Player Arena & Timer */}
            <div className="player-arena glass-card">
              {/* Player Info */}
              {currentPlayer ? (
                <div className="active-player-info">
                  <div className="player-main-row">
                    <div
                      className={`player-image-wrap ${playerImageSrc ? "" : "no-image"}`}
                    >
                      {playerImageSrc ? (
                        <img
                          src={playerImageSrc}
                          alt={currentPlayer.player_name}
                          className="player-image"
                          onError={(e) => {
                            if (!e.currentTarget.dataset.fallbackTried) {
                              e.currentTarget.dataset.fallbackTried = "true";
                              e.currentTarget.src = defaultAvatarSrc;
                              return;
                            }
                            e.currentTarget.parentElement?.classList.add(
                              "no-image",
                            );
                          }}
                        />
                      ) : null}
                      <div className="player-image-fallback">
                        {playerInitials}
                      </div>
                    </div>

                    <div className="player-content-main">
                      <div className="player-name-row">
                        <h2 className="player-name">
                          {currentPlayer.player_name}
                        </h2>
                      </div>

                      <div className="player-meta-inline">
                        <span className="player-meta-item">
                          {currentPlayer.role || "Unknown Role"}
                        </span>
                        <span className="player-meta-dot">•</span>
                        <span className="player-meta-item">
                          {currentPlayer.country ||
                            currentPlayer.nationality ||
                            "Unknown Country"}
                        </span>
                        <span className="player-meta-dot">•</span>
                        <span className="player-meta-item">
                          Base: {formatCr(currentPlayer.base_price)}
                        </span>
                      </div>
                    </div>

                    <div className="player-points-chip">
                      <span className="player-points-value">
                        {currentPlayer.points || 0}
                      </span>
                      <span className="player-points-unit">PTS</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="active-player-info">
                  <h2 className="player-name">Awaiting Player</h2>
                  <div className="player-tags">
                    <span className="feature-tag">Auction not started</span>
                  </div>
                </div>
              )}

              <div className="main-bid-and-history">
                <div className="current-bid-display">
                  <div className="current-bid-main">
                    <div className="current-bid-text">
                      <span className="bid-label">
                        {hasActiveBid ? "Current Bid" : "Base Price"}
                      </span>
                      <span className="bid-amount">
                        {formatCr(displayedBid)}
                      </span>
                      <span
                        className={`bid-winner ${isHighestBidder ? "leading" : ""}`}
                      >
                        {hasActiveBid
                          ? isHighestBidder
                            ? "You are leading!"
                            : `Team: ${highestBidderName}`
                          : "NO BIDS"}
                      </span>
                    </div>
                    <div className="current-bid-logo-wrap">
                      {highestBidLogo ? (
                        <img
                          src={fileUrl(highestBidLogo)}
                          alt="Highest bidder logo"
                          className="current-bid-logo"
                          onError={(e) => {
                            if (!e.currentTarget.dataset.fallbackTried) {
                              e.currentTarget.dataset.fallbackTried = "true";
                              e.currentTarget.src = `/logos/${highestBidLogo}`;
                              return;
                            }
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <img
                          src={fileUrl("ipl.png")}
                          alt="IPL logo"
                          className="current-bid-logo"
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="recent-bids-panel recent-bids-main-right">
                  <div className="recent-bids-head">
                    <div className="recent-bids-title">Last Bids</div>
                  </div>

                  <div className="recent-bids-list">
                    {displayedRecentBids.map((bid, index) => (
                      <div
                        key={`${bid.teamId || bid.team?.id || "team"}-${bid.amount}-${bid.placedAt || index}`}
                        className="recent-bid-row"
                      >
                        <span className="recent-bid-team">
                          {bid.teamName || bid.team?.name || "Unknown Team"}
                        </span>
                        <span className="recent-bid-amount">
                          {formatCr(Number(bid.amount) || 0)}
                        </span>
                      </div>
                    ))}

                    {Array.from({ length: emptyRecentBidSlots }).map(
                      (_, index) => (
                        <div
                          key={`recent-empty-${index}`}
                          className="recent-bid-row empty"
                          aria-hidden="true"
                        >
                          <span className="recent-bid-team"></span>
                          <span className="recent-bid-amount"></span>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Timer just above bidding panel */}
            <div className="glass-card timer-wrapper static-timer">
              <div className="timer-display">
                {isPaused
                  ? "PAUSED"
                  : timeLeft !== null
                    ? `00:${timeLeft.toString().padStart(2, "0")}`
                    : "--"}
              </div>
              <div className="timer-bar-container">
                <div
                  className={`timer-bar-fill ${
                    timeLeft <= 5 ? "danger" : timeLeft <= 10 ? "warning" : ""
                  }`}
                  style={{
                    width: `${timerPercent}%`,
                    transition: isQuickTimerReset
                      ? "width 0.22s ease-out, background-color 0.3s ease"
                      : "width 1s linear, background-color 0.3s ease",
                  }}
                ></div>
              </div>
            </div>

            {/* Bidding Controls */}
            <div className="bidding-controls glass-card">
              <h3 className="section-title">Bidding Arena</h3>
              <div className="bidding-buttons">
                {hasCompletedSquad ? (
                  <div className="squad-completed-warning">
                    Squad completed!
                  </div>
                ) : hasReachedForeignLimit ? (
                  <div className="foreign-limit-warning">
                    You can only buy 6 foreign players
                  </div>
                ) : hasActiveBid ? (
                  <>
                    <button
                      className="btn bid-btn"
                      onClick={() => placeBid(nextBid25)}
                      disabled={!canBid25}
                    >
                      + 25 L
                    </button>
                    <button
                      className="btn bid-btn"
                      onClick={() => placeBid(nextBid50)}
                      disabled={!canBid50}
                    >
                      + 50 L
                    </button>
                    <button
                      className="btn bid-btn-primary"
                      onClick={() => placeBid(nextBid100)}
                      disabled={!canBid100}
                    >
                      + 1 Cr
                    </button>
                  </>
                ) : (
                  <button
                    className="btn bid-btn-primary bid-btn-opening"
                    onClick={placeOpeningBid}
                    disabled={!canPlaceOpeningBid}
                  >
                    Bid
                  </button>
                )}
                <div className="bid-actions-inline">
                  <button
                    className="btn bid-action-btn bid-action-btn-danger"
                    onClick={handleLotAction}
                    disabled={!currentPlayer || isPaused || isHighestBidder}
                  >
                    {lotActionLoading ? "Please wait..." : lotActionLabel}
                    <div className="bid-action-meta">
                      {highestBid
                        ? `Withdrawn ${withdrawCount}/${Math.max(
                            1,
                            participantCount - 1,
                          )}`
                        : `Skipped ${skipCount}/${Math.max(1, participantCount)}`}
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Right Column: Live Standings */}
          <aside className="side-panel glass-card standings-panel">
            <h2 className="section-title">Live Standings</h2>
            <div className="standings-list">
              {rankedWithPositions.map((team) => (
                <div
                  key={team.id}
                  className="standing-item"
                  onClick={() => toggleTeamExpansion(team.id)}
                >
                  <div className="standing-team-info">
                    <div className="team-avatar-small">#{team._rank}</div>
                    <div className="standing-team-main">
                      <div className="standing-head-row">
                        <h4 className="standing-name">{team.name}</h4>
                        <div className="standing-head-right">
                          <span className="standing-expand-indicator">
                            {expandedTeamId === team.id ? "▾" : "▸"}
                          </span>
                        </div>
                      </div>
                      <div className="standing-summary">
                        Purse: {formatCr(team.purse)}
                      </div>
                    </div>
                  </div>
                  {expandedTeamId === team.id && team.players.length > 0 && (
                    <div className="standing-expanded-wrap">
                      <div className="team-player-list">
                        {team.players.map((player) => (
                          <div
                            key={`${team.id}-${player.player_id}`}
                            className="team-player-row"
                          >
                            <div className="team-player-left">
                              <span className={getRoleDotClass(player.role)} />
                              <span className="team-player-name">
                                {player.player_name}
                              </span>
                            </div>
                            <div className="team-player-right">
                              <span className="team-player-points">
                                {player.points || 0} pts
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="standing-points-rail">
                    <div className="team-points-badge">
                      {team.points || 0} pts
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default AuctionBoard;
