import React, { useEffect, useState } from "react";
import { audioUrl, fileUrl } from "../config";
import "./ResultsWaiting.css";

const WAIT_SECONDS = 15;

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

const isQualifiedTeam = (team) => {
  const players = team?.players || [];
  const counts = getRoleCounts(players);
  return (
    players.length === 15 &&
    counts.batsman >= 4 &&
    counts.bowler >= 4 &&
    counts.wk >= 1
  );
};

const getWinnerTrack = (roomState) => {
  const teams = roomState?.teams || [];
  const active = teams.filter((team) => Boolean(team.owner));
  const qualified = active
    .filter((team) => isQualifiedTeam(team))
    .sort((a, b) => {
      const pointsDiff = (b.points || 0) - (a.points || 0);
      if (pointsDiff !== 0) return pointsDiff;
      return (b.purse || 0) - (a.purse || 0);
    });

  const winner = qualified[0];
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

  const key = String(winner?.name || "")
    .trim()
    .toLowerCase();
  return map[key] || null;
};

const ResultsWaiting = ({ room, revealAt, roomState }) => {
  const [secondsLeft, setSecondsLeft] = useState(WAIT_SECONDS);

  useEffect(() => {
    const revealTs = Number(revealAt);
    const getRemaining = () => {
      if (!Number.isFinite(revealTs)) return WAIT_SECONDS;
      return Math.max(0, Math.ceil((revealTs - Date.now()) / 1000));
    };

    setSecondsLeft(getRemaining());
    const interval = setInterval(() => {
      setSecondsLeft(getRemaining());
    }, 1000);

    return () => clearInterval(interval);
  }, [revealAt]);

  useEffect(() => {
    const track = getWinnerTrack(roomState);
    if (!track) return;

    if (!window.__auctionWinnerAudio) {
      window.__auctionWinnerAudio = new Audio();
      window.__auctionWinnerAudio.preload = "auto";
      window.__auctionWinnerAudio.volume = 0.75;
    }

    const audio = window.__auctionWinnerAudio;
    const src = audioUrl(track);
    if (audio.src !== src) {
      audio.src = src;
    }
    audio.load();
  }, [roomState]);

  return (
    <div className="results-wait-page">
      <div className="results-wait-card">
        {/* <div className="results-wait-logo-row">
          <img
            src={fileUrl("ipl.png")}
            alt="IPL"
            className="results-wait-logo"
          />
          <span className="results-wait-badge">Official Results Desk</span>
        </div> */}

        <p className="results-wait-room">Room: {(room || "").toUpperCase()}</p>
        <h1 className="results-wait-title">Results are being finalized</h1>
        <p className="results-wait-subtitle">
          Please standby while rankings and winner announcement are prepared.
        </p>

        <div className="results-wait-timer-wrap">
          <div className="results-wait-timer">{secondsLeft}s</div>
          <div className="results-wait-timer-label">Time Remaining</div>
        </div>

        <div className="results-wait-progress">
          <div
            className="results-wait-progress-fill"
            style={{ width: `${((15 - secondsLeft) / 15) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default ResultsWaiting;
