import React, { useState } from "react";
import { UserSession, Branch } from "../types";
import { ShieldCheck, Building, Key, Mail, Sparkles, Loader2 } from "lucide-react";
import { db } from "../lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

interface LoginFormProps {
  branches: Branch[];
  onLoginSuccess: (session: UserSession) => void;
}

export default function LoginForm({ branches, onLoginSuccess }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const trimmedEmail = email.trim().toLowerCase();

    // Direct Login validations for demo profiles
    if (trimmedEmail === "super@antrepintar.com" && password === "super123") {
      onLoginSuccess({
        uid: "demo_super_admin",
        email: "super@antrepintar.com",
        role: "super_admin",
        name: "Yudi Prahara (Super Admin)"
      });
      setLoading(false);
      return;
    } else if (trimmedEmail === "admin.pusat@antrepintar.com" && password === "admin123") {
      const targetBranch = branches[0];
      onLoginSuccess({
        uid: "demo_branch_admin_1",
        email: "admin.pusat@antrepintar.com",
        role: "admin",
        branchId: targetBranch ? targetBranch.id : "",
        name: "Hendra Wijaya (Admin Cabang)"
      });
      setLoading(false);
      return;
    }

    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", trimmedEmail));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        let matchedUser: any = null;
        querySnapshot.forEach((doc) => {
          const u = doc.data();
          if (u.password === password) {
            matchedUser = {
              uid: doc.id,
              email: u.email,
              role: u.role || "admin",
              branchId: u.branchId || "",
              name: u.name || "Staf Toko"
            };
          }
        });

        if (matchedUser) {
          onLoginSuccess(matchedUser);
          setLoading(false);
          return;
        }
      }

      setError("Email atau Password salah! Periksa kembali akun Anda.");
    } catch (err: any) {
      console.error("Login error:", err);
      setError("Gagal menghubungkan ke server otentikasi. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 bg-zinc-900 rounded-3xl border border-zinc-800 shadow-2xl p-8 space-y-6" id="login-form-root">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 bg-zinc-950 border border-zinc-805 text-lime-400 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
          <Key className="w-6 h-6 stroke-[2.5]" />
        </div>
        <h2 className="text-xl font-black text-white uppercase tracking-tight">Akses Panel Administrator</h2>
        <p className="text-xs text-zinc-500 font-medium">Gunakan kredensial admin toko Anda untuk mengelola panggilan loket.</p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-black uppercase tracking-wider flex items-start gap-2">
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Email Kantor</label>
          <div className="relative">
            <Mail className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
            <input
              id="login-email-input"
              type="email"
              required
              placeholder="admin@antrepintar.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 text-sm font-bold text-white placeholder-zinc-700 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Password</label>
          <div className="relative">
            <Key className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
            <input
              id="login-password-input"
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 text-sm font-bold text-white placeholder-zinc-700 focus:outline-none"
            />
          </div>
        </div>

        <button
          id="btn-login-submit"
          type="submit"
          disabled={loading}
          className="w-full py-3.5 bg-lime-400 hover:bg-lime-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg border border-lime-300 disabled:border-transparent cursor-pointer flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Memproses...</span>
            </>
          ) : (
            <span>Masuk Sekarang</span>
          )}
        </button>
      </form>
    </div>
  );
}
