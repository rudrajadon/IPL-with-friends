import React, { useState, useEffect, useRef } from "react";
import { audioUrl, fileUrl } from "../config";
import "./Lobby.css";

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

const Lobby = ({ socket, room, initialRoomState }) => {
  const [roomState, setRoomState] = useState(initialRoomState);
  const waitingAudioCtxRef = useRef(null);
  const waitingAudioBufferRef = useRef(null);
  const waitingAudioSourceRef = useRef(null);
  const waitingAudioGainRef = useRef(null);
  const waitingAudioLoadingPromiseRef = useRef(null);
  const waitingLoopBoundsRef = useRef({ start: 0, end: null });

  useEffect(() => {
    const cleanup = installGlobalAudioUnlock();
    return cleanup;
  }, []);

  const ensureWaitingAudioContext = () => {
    if (waitingAudioCtxRef.current) return waitingAudioCtxRef.current;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;

    const ctx = new Ctx();
    waitingAudioCtxRef.current = ctx;

    const gain = ctx.createGain();
    gain.gain.value = 0.45;
    gain.connect(ctx.destination);
    waitingAudioGainRef.current = gain;

    return ctx;
  };

  const stopWaitingMusic = () => {
    const source = waitingAudioSourceRef.current;
    if (source) {
      try {
        source.stop();
      } catch {
        // no-op
      }
      waitingAudioSourceRef.current = null;
    }
  };

  const ensureWaitingBuffer = async () => {
    if (waitingAudioBufferRef.current) return waitingAudioBufferRef.current;
    if (waitingAudioLoadingPromiseRef.current) {
      return waitingAudioLoadingPromiseRef.current;
    }

    const ctx = ensureWaitingAudioContext();
    if (!ctx) return null;

    waitingAudioLoadingPromiseRef.current = fetch(audioUrl("ipl-waiting.mp3"))
      .then((res) => res.arrayBuffer())
      .then((arr) => ctx.decodeAudioData(arr))
      .then((buffer) => {
        waitingAudioBufferRef.current = buffer;

        const detectLoopBounds = () => {
          const primary = buffer.getChannelData(0);
          if (!primary || primary.length === 0) {
            return { start: 0, end: buffer.duration };
          }

          const threshold = 0.002;
          let first = -1;
          let last = -1;

          for (let i = 0; i < primary.length; i += 1) {
            if (Math.abs(primary[i]) > threshold) {
              first = i;
              break;
            }
          }

          for (let i = primary.length - 1; i >= 0; i -= 1) {
            if (Math.abs(primary[i]) > threshold) {
              last = i;
              break;
            }
          }

          if (first < 0 || last < 0 || last <= first) {
            return { start: 0, end: buffer.duration };
          }

          const margin = 0.01;
          const start = Math.max(0, first / buffer.sampleRate - margin);
          const end = Math.min(
            buffer.duration,
            last / buffer.sampleRate + margin,
          );

          if (end - start < 1) {
            return { start: 0, end: buffer.duration };
          }

          return { start, end };
        };

        waitingLoopBoundsRef.current = detectLoopBounds();
        waitingAudioLoadingPromiseRef.current = null;
        return buffer;
      })
      .catch(() => {
        waitingAudioLoadingPromiseRef.current = null;
        return null;
      });

    return waitingAudioLoadingPromiseRef.current;
  };

  const resumeContextWithRetry = (ctx, onResumed) => {
    if (!ctx || ctx.state !== "suspended") {
      onResumed();
      return;
    }

    const retry = () => {
      window.removeEventListener("pointerdown", retry);
      window.removeEventListener("keydown", retry);
      window.removeEventListener("touchstart", retry);
      ctx
        .resume()
        .then(onResumed)
        .catch(() => {
          // no-op
        });
    };

    window.addEventListener("pointerdown", retry, { once: true });
    window.addEventListener("keydown", retry, { once: true });
    window.addEventListener("touchstart", retry, { once: true });

    ctx
      .resume()
      .then(onResumed)
      .catch(() => {
        // Wait for user gesture listeners above.
      });
  };

  const playWaitingMusicSynced = async (startAt) => {
    if (!Number.isFinite(startAt)) return;

    const ctx = ensureWaitingAudioContext();
    if (!ctx) return;

    const buffer = await ensureWaitingBuffer();
    if (!buffer) return;

    const startPlayback = () => {
      stopWaitingMusic();

      const bounds = waitingLoopBoundsRef.current || {
        start: 0,
        end: buffer.duration,
      };
      const loopStart = Math.max(
        0,
        Math.min(bounds.start || 0, buffer.duration - 0.1),
      );
      const loopEnd = Math.max(
        loopStart + 0.1,
        Math.min(
          Number.isFinite(bounds.end) ? bounds.end : buffer.duration,
          buffer.duration,
        ),
      );
      const loopLength = Math.max(0.1, loopEnd - loopStart);

      const elapsedSeconds = Math.max(0, (Date.now() - startAt) / 1000);
      const loopOffset = elapsedSeconds % loopLength;
      const sourceOffset = loopStart + loopOffset;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = loopStart;
      source.loopEnd = loopEnd;
      source.connect(waitingAudioGainRef.current || ctx.destination);
      source.start(0, sourceOffset);
      waitingAudioSourceRef.current = source;
    };

    resumeContextWithRetry(ctx, startPlayback);
  };

  useEffect(() => {
    const handleRoomUpdate = (updatedRoom) => {
      setRoomState(updatedRoom);
    };

    socket.on("updateRoom", handleRoomUpdate);

    return () => {
      socket.off("updateRoom", handleRoomUpdate);
    };
  }, [socket]);

  useEffect(() => {
    setRoomState(initialRoomState);
  }, [initialRoomState]);

  useEffect(() => {
    const startedAt = Number(roomState?.waitingMusicStartedAt);
    const isInLobby = !roomState?.auctionStarted;

    if (isInLobby && Number.isFinite(startedAt)) {
      playWaitingMusicSynced(startedAt);
    } else {
      stopWaitingMusic();
    }

    return () => {
      stopWaitingMusic();
    };
  }, [roomState?.auctionStarted, roomState?.waitingMusicStartedAt]);

  useEffect(
    () => () => {
      stopWaitingMusic();
      const ctx = waitingAudioCtxRef.current;
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {
          // no-op
        });
      }
    },
    [],
  );

  const selectTeam = (teamId) => {
    const team = roomState.teams.find((t) => t.id === teamId);
    const status = deriveTeamStatus(team);
    if (status !== "available") return;
    socket.emit("selectTeam", { roomId: room, teamId });
  };

  const startAuction = () => {
    socket.emit("startAuction", room);
  };

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(room);
    } catch (err) {
      console.error("Failed to copy room code", err);
    }
  };

  if (!roomState) {
    return <div>Loading...</div>;
  }

  const safeTeams = Array.isArray(roomState.teams) ? roomState.teams : [];
  const roomCode = typeof room === "string" ? room.toUpperCase() : "------";

  const participants = Object.entries(roomState.users || {});
  const allParticipantsPickedTeam =
    participants.length > 0 &&
    participants.every(([, user]) => Boolean(user.team));
  const canStartAuction =
    participants.length >= 2 &&
    allParticipantsPickedTeam &&
    !roomState.auctionStarted;
  const assignedTeams = safeTeams.filter((team) => Boolean(team.owner)).length;
  const totalSlots = safeTeams.length || 8;

  const deriveTeamStatus = (team) => {
    if (!team.owner) return "available";
    if (team.owner === socket.id) return "yours";
    return "taken";
  };

  const getOwnerName = (team) => {
    if (!team.owner) return "Unassigned";
    if (team.owner === socket.id) return "You";
    return roomState.users?.[team.owner]?.name || "Unknown";
  };

  return (
    <div className="lobby-page">
      <div className="lobby-container">
        <header className="lobby-header glass-card">
          <div className="header-title">
            <img src={fileUrl("ipl.png")} alt="IPL" className="logo-image" />
            <div>
              <h1 className="title">
                Auction Room <span className="highlight">Lobby.</span>
              </h1>
              <p className="subtitle">Plan your squad before the first bid.</p>
            </div>
          </div>

          <div className="room-stats">
            <button
              className="stat-box"
              onClick={copyRoomCode}
              title="Copy room code"
            >
              <span className="stat-label">Room Code</span>
              <span className="stat-value highlight-text">{roomCode}</span>
            </button>
            {/* <div className="stat-box">
              <span className="stat-label">Users</span>
              <span className="stat-value">{participants.length}</span>
            </div> */}
            <div className="stat-box">
              <span className="stat-label">Assigned</span>
              <span className="stat-value">
                {assignedTeams}/{totalSlots}
              </span>
            </div>
          </div>
        </header>

        <main className="lobby-grid">
          <section className="teams-section glass-card">
            <h2 className="section-title">Franchise Owners</h2>
            <div className="teams-grid">
              {safeTeams.map((team) => {
                const status = deriveTeamStatus(team);
                const ownerName = getOwnerName(team);

                return (
                  <div
                    key={team.id}
                    className={`team-card ${status === "yours" ? "selected" : ""}`}
                  >
                    <div className="team-info">
                      <div className="team-avatar">{team.id}</div>
                      <div>
                        <h3 className="team-name">{team.name}</h3>
                        <p className="team-owner">
                          {status === "yours" ? (
                            <span className="highlight-text">
                              Owned by: You
                            </span>
                          ) : (
                            `Owned by: ${ownerName}`
                          )}
                        </p>
                      </div>
                    </div>
                    {status === "yours" && (
                      <span className="feature-tag active-tag">YOURS</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="sidebar-section">
            <div className="admin-card glass-card">
              <h2 className="section-title">Admin Controls</h2>
              <p className="admin-desc">
                {participants.length < 2
                  ? "Need at least 2 participants to start."
                  : !allParticipantsPickedTeam
                    ? "Everyone must select a franchise before starting."
                    : roomState.auctionStarted
                      ? "Auction already started."
                      : "Start the auction when ready!"}
              </p>
              <button
                className={`btn btn-primary ${!canStartAuction ? "disabled-btn" : ""}`}
                onClick={startAuction}
                disabled={!canStartAuction || roomState.admin !== socket.id}
              >
                {roomState.admin === socket.id
                  ? canStartAuction
                    ? "Enter Auction Room"
                    : "Waiting for Participants..."
                  : "Waiting for Host..."}
              </button>
            </div>

            <div className="rules-card glass-card">
              <h2 className="section-title">Auction Rules</h2>
              <ul className="rules-list">
                <li>
                  Every franchise begins with a strict mega-auction purse of
                  ₹100 Crores. Spend it wisely.
                </li>
                <li>
                  Control the room by raising bids by 25L, 50L, or 1Cr at any
                  point during a player's time under the hammer.
                </li>
                <li>
                  You must build a complete roster of exactly 15 players. Your
                  squad must contain a minimum of 4 Batsmen, 4 Bowlers, and 1
                  Wicketkeeper. You can have a maximum of 6 overseas players.
                </li>
                <li>
                  Every player carries a point value based on current form and
                  past records.
                </li>
              </ul>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default Lobby;
