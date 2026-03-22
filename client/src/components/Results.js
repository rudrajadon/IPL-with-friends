import React, { useEffect, useMemo, useRef, useState } from "react";
import { audioUrl, fileUrl } from "../config";
import "./Results.css";

const WINNER_POPUP_DELAY_MS = 0;

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

const formatCr = (amount = 0) =>
  `₹ ${(Number(amount || 0) / 10000000).toFixed(2)} Cr`;

const getNormalizedRole = (role = "") => String(role || "").toLowerCase();

const getRoleCounts = (players = []) => {
  return players.reduce(
    (acc, player) => {
      const role = getNormalizedRole(player?.role);
      if (role.includes("wicket") || role.includes("wk")) acc.wk += 1;
      if (role.includes("bowl")) acc.bowler += 1;
      if (role.includes("bat")) acc.batsman += 1;
      return acc;
    },
    { batsman: 0, bowler: 0, wk: 0 },
  );
};

const evaluateTeamRules = (team) => {
  const players = team?.players || [];
  const counts = getRoleCounts(players);
  const failures = [];

  if (players.length !== 15) failures.push("15 member squad completed");
  if (counts.batsman < 4) failures.push("4 batsman minimum");
  if (counts.bowler < 4) failures.push("4 bowler minimum");
  if (counts.wk < 1) failures.push("1 wk minimum");

  return {
    isQualified: failures.length === 0,
    failures,
    counts,
    squadSize: players.length,
  };
};

const Results = ({ room, initialRoomState }) => {
  const [showWinnerPopup, setShowWinnerPopup] = useState(false);
  const [winnerPopupClosed, setWinnerPopupClosed] = useState(false);
  const [winnerRevealed, setWinnerRevealed] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const winnerThemeAudioRef = useRef(null);
  const lastWinnerThemePlayedForRef = useRef(null);
  const winnerRetryCleanupRef = useRef(null);
  const teams = initialRoomState?.teams || [];
  const winnerPopupAt = Number(initialRoomState?.winnerPopupAt);

  const processed = useMemo(() => {
    const active = [...teams]
      .filter((team) => Boolean(team.owner))
      .map((team) => ({
        ...team,
        _evaluation: evaluateTeamRules(team),
      }));

    const qualified = active
      .filter((team) => team._evaluation.isQualified)
      .sort((a, b) => {
        const pointDiff = (b.points || 0) - (a.points || 0);
        if (pointDiff !== 0) return pointDiff;
        return (b.purse || 0) - (a.purse || 0);
      });

    const disqualified = active
      .filter((team) => !team._evaluation.isQualified)
      .sort((a, b) => {
        const pointDiff = (b.points || 0) - (a.points || 0);
        if (pointDiff !== 0) return pointDiff;
        return (b.purse || 0) - (a.purse || 0);
      });

    return {
      qualified,
      disqualified,
      rankedTeams: [...qualified, ...disqualified],
    };
  }, [teams]);

  const winner = processed.qualified[0];

  const closeSquadModal = () => setSelectedTeam(null);

  const handleBackToHome = () => {
    if (winnerThemeAudioRef.current) {
      winnerThemeAudioRef.current.pause();
      try {
        winnerThemeAudioRef.current.currentTime = 0;
      } catch {
        // no-op
      }
    }
    if (winnerRetryCleanupRef.current) {
      winnerRetryCleanupRef.current();
      winnerRetryCleanupRef.current = null;
    }
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  useEffect(() => {
    const cleanup = installGlobalAudioUnlock();
    return cleanup;
  }, []);

  const resolveWinnerThemeFile = (team) => {
    const key = String(team?.name || "")
      .trim()
      .toLowerCase();

    const map = {
      csk: "csk.mp3",
      mi: "mi.mp3",
      rcb: "rcb.mp3",
      kkr: "kkr.mp3",
      srh: "srh.mp3",
      rr: "rr.mp3",
      kxip: "kxip.mp3",
      dd: "dd.mp3",
    };

    return map[key] || null;
  };

  const ensureWinnerAudio = (track) => {
    if (!track) return null;
    if (!winnerThemeAudioRef.current) {
      if (window.__auctionWinnerAudio) {
        winnerThemeAudioRef.current = window.__auctionWinnerAudio;
      } else {
        winnerThemeAudioRef.current = new Audio();
        winnerThemeAudioRef.current.preload = "auto";
        winnerThemeAudioRef.current.volume = 0.75;
      }
    }

    const audio = winnerThemeAudioRef.current;
    const expectedSrc = audioUrl(track);
    if (audio.src !== expectedSrc) {
      audio.src = expectedSrc;
    }
    audio.preload = "auto";
    audio.volume = 0.75;
    return audio;
  };

  const playWinnerTheme = (winnerTeam) => {
    if (!winnerTeam) return;

    if (lastWinnerThemePlayedForRef.current === winnerTeam.id) return;
    const track = resolveWinnerThemeFile(winnerTeam);
    if (!track) return;

    const audio = ensureWinnerAudio(track);
    if (!audio) return;
    try {
      audio.currentTime = 0;
    } catch {
      // no-op
    }

    if (winnerRetryCleanupRef.current) {
      winnerRetryCleanupRef.current();
      winnerRetryCleanupRef.current = null;
    }

    audio.play().catch(() => {
      const retry = (event) => {
        const target = event?.target;
        if (
          target?.closest?.(".winner-popup-close") ||
          target?.closest?.(".winner-popup-rankings-btn")
        ) {
          return;
        }

        audio
          .play()
          .then(() => {
            if (winnerRetryCleanupRef.current) {
              winnerRetryCleanupRef.current();
              winnerRetryCleanupRef.current = null;
            }
          })
          .catch(() => {
            // keep listening for next valid gesture while popup is open
          });
      };

      const cleanup = () => {
        window.removeEventListener("pointerdown", retry, true);
        window.removeEventListener("keydown", retry, true);
        window.removeEventListener("touchstart", retry, true);
      };

      window.addEventListener("pointerdown", retry, true);
      window.addEventListener("keydown", retry, true);
      window.addEventListener("touchstart", retry, true);
      winnerRetryCleanupRef.current = cleanup;
    });

    lastWinnerThemePlayedForRef.current = winnerTeam.id;
  };

  const revealWinnerPopup = () => {
    setWinnerRevealed(false);
    setShowWinnerPopup(true);
  };

  const handleRevealWinner = () => {
    if (!winner) return;
    setWinnerRevealed(true);
    playWinnerTheme(winner);
  };

  useEffect(
    () => () => {
      if (winnerRetryCleanupRef.current) {
        winnerRetryCleanupRef.current();
        winnerRetryCleanupRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (showWinnerPopup && !winnerPopupClosed) return;
    if (winnerRetryCleanupRef.current) {
      winnerRetryCleanupRef.current();
      winnerRetryCleanupRef.current = null;
    }
  }, [showWinnerPopup, winnerPopupClosed]);

  useEffect(() => {
    setShowWinnerPopup(false);
    setWinnerPopupClosed(false);
    setWinnerRevealed(false);
    if (!winner) return undefined;

    const popupAt = Number.isFinite(winnerPopupAt)
      ? winnerPopupAt
      : Date.now() + WINNER_POPUP_DELAY_MS;
    const delay = Math.max(0, popupAt - Date.now());

    if (delay <= 0) {
      revealWinnerPopup();
      return undefined;
    }

    const timeout = setTimeout(() => {
      revealWinnerPopup();
    }, delay);

    return () => clearTimeout(timeout);
  }, [winner?.id, winnerPopupAt]);

  useEffect(() => {
    if (!winner) return;
    const track = resolveWinnerThemeFile(winner);
    if (!track) return;

    const audio = ensureWinnerAudio(track);
    if (!audio) return;
    audio.load();
  }, [winner]);

  useEffect(() => {
    if (!selectedTeam) return;
    const fresh = (processed.rankedTeams || []).find(
      (team) => team.id === selectedTeam.id,
    );
    if (!fresh) {
      setSelectedTeam(null);
      return;
    }
    setSelectedTeam(fresh);
  }, [processed.rankedTeams, selectedTeam]);

  return (
    <div className="results-page">
      {showWinnerPopup && !winnerPopupClosed && winner && (
        <div className="winner-popup-overlay">
          <div className="winner-popup-card">
            <button
              className="winner-popup-close"
              onClick={(e) => {
                e.stopPropagation();
                setWinnerPopupClosed(true);
              }}
              aria-label="Close winner popup"
            >
              ×
            </button>
            <div className="winner-popup-body">
              <div
                className={`winner-popup-phase winner-popup-ready-wrap ${
                  winnerRevealed ? "is-hidden" : "is-visible"
                }`}
              >
                <div className="winner-popup-title">Results Ready</div>
                <div className="winner-popup-subtitle">
                  Tap below to reveal the champion
                </div>
                <button
                  className="winner-popup-rankings-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRevealWinner();
                  }}
                >
                  Show Result
                </button>
              </div>

              <div
                className={`winner-popup-phase winner-popup-reveal-wrap ${
                  winnerRevealed ? "is-visible" : "is-hidden"
                }`}
              >
                <div className="winner-popup-title">Winner!</div>
                <div className="winner-popup-subtitle">
                  Champions of the Auction
                </div>
                <div className="winner-popup-logo-wrap">
                  <img
                    src={
                      winner.logo ? fileUrl(winner.logo) : fileUrl("ipl.png")
                    }
                    alt={`${winner.name} logo`}
                    className="winner-popup-logo"
                    onError={(e) => {
                      if (!e.currentTarget.dataset.fallbackTried) {
                        e.currentTarget.dataset.fallbackTried = "true";
                        e.currentTarget.src = winner.logo
                          ? `/logos/${winner.logo}`
                          : fileUrl("ipl.png");
                      }
                    }}
                  />
                </div>
                <div className="winner-popup-team">{winner.name}</div>
                <div className="winner-popup-points">
                  {winner.points || 0} pts
                </div>
                <button
                  className="winner-popup-rankings-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setWinnerPopupClosed(true);
                  }}
                >
                  Show Rankings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="results-card">
        <div className="results-header">
          <button className="results-back-btn" onClick={handleBackToHome}>
            ← Back to Home
          </button>
          <div className="results-brand-row">
            <img
              src={fileUrl("ipl.png")}
              alt="IPL"
              className="results-brand-logo"
            />
            <span className="results-brand-text">Auction Control Center</span>
          </div>
          <p className="results-room">Room: {(room || "").toUpperCase()}</p>
          <h1 className="results-title">
            Auction <span className="results-title-highlight">Results</span>
          </h1>
          {winner ? (
            <p className="results-winner">Winner: {winner.name}</p>
          ) : (
            <p className="results-winner">No qualified winner</p>
          )}
        </div>

        <div className="results-table-wrap">
          <table className="results-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Team</th>
                <th>Status</th>
                <th>Points</th>
                <th>Players</th>
                <th>Purse Left</th>
                <th>Failed Rules</th>
              </tr>
            </thead>
            <tbody>
              {processed.rankedTeams.map((team, index) => {
                const isQualified = team._evaluation.isQualified;
                const rank = isQualified
                  ? processed.qualified.findIndex((t) => t.id === team.id) + 1
                  : null;

                return (
                  <tr
                    key={team.id}
                    className={`${index === 0 && isQualified ? "first-place" : ""} ${!isQualified ? "disqualified-row" : ""} results-row-clickable`}
                    onClick={() => setSelectedTeam(team)}
                    title="Click to view squad"
                  >
                    <td>{isQualified ? `#${rank}` : "DQ"}</td>
                    <td>
                      <span className="team-clickable-name">{team.name}</span>
                    </td>
                    <td>
                      {isQualified ? (
                        <span className="status-chip qualified">Qualified</span>
                      ) : (
                        <span className="status-chip disqualified">
                          Disqualified
                        </span>
                      )}
                    </td>
                    <td>{team.points || 0}</td>
                    <td>{(team.players || []).length}</td>
                    <td>{formatCr(team.purse || 0)}</td>
                    <td className="failed-rules-cell">
                      {isQualified ? "—" : team._evaluation.failures.join(", ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selectedTeam && (
        <div className="squad-modal-overlay" onClick={closeSquadModal}>
          <div
            className="squad-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="squad-modal-close"
              onClick={closeSquadModal}
              aria-label="Close squad details"
            >
              ×
            </button>
            <div className="squad-modal-header">
              <div>
                <h3 className="squad-modal-title">{selectedTeam.name} Squad</h3>
                <p className="squad-modal-subtitle">
                  {(selectedTeam.players || []).length} players •{" "}
                  {selectedTeam.points || 0} pts •{" "}
                  {formatCr(selectedTeam.purse || 0)}
                </p>
              </div>
              {selectedTeam.logo && (
                <img
                  src={fileUrl(selectedTeam.logo)}
                  alt={`${selectedTeam.name} logo`}
                  className="squad-modal-team-logo"
                  onError={(e) => {
                    if (!e.currentTarget.dataset.fallbackTried) {
                      e.currentTarget.dataset.fallbackTried = "true";
                      e.currentTarget.src = `/logos/${selectedTeam.logo}`;
                    }
                  }}
                />
              )}
            </div>

            <div className="squad-list-wrap">
              {(selectedTeam.players || []).length === 0 ? (
                <div className="squad-empty">No players purchased.</div>
              ) : (
                <table className="squad-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Player</th>
                      <th>Role</th>
                      <th>Country</th>
                      <th>Price</th>
                      <th>Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedTeam.players || []).map((player, idx) => (
                      <tr
                        key={`${player.player_id || player.player_name}-${idx}`}
                      >
                        <td>{idx + 1}</td>
                        <td>{player.player_name || "Unknown"}</td>
                        <td>{player.role || "—"}</td>
                        <td>{player.country || player.nationality || "—"}</td>
                        <td>{formatCr(player.soldPrice || 0)}</td>
                        <td>{player.points || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Results;
