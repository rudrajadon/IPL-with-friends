import React from "react";
import { fileUrl } from "../config";

const TeamStats = ({ teams }) => {
  return (
    <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar h-full">
      {teams.map((team) => (
        <div
          key={team.id}
          className={`flex items-center justify-between p-3 rounded-2xl border transition-all duration-300 ${
            team.owner
              ? "bg-slate-800/70 border-slate-700 shadow-sm"
              : "bg-slate-900/60 border-dashed border-slate-700 opacity-70 scale-95"
          }`}
        >
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-slate-900 rounded-xl p-1.5 flex items-center justify-center border border-slate-700 shadow-inner group overflow-hidden">
              <img
                src={fileUrl(team.logo)}
                alt={team.name}
                className="w-full h-full object-contain transition-transform duration-500 hover:scale-110"
              />
            </div>
            <div>
              <p className="text-[11px] font-black text-slate-100 leading-none mb-1 uppercase tracking-tight">
                {team.name}
              </p>
              <div className="flex items-center space-x-2">
                <span className="w-1 h-1 bg-cyan-300 rounded-full"></span>
                <p className="text-[9px] font-bold text-cyan-300 uppercase tracking-tighter">
                  {team.players.length} Players
                </p>
              </div>
            </div>
          </div>

          <div className="text-right">
            <p className="text-[8px] text-slate-400 font-black uppercase tracking-tighter mb-0.5">
              Purse
            </p>
            <p
              className={`text-[13px] font-black leading-none ${team.purse < 100000000 ? "text-rose-300" : "text-slate-100"}`}
            >
              ₹ {(team.purse / 10000000).toFixed(1)}Cr
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TeamStats;
