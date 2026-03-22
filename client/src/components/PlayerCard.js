import React from "react";
import { API_BASE_URL } from "../config";

const PlayerCard = ({ player, highestBid }) => {
  return (
    <div className="bg-slate-900/70 rounded-[2rem] p-6 shadow-xl border border-slate-700 h-full flex flex-col relative overflow-hidden group backdrop-blur-xl">
      {/* Decorative Background Element */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-cyan-500/20 rounded-full blur-3xl opacity-60 group-hover:opacity-90 transition-opacity duration-700"></div>

      <div className="relative z-10 flex flex-col md:flex-row gap-6 items-center mb-6">
        <div className="w-40 h-40 md:w-48 md:h-48 flex-shrink-0 bg-gradient-to-br from-slate-800 to-slate-900 rounded-3xl overflow-hidden border-4 border-slate-700 shadow-2xl transition-transform duration-500 group-hover:scale-[1.02]">
          <img
            src={`${API_BASE_URL}/${player.image_url}`}
            alt={player.player_name}
            className="w-full h-full object-contain p-2"
          />
        </div>

        <div className="flex-1 text-center md:text-left">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-violet-600 text-white text-[10px] font-black uppercase tracking-widest mb-3 shadow-lg shadow-violet-900/40">
            {player.role}
          </div>
          <h2 className="text-3xl md:text-4xl font-black text-slate-100 leading-tight mb-1 tracking-tight">
            {player.player_name}
          </h2>
          <p className="text-slate-400 font-bold text-sm uppercase tracking-wider">
            {player.team_name}
          </p>

          <div className="mt-5 flex flex-wrap gap-3 justify-center md:justify-start">
            <div className="bg-slate-800 px-4 py-2 rounded-2xl border border-slate-700 shadow-sm">
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">
                Base Price
              </p>
              <p className="text-lg font-black text-slate-100">₹ 20L</p>
            </div>
            {highestBid && (
              <div className="bg-emerald-500/10 px-4 py-2 rounded-2xl border border-emerald-500/30 shadow-sm animate-pulse">
                <p className="text-[9px] text-emerald-300 font-black uppercase tracking-tighter">
                  Current Bid
                </p>
                <p className="text-lg font-black text-emerald-200">
                  ₹ {(highestBid.amount / 100000).toFixed(0)}L
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-4 mt-auto">
        <div className="bg-slate-800/70 backdrop-blur-sm rounded-2xl p-4 border border-slate-700 shadow-inner">
          <h3 className="text-[10px] font-black text-cyan-200 uppercase tracking-[0.2em] mb-4 flex items-center">
            <span className="w-1.5 h-3 bg-cyan-400 rounded-sm mr-2"></span>
            Batting
          </h3>
          <div className="grid grid-cols-3 gap-y-3 gap-x-2">
            <StatItem label="Inns" value={player.batting_stats.innings} />
            <StatItem label="Runs" value={player.batting_stats.runs_scored} />
            <StatItem label="SR" value={player.batting_stats.strike_rate} />
            <StatItem label="Avg" value={player.batting_stats.average || "-"} />
            <StatItem label="HS" value={player.batting_stats.highest_score} />
            <StatItem
              label="6s/4s"
              value={`${player.batting_stats.sixes}/${player.batting_stats.fours}`}
            />
          </div>
        </div>

        <div className="bg-slate-800/70 backdrop-blur-sm rounded-2xl p-4 border border-slate-700 shadow-inner">
          <h3 className="text-[10px] font-black text-rose-200 uppercase tracking-[0.2em] mb-4 flex items-center">
            <span className="w-1.5 h-3 bg-rose-400 rounded-sm mr-2"></span>
            Bowling
          </h3>
          <div className="grid grid-cols-3 gap-y-3 gap-x-2">
            <StatItem label="Wkts" value={player.bowling_stats.wickets_taken} />
            <StatItem
              label="Econ"
              value={player.bowling_stats.economy || "-"}
            />
            <StatItem label="Avg" value={player.bowling_stats.average || "-"} />
            <StatItem
              label="Catches"
              value={player.fielding_stats.catches_taken}
            />
            <StatItem label="Stump" value={player.fielding_stats.stumpings} />
            <StatItem label="RunOut" value={player.fielding_stats.run_outs} />
          </div>
        </div>
      </div>

      {highestBid && (
        <div className="relative z-10 mt-5 p-4 bg-gradient-to-r from-violet-600 to-cyan-500 rounded-2xl shadow-2xl shadow-cyan-900/40 flex items-center justify-between text-white overflow-hidden group/bid">
          <div className="absolute top-0 left-0 w-full h-full bg-white/5 -translate-x-full group-hover/bid:translate-x-0 transition-transform duration-500"></div>
          <div className="flex items-center space-x-3 relative z-10">
            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md border border-white/10">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
            </div>
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-100/90">
                Leading Bidder
              </p>
              <p className="font-black text-lg leading-tight tracking-tight">
                {highestBid.team.name}
              </p>
            </div>
          </div>
          <div className="text-right relative z-10">
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-100/90">
              Bid Amount
            </p>
            <p className="font-black text-2xl leading-none">
              ₹ {(highestBid.amount / 100000).toFixed(0)}L
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

const StatItem = ({ label, value }) => (
  <div className="flex flex-col">
    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter mb-0.5">
      {label}
    </p>
    <p className="text-xs font-black text-slate-100 tracking-tight">{value}</p>
  </div>
);

export default PlayerCard;
