import React, { useState, useEffect } from "react";
import { db } from "./lib/firebase";
import { collection, onSnapshot, addDoc, query, orderBy } from "firebase/firestore";
import { Branch, UserSession } from "./types";
import Header from "./components/Header";
import CustomerPanel from "./components/CustomerPanel";
import AdminDashboard from "./components/AdminDashboard";
import SuperAdminDashboard from "./components/SuperAdminDashboard";
import LoginForm from "./components/LoginForm";
import { 
  Building, 
  ShieldCheck, 
  Ticket, 
  Users, 
  Layers, 
  AlertCircle, 
  Sliders, 
  ArrowRight, 
  Sparkles,
  Tv,
  Copy,
  Check,
  ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  // Read initial role from URL query param ?mode=kiosk|operator|super or localStorage
  const [currentRole, setRoleState] = useState<"portal" | "customer" | "admin" | "super_admin">(() => {
    const params = new URLSearchParams(window.location.search);
    const modeParam = params.get("mode");
    if (modeParam === "kiosk" || modeParam === "customer") return "customer";
    if (modeParam === "operator" || modeParam === "admin") return "admin";
    if (modeParam === "super" || modeParam === "super_admin") return "super_admin";
    
    const savedMode = localStorage.getItem("app_current_mode");
    if (savedMode === "customer" || savedMode === "admin" || savedMode === "super_admin") {
      return savedMode as any;
    }
    return "portal";
  });

  const setRole = (role: "portal" | "customer" | "admin" | "super_admin") => {
    setRoleState(role);
    localStorage.setItem("app_current_mode", role);
    
    // Update the URL without reloading to reflect the current active screen
    const url = new URL(window.location.href);
    if (role === "portal") {
      url.searchParams.delete("mode");
    } else {
      const modeMap = {
        customer: "kiosk",
        admin: "operator",
        super_admin: "super"
      };
      url.searchParams.set("mode", modeMap[role]);
    }
    window.history.pushState({}, "", url.toString());
  };

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const modeParam = params.get("mode");
      if (modeParam === "kiosk" || modeParam === "customer") {
        setRoleState("customer");
      } else if (modeParam === "operator" || modeParam === "admin") {
        setRoleState("admin");
      } else if (modeParam === "super" || modeParam === "super_admin") {
        setRoleState("super_admin");
      } else {
        setRoleState("portal");
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const [copiedKey, setCopiedKey] = useState<string>("");

  const handleCopyLink = (mode: string) => {
    const baseLink = window.location.origin + window.location.pathname;
    const fullLink = `${baseLink}?mode=${mode}`;
    navigator.clipboard.writeText(fullLink)
      .then(() => {
        setCopiedKey(mode);
        setTimeout(() => setCopiedKey(""), 2000);
      })
      .catch(err => console.error("Gagal menyalin link:", err));
  };

  // Authentication session
  const [session, setSession] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem("admin_session");
    return saved ? JSON.parse(saved) : null;
  });

  // Operator setup configuration (for password-less operator entry)
  const [operatorBranchId, setOperatorBranchId] = useState<string>("");
  const [operatorCounterNum, setOperatorCounterNum] = useState<number>(1);
  const [tempOperatorName, setTempOperatorName] = useState<string>("");

  // Fetch branches and seed if empty
  useEffect(() => {
    const branchesRef = collection(db, "branches");
    const q = query(branchesRef, orderBy("createdAt", "asc"));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const list: Branch[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: doc.id,
          name: data.name,
          address: data.address,
          currentNumber: data.currentNumber || 0,
          activeCounters: data.activeCounters || 0,
          createdAt: data.createdAt,
        });
      });

      // Seed default branches if empty on fresh Firestore
      if (list.length === 0 && loading) {
        try {
          const defaultBranches = [
            { name: "AntrePintar Jakarta Pusat", address: "Jl. MH Thamrin No. 10, Menteng, Jakarta Pusat", createdAt: new Date().toISOString() },
            { name: "AntrePintar Bandung", address: "Jl. Dago No. 124, Bandung, Jawa Barat", createdAt: new Date().toISOString() },
            { name: "AntrePintar Surabaya", address: "Jl. Tunjungan No. 45, Surabaya, Jawa Timur", createdAt: new Date().toISOString() }
          ];

          for (const item of defaultBranches) {
            const docRef = await addDoc(collection(db, "branches"), {
              name: item.name,
              address: item.address,
              currentNumber: 100,
              activeCounters: 2,
              createdAt: item.createdAt
            });

            // Add 2 default loket counters for each branch
            await addDoc(collection(db, `branches/${docRef.id}/counters`), {
              branchId: docRef.id,
              counterNumber: 1,
              status: "active",
              currentTicketId: "",
              operatorName: "Staf Loket 1"
            });
            await addDoc(collection(db, `branches/${docRef.id}/counters`), {
              branchId: docRef.id,
              counterNumber: 2,
              status: "inactive",
              currentTicketId: "",
              operatorName: "Staf Loket 2"
            });
          }
        } catch (err) {
          console.error("Error seeding default branches:", err);
        }
      } else {
        setBranches(list);
        if (list.length > 0 && !operatorBranchId) {
          setOperatorBranchId(list[0].id);
        }
        setLoading(false);
      }
    }, (error) => {
      console.error("Firestore snapshot error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [loading, operatorBranchId]);

  // Sync session with localStorage
  useEffect(() => {
    if (session) {
      localStorage.setItem("admin_session", JSON.stringify(session));
      // Auto switch current role view based on session
      if (session.uid === "operator_direct") {
        setRole("admin");
      } else if (session.role === "super_admin") {
        setRole("super_admin");
      } else if (session.role === "admin") {
        setRole("customer"); // Branch Admin logs in to configure Customer / Layar Antrean!
      }
    } else {
      localStorage.removeItem("admin_session");
    }
  }, [session]);

  const handleLogout = () => {
    if (confirm("Apakah Anda yakin ingin keluar dari sesi ini?")) {
      setSession(null);
      setRole("portal");
    }
  };

  const handleOperatorSetupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!operatorBranchId) return;

    const targetBranch = branches.find(b => b.id === operatorBranchId);
    const chosenName = tempOperatorName.trim() || `Operator Loket ${operatorCounterNum}`;

    // Directly set user session as custom operator bypass
    setSession({
      uid: "operator_direct",
      email: "operator@antrepintar.com",
      role: "admin",
      branchId: operatorBranchId,
      name: chosenName
    });
    setRole("admin");
  };

  const selectedBranchName = session?.branchId 
    ? branches.find(b => b.id === session.branchId)?.name 
    : undefined;

  const isAlreadyInActiveMenu = currentRole === "customer" || currentRole === "admin" || currentRole === "super_admin";

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans selection:bg-lime-400 selection:text-black" id="app-root">
      {/* Navigation Header */}
      <Header
        currentRole={currentRole}
        setRole={(role) => {
          setRole(role);
        }}
        session={session}
        onLogout={handleLogout}
        branchName={selectedBranchName}
        hideBackButton={isAlreadyInActiveMenu}
      />

      {/* Main Container */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col justify-center">
        
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
            <div className="w-10 h-10 border-4 border-lime-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm text-zinc-500 font-mono">Menghubungkan ke database pintar real-time...</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {/* PORTAL VIEW */}
            {currentRole === "portal" && (
              <motion.div
                key="portal"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="max-w-4xl mx-auto py-8 w-full space-y-10"
                id="portal-landing"
              >
                <div className="text-center space-y-4">
                  <span className="px-3 py-1 bg-lime-450/10 text-lime-400 border border-lime-400/20 rounded-full text-[10px] font-black uppercase tracking-widest font-mono">
                    Multi-Terminal Gateway v2.0
                  </span>
                  <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter italic text-white leading-none">
                    Selamat Datang di <span className="text-lime-450 underline decoration-2 underline-offset-4 decoration-lime-450">AntrePintar</span>
                  </h2>
                  <p className="text-zinc-400 max-w-xl mx-auto text-sm font-medium">
                    Portal terintegrasi sistem antrean real-time. Pilih aplikasi yang ingin Anda buka secara mandiri atau bagikan tautannya ke perangkat eksternal.
                  </p>
                </div>

                {/* System Synchronization Info Notification Banner */}
                <div className="bg-zinc-900/60 rounded-3xl p-6 border border-zinc-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="text-sm font-black uppercase tracking-tight text-lime-400 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 animate-pulse" />
                      Sistem Multi-Layar Terdistribusi Real-time
                    </h4>
                    <p className="text-xs text-zinc-400 font-medium max-w-2xl leading-relaxed">
                      Ketiga aplikasi ini berjalan terpisah namun saling terhubung secara instan menggunakan database cloud real-time. Anda bisa membuka masing-masing link pada browser/perangkat yang berbeda (misalnya tablet untuk loket, TV untuk lobby, laptop untuk admin) secara bersamaan!
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {/* Card 1: Kiosk / Layar Antrean */}
                  <div 
                    className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800 shadow-2xl hover:border-lime-400/40 transition-all flex flex-col justify-between group"
                    id="portal-card-kiosk"
                  >
                    <div className="space-y-4">
                      <div className="w-14 h-14 bg-zinc-950 border border-zinc-800 text-lime-400 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-105 shadow-md">
                        <Tv className="w-7 h-7 stroke-[2.5]" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-xl font-black uppercase tracking-tight text-white group-hover:text-lime-400 transition-colors">Layar & Kiosk</h3>
                        <p className="text-xs text-zinc-500 leading-relaxed font-medium">
                          Tampilkan antrean berjalan di monitor lobby dan biarkan pelanggan mengambil nomor tiket mandiri.
                        </p>
                      </div>
                      <div className="inline-block bg-zinc-950 text-[10px] text-lime-400 font-mono font-black uppercase tracking-widest px-2.5 py-1 rounded border border-lime-400/20">
                        Keamanan: Login Cabang
                      </div>
                    </div>
                    
                    <div className="space-y-3 mt-8">
                      <button
                        onClick={() => {
                          if (session?.role !== "admin" || session?.uid === "operator_direct") {
                            setSession(null);
                          }
                          setRole("customer");
                        }}
                        className="w-full py-3 bg-lime-400 hover:bg-lime-500 text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        <span>Buka Di Sini</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      <div className="grid grid-cols-2 gap-2">
                        <a
                          href="?mode=kiosk"
                          target="_blank"
                          rel="noreferrer"
                          className="py-2.5 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-[10px] text-zinc-350 hover:text-white font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Tab Baru</span>
                        </a>
                        <button
                          onClick={() => handleCopyLink("kiosk")}
                          className="py-2.5 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-[10px] text-zinc-350 hover:text-white font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {copiedKey === "kiosk" ? (
                            <>
                              <Check className="w-3 h-3 text-lime-400" />
                              <span className="text-lime-400">Tersalin!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Salin Link</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Panel Operator (Loket Staff) */}
                  <div 
                    className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800 shadow-2xl hover:border-lime-400/40 transition-all flex flex-col justify-between group"
                    id="portal-card-operator"
                  >
                    <div className="space-y-4">
                      <div className="w-14 h-14 bg-zinc-950 border border-zinc-800 text-lime-400 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-105 shadow-md">
                        <Layers className="w-7 h-7 stroke-[2.5]" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-xl font-black uppercase tracking-tight text-white group-hover:text-lime-400 transition-colors">Operator Loket</h3>
                        <p className="text-xs text-zinc-500 leading-relaxed font-medium">
                          Panel khusus staf loket untuk memanggil, melayani, melewatkan, atau menyelesaikan nomor antrean aktif.
                        </p>
                      </div>
                      <div className="inline-block bg-zinc-950 text-[10px] text-zinc-400 font-mono font-black uppercase tracking-widest px-2.5 py-1 rounded border border-zinc-800">
                        Akses Instan: Tanpa Password
                      </div>
                    </div>
                    
                    <div className="space-y-3 mt-8">
                      <button
                        onClick={() => {
                          if (session?.uid !== "operator_direct") {
                            setSession(null);
                          }
                          setRole("admin");
                        }}
                        className="w-full py-3 bg-lime-400 hover:bg-lime-500 text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        <span>Buka Di Sini</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      <div className="grid grid-cols-2 gap-2">
                        <a
                          href="?mode=operator"
                          target="_blank"
                          rel="noreferrer"
                          className="py-2.5 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-[10px] text-zinc-350 hover:text-white font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Tab Baru</span>
                        </a>
                        <button
                          onClick={() => handleCopyLink("operator")}
                          className="py-2.5 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-[10px] text-zinc-350 hover:text-white font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {copiedKey === "operator" ? (
                            <>
                              <Check className="w-3 h-3 text-lime-400" />
                              <span className="text-lime-400">Tersalin!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Salin Link</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Super Admin Dashboard */}
                  <div 
                    className="bg-zinc-900 rounded-3xl p-8 border border-zinc-800 shadow-2xl hover:border-lime-400/40 transition-all flex flex-col justify-between group"
                    id="portal-card-super"
                  >
                    <div className="space-y-4">
                      <div className="w-14 h-14 bg-zinc-950 border border-zinc-800 text-lime-400 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-105 shadow-md">
                        <ShieldCheck className="w-7 h-7 stroke-[2.5]" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-xl font-black uppercase tracking-tight text-white group-hover:text-lime-400 transition-colors">Super Admin</h3>
                        <p className="text-xs text-zinc-500 leading-relaxed font-medium">
                          Manajemen multi-cabang nasional, kontrol analitik terpadu, serta tambah atau hapus lokasi baru.
                        </p>
                      </div>
                      <div className="inline-block bg-zinc-950 text-[10px] text-lime-400 font-mono font-black uppercase tracking-widest px-2.5 py-1 rounded border border-lime-400/20">
                        Keamanan: Super Admin
                      </div>
                    </div>
                    
                    <div className="space-y-3 mt-8">
                      <button
                        onClick={() => {
                          if (session?.role !== "super_admin") {
                            setSession(null);
                          }
                          setRole("super_admin");
                        }}
                        className="w-full py-3 bg-lime-400 hover:bg-lime-500 text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        <span>Buka Di Sini</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      <div className="grid grid-cols-2 gap-2">
                        <a
                          href="?mode=super"
                          target="_blank"
                          rel="noreferrer"
                          className="py-2.5 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-[10px] text-zinc-350 hover:text-white font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Tab Baru</span>
                        </a>
                        <button
                          onClick={() => handleCopyLink("super")}
                          className="py-2.5 bg-zinc-950 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 text-[10px] text-zinc-350 hover:text-white font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {copiedKey === "super" ? (
                            <>
                              <Check className="w-3 h-3 text-lime-400" />
                              <span className="text-lime-400">Tersalin!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Salin Link</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* CUSTOMER VIEW (Layar Antrean Kiosk) */}
            {currentRole === "customer" && (
              <motion.div
                key="customer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {session?.role === "admin" && session?.uid !== "operator_direct" ? (
                  <CustomerPanel branches={branches} lockedBranchId={session.branchId} />
                ) : (
                  <div className="space-y-4">
                    <div className="text-center max-w-md mx-auto pt-4">
                      <h3 className="text-lg font-black uppercase tracking-tight text-white">Kiosk Terkunci</h3>
                      <p className="text-xs text-zinc-500 mt-1">Harap login dengan akun Admin Cabang untuk membuka layar antrean lokasi Anda.</p>
                    </div>
                    <LoginForm
                      branches={branches}
                      onLoginSuccess={(newSession) => setSession(newSession)}
                    />
                  </div>
                )}
              </motion.div>
            )}

            {/* ADMIN OPERATOR VIEW */}
            {currentRole === "admin" && (
              <motion.div
                key="admin"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {session?.uid === "operator_direct" ? (
                  <AdminDashboard session={session} branches={branches} />
                ) : (
                  /* Password-less direct operator configuration setup form */
                  <div className="max-w-md mx-auto my-6 bg-zinc-900 rounded-3xl border border-zinc-800 shadow-2xl p-8 space-y-6" id="operator-setup-form">
                    <div className="text-center space-y-2">
                      <div className="w-12 h-12 bg-zinc-950 border border-zinc-800 text-lime-400 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                        <Sliders className="w-6 h-6 stroke-[2.5]" />
                      </div>
                      <h2 className="text-xl font-black text-white uppercase tracking-tight">Konfigurasi Operator Loket</h2>
                      <p className="text-xs text-zinc-500 font-medium">Pilih cabang dan nomor loket Anda untuk langsung mulai memanggil.</p>
                    </div>

                    <form onSubmit={handleOperatorSetupSubmit} className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Cabang Penugasan</label>
                        <select
                          value={operatorBranchId}
                          onChange={(e) => setOperatorBranchId(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-bold text-white focus:border-lime-400 focus:ring-1 focus:ring-lime-400 focus:outline-none cursor-pointer"
                        >
                          {branches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Nomor Loket Anda</label>
                        <select
                          value={operatorCounterNum}
                          onChange={(e) => setOperatorCounterNum(Number(e.target.value))}
                          className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-bold text-white focus:border-lime-400 focus:ring-1 focus:ring-lime-400 focus:outline-none cursor-pointer"
                        >
                          {[1, 2, 3, 4, 5].map(num => (
                            <option key={num} value={num}>Loket {num}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Nama Panggilan Operator</label>
                        <input
                          type="text"
                          required
                          placeholder="Masukkan nama Anda (Contoh: Budi)"
                          value={tempOperatorName}
                          onChange={(e) => setTempOperatorName(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-bold text-white placeholder-zinc-700 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 focus:outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3.5 bg-lime-400 hover:bg-lime-500 text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg border border-lime-300 cursor-pointer"
                      >
                        Mulai Bertugas
                      </button>
                    </form>
                  </div>
                )}
              </motion.div>
            )}

            {/* SUPER ADMIN VIEW */}
            {currentRole === "super_admin" && (
              <motion.div
                key="super_admin"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {session?.role === "super_admin" ? (
                  <SuperAdminDashboard branches={branches} />
                ) : (
                  <div className="space-y-4">
                    <div className="text-center max-w-md mx-auto pt-4">
                      <h3 className="text-lg font-black uppercase tracking-tight text-white">Sesi Super Admin</h3>
                      <p className="text-xs text-zinc-500 mt-1">Harap verifikasi kredensial Super Admin Pusat Anda di bawah.</p>
                    </div>
                    <LoginForm
                      branches={branches}
                      onLoginSuccess={(newSession) => setSession(newSession)}
                    />
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}

      </main>

      {/* Footer / Status bar (Updated for clean visual separation) */}
      <footer className="bg-zinc-900 border-t border-zinc-800 py-5 px-6 text-center text-xs text-zinc-500 font-medium z-40 shadow-xl">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-mono text-[11px] tracking-tight uppercase text-zinc-500">
            © 2026 AntrePintar System. Multi-Cabang Real-time via Cloud Firestore.
          </p>
          <div className="flex items-center space-x-3 bg-zinc-950 py-1.5 px-3 rounded-xl border border-zinc-850">
            <span className="w-2 h-2 rounded-full bg-lime-400 animate-pulse"></span>
            <span className="text-[10px] uppercase font-black tracking-wider text-zinc-400 font-mono">
              Database Online: {branches.length} Cabang Terhubung
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
