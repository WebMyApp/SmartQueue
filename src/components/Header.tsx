import React from "react";
import { Ticket, LogOut, Building, ShieldCheck, ArrowLeft, LayoutGrid } from "lucide-react";
import { UserSession } from "../types";

interface HeaderProps {
  currentRole: "portal" | "customer" | "admin" | "super_admin";
  setRole: (role: "portal" | "customer" | "admin" | "super_admin") => void;
  session: UserSession | null;
  onLogout: () => void;
  branchName?: string;
  hideBackButton?: boolean;
}

export default function Header({
  currentRole,
  setRole,
  session,
  onLogout,
  branchName,
  hideBackButton
}: HeaderProps) {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950 sticky top-0 z-50 shadow-lg" id="header-container">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Branding */}
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setRole("portal")}>
          <div className="w-10 h-10 rounded-lg bg-lime-400 flex items-center justify-center text-black border border-lime-300">
            <Ticket className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter italic uppercase underline decoration-lime-450 decoration-2 underline-offset-2 text-white">
              AntrePintar
            </h1>
            <p className="text-[9px] uppercase tracking-[0.15em] text-zinc-500 mt-1 font-mono">
              Smart Real-Time Queue
            </p>
          </div>
        </div>

        {/* Middle Route Navigation: Back to Portal button */}
        {currentRole !== "portal" && !hideBackButton && (
          <div className="flex items-center">
            <button
              id="back-to-portal-btn"
              onClick={() => setRole("portal")}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-850 text-zinc-300 hover:text-white text-xs font-black uppercase tracking-wider transition-all border border-zinc-800 hover:border-zinc-750 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Portal Utama</span>
            </button>
          </div>
        )}

        {/* Right Session Status */}
        <div className="flex items-center space-x-4">
          {session ? (
            <div className="flex items-center space-x-3 pl-3 border-l border-zinc-850">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-black uppercase tracking-tight text-white flex items-center justify-end gap-1">
                  {session.role === "super_admin" ? (
                    <ShieldCheck className="w-3.5 h-3.5 text-lime-400" />
                  ) : (
                    <Building className="w-3.5 h-3.5 text-lime-400" />
                  )}
                  {session.name}
                </p>
                <p className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 mt-0.5">
                  {session.role === "super_admin"
                    ? "Multi-Cabang"
                    : branchName || "Cabang Toko"}
                </p>
              </div>
              <button
                id="btn-logout"
                onClick={onLogout}
                title="Keluar"
                className="p-2 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-zinc-900 transition-colors border border-transparent hover:border-zinc-800"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            currentRole !== "portal" && (
              <span className="text-[10px] uppercase font-mono tracking-wider text-zinc-600 bg-zinc-900 border border-zinc-800/80 px-2.5 py-1.5 rounded-lg">
                Mode Tamu
              </span>
            )
          )}
        </div>
      </div>
    </header>
  );
}
