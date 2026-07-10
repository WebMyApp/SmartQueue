import React, { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  query,
  orderBy,
  doc,
  deleteDoc,
  updateDoc
} from "firebase/firestore";
import { Branch, QueueTicket, Counter } from "../types";
import {
  Building,
  Plus,
  Trash2,
  TrendingUp,
  Users,
  Clock,
  Briefcase,
  Sparkles,
  Brain,
  MapPin,
  CheckCircle,
  AlertCircle,
  BarChart3,
  PieChart as PieIcon,
  LineChart as LineIcon
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { motion, AnimatePresence } from "motion/react";

interface SuperAdminDashboardProps {
  branches: Branch[];
}

// Color schemes for charts matching Bold Typography brutalist theme
const COLORS = ["#a3e635", "#38bdf8", "#fbbf24", "#a855f7"];

export default function SuperAdminDashboard({ branches }: SuperAdminDashboardProps) {
  // Real-time aggregates
  const [allQueues, setAllQueues] = useState<{ [branchId: string]: QueueTicket[] }>({});
  const [allCounters, setAllCounters] = useState<{ [branchId: string]: Counter[] }>({});

  // Add Branch Form state
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchAddress, setNewBranchAddress] = useState("");

  // AI Advice State
  const [superAdvice, setSuperAdvice] = useState("");
  const [loadingSuperAdvice, setLoadingSuperAdvice] = useState(false);

  // Tab: "branches" | "analytics"
  const [superTab, setSuperTab] = useState<"branches" | "analytics">("branches");

  // Create real-time snapshot listeners for all branches' queues and counters
  useEffect(() => {
    if (branches.length === 0) return;

    const unsubscribes: (() => void)[] = [];

    branches.forEach((branch) => {
      // Listen to queues
      const queuesRef = collection(db, `branches/${branch.id}/queues`);
      const unsubQueues = onSnapshot(queuesRef, (snapshot) => {
        const qList: QueueTicket[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          qList.push({
            id: doc.id,
            branchId: branch.id,
            queueNumber: data.queueNumber,
            customerName: data.customerName,
            serviceType: data.serviceType,
            status: data.status,
            createdAt: data.createdAt,
          });
        });
        setAllQueues((prev) => ({ ...prev, [branch.id]: qList }));
      });
      unsubscribes.push(unsubQueues);

      // Listen to counters
      const countersRef = collection(db, `branches/${branch.id}/counters`);
      const unsubCounters = onSnapshot(countersRef, (snapshot) => {
        const cList: Counter[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          cList.push({
            id: doc.id,
            branchId: branch.id,
            counterNumber: data.counterNumber,
            status: data.status,
          });
        });
        setAllCounters((prev) => ({ ...prev, [branch.id]: cList }));
      });
      unsubscribes.push(unsubCounters);
    });

    return () => {
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [branches]);

  // Handle adding a new branch
  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim() || !newBranchAddress.trim()) return;

    try {
      const docRef = await addDoc(collection(db, "branches"), {
        name: newBranchName.trim(),
        address: newBranchAddress.trim(),
        currentNumber: 0,
        activeCounters: 0,
        createdAt: new Date().toISOString()
      });

      // Add 2 default loket counters for this new branch automatically!
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

      // Reset form
      setNewBranchName("");
      setNewBranchAddress("");
    } catch (err) {
      console.error("Error creating branch:", err);
    }
  };

  // Handle deleting a branch
  const handleDeleteBranch = async (branchId: string, name: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus Cabang "${name}"? Tindakan ini tidak dapat dibatalkan.`)) {
      try {
        await deleteDoc(doc(db, "branches", branchId));
      } catch (err) {
        console.error("Error deleting branch:", err);
      }
    }
  };

  // Call Gemini for Super Admin strategic advisor
  const handleSuperAdvice = async () => {
    setLoadingSuperAdvice(true);
    setSuperAdvice("");

    // Package cross-branch current data
    const CrossBranchSummary = branches.map((branch) => {
      const q = allQueues[branch.id] || [];
      const c = allCounters[branch.id] || [];
      return {
        branchName: branch.name,
        branchAddress: branch.address,
        totalQueuesToday: q.length,
        waitingCount: q.filter((t) => t.status === "waiting").length,
        servingCount: q.filter((t) => t.status === "serving").length,
        completedCount: q.filter((t) => t.status === "completed").length,
        skippedCount: q.filter((t) => t.status === "skipped").length,
        totalCounters: c.length,
        activeCountersCount: c.filter((co) => co.status === "active").length
      };
    });

    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: CrossBranchSummary,
          role: "super_admin"
        })
      });
      const result = await res.json();
      if (result.success) {
        setSuperAdvice(result.advice);
      } else {
        setSuperAdvice(`Gagal memperoleh analisis super admin: ${result.advice || "Koneksi terputus."}`);
      }
    } catch (err: any) {
      setSuperAdvice(`Terjadi kesalahan saat memproses saran super admin: ${err.message}`);
    } finally {
      setLoadingSuperAdvice(false);
    }
  };

  // Calculated Real-Time Aggregates across ALL branches
  let combinedTotalWaiting = 0;
  let combinedTotalServing = 0;
  let combinedTotalCompleted = 0;
  let combinedTotalCounters = 0;

  branches.forEach((b) => {
    const q = allQueues[b.id] || [];
    const c = allCounters[b.id] || [];
    combinedTotalWaiting += q.filter((t) => t.status === "waiting").length;
    combinedTotalServing += q.filter((t) => t.status === "serving").length;
    combinedTotalCompleted += q.filter((t) => t.status === "completed").length;
    combinedTotalCounters += c.filter((co) => co.status === "active").length;
  });

  // --- Historical Analytics Data (Realistic Mock monthly stats for charts) ---
  const monthlyVolumeData = [
    { month: "Jan", "Jakarta Pusat": 420, "Bandung": 310, "Surabaya": 290 },
    { month: "Feb", "Jakarta Pusat": 450, "Bandung": 340, "Surabaya": 310 },
    { month: "Mar", "Jakarta Pusat": 520, "Bandung": 390, "Surabaya": 350 },
    { month: "Apr", "Jakarta Pusat": 480, "Bandung": 410, "Surabaya": 330 },
    { month: "Mei", "Jakarta Pusat": 550, "Bandung": 430, "Surabaya": 380 },
    { month: "Jun", "Jakarta Pusat": 620, "Bandung": 480, "Surabaya": 410 },
    { month: "Jul", "Jakarta Pusat": 680, "Bandung": 510, "Surabaya": 440 },
    { month: "Agu", "Jakarta Pusat": 710, "Bandung": 490, "Surabaya": 450 },
    { month: "Sep", "Jakarta Pusat": 690, "Bandung": 520, "Surabaya": 470 },
    { month: "Okt", "Jakarta Pusat": 730, "Bandung": 550, "Surabaya": 490 },
    { month: "Nov", "Jakarta Pusat": 780, "Bandung": 580, "Surabaya": 520 },
    { month: "Des", "Jakarta Pusat": 920, "Bandung": 720, "Surabaya": 680 }
  ];

  const serviceTypeData = [
    { name: "Kasir / Teller", value: 3200 },
    { name: "Customer Service", value: 1800 },
    { name: "Klaim & Retur", value: 950 },
    { name: "Konsultasi Teknis", value: 1200 }
  ];

  const weeklyTrendData = [
    { day: "Senin", "Volume": 420, "Rata-Rata Tunggu (Menit)": 12 },
    { day: "Selasa", "Volume": 380, "Rata-Rata Tunggu (Menit)": 10 },
    { day: "Rabu", "Volume": 390, "Rata-Rata Tunggu (Menit)": 9 },
    { day: "Kamis", "Volume": 410, "Rata-Rata Tunggu (Menit)": 11 },
    { day: "Jumat", "Volume": 520, "Rata-Rata Tunggu (Menit)": 15 },
    { day: "Sabtu", "Volume": 680, "Rata-Rata Tunggu (Menit)": 22 },
    { day: "Minggu", "Volume": 750, "Rata-Rata Tunggu (Menit)": 28 }
  ];

  // Map branches actual name for chart volume comparison
  const branchComparisonData = branches.map(b => {
    const q = allQueues[b.id] || [];
    return {
      name: b.name,
      "Antrean Hari Ini": q.length,
      "Selesai Hari Ini": q.filter(t => t.status === "completed").length
    };
  });

  return (
    <div className="space-y-8" id="super-admin-root">
      
      {/* Tab select option */}
      <div className="flex border border-zinc-800 bg-zinc-900 p-2 rounded-2xl shadow-xl max-w-md">
        <button
          id="btn-super-tab-branches"
          onClick={() => setSuperTab("branches")}
          className={`flex-1 py-2.5 text-center text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            superTab === "branches"
              ? "bg-lime-400 text-black border border-lime-300"
              : "text-zinc-500 hover:text-white"
          }`}
        >
          Kelola Cabang & Real-Time
        </button>
        <button
          id="btn-super-tab-analytics"
          onClick={() => setSuperTab("analytics")}
          className={`flex-1 py-2.5 text-center text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            superTab === "analytics"
              ? "bg-lime-400 text-black border border-lime-300"
              : "text-zinc-500 hover:text-white"
          }`}
        >
          Laporan Analitik Bulanan
        </button>
      </div>

      {/* Aggregate Stats Cards Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-805 shadow-xl flex items-center space-x-4">
          <div className="p-3 bg-zinc-950 border border-zinc-850 rounded-xl text-lime-400">
            <Building className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Total Cabang</p>
            <p className="text-2xl font-black font-mono tracking-tight text-white mt-0.5">{branches.length}</p>
          </div>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-805 shadow-xl flex items-center space-x-4">
          <div className="p-3 bg-zinc-950 border border-zinc-850 rounded-xl text-lime-400">
            <Users className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Gabungan Menunggu</p>
            <p className="text-2xl font-black font-mono tracking-tight text-white mt-0.5">{combinedTotalWaiting}</p>
          </div>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-805 shadow-xl flex items-center space-x-4">
          <div className="p-3 bg-zinc-950 border border-zinc-850 rounded-xl text-lime-400">
            <CheckCircle className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Gabungan Selesai</p>
            <p className="text-2xl font-black font-mono tracking-tight text-white mt-0.5">{combinedTotalCompleted}</p>
          </div>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-805 shadow-xl flex items-center space-x-4">
          <div className="p-3 bg-zinc-950 border border-zinc-850 rounded-xl text-lime-400">
            <Clock className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Loket Aktif Nasional</p>
            <p className="text-2xl font-black font-mono tracking-tight text-white mt-0.5">{combinedTotalCounters}</p>
          </div>
        </div>
      </div>

      {superTab === "branches" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: List of branches and add form (7 cols) */}
          <div className="lg:col-span-7 space-y-8">
            
            {/* List of Branches */}
            <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-xl p-6 space-y-6">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Building className="w-5 h-5 text-lime-400" />
                Daftar Cabang Aktif & Kepadatan Real-Time
              </h3>

              {branches.length === 0 ? (
                <p className="text-center py-12 text-zinc-500 text-xs font-mono uppercase">
                  Belum ada cabang toko yang terdaftar. Silakan tambah cabang baru di samping!
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {branches.map((branch) => {
                    const q = allQueues[branch.id] || [];
                    const c = allCounters[branch.id] || [];
                    
                    const waiting = q.filter((t) => t.status === "waiting").length;
                    const serving = q.filter((t) => t.status === "serving").length;
                    const activeCounters = c.filter((co) => co.status === "active").length;

                    return (
                      <div
                        key={branch.id}
                        className="p-5 bg-zinc-950 border border-zinc-805 rounded-2xl transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-2 flex-1">
                          <h4 className="text-base font-black uppercase tracking-tight text-white">{branch.name}</h4>
                          <p className="text-xs text-zinc-500 font-bold flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-lime-400" /> {branch.address}
                          </p>
                          <div className="pt-2 flex flex-wrap gap-2 text-xs">
                            <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg font-black uppercase tracking-wider font-mono text-[10px]">
                              Menunggu: {waiting}
                            </span>
                            <span className="px-2.5 py-1 bg-lime-400/10 text-lime-400 border border-lime-400/20 rounded-lg font-black uppercase tracking-wider font-mono text-[10px]">
                              Melayani: {serving}
                            </span>
                            <span className="px-2.5 py-1 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-lg font-black uppercase tracking-wider font-mono text-[10px]">
                              Loket Aktif: {activeCounters}
                            </span>
                          </div>
                        </div>

                        <button
                          id={`delete-branch-btn-${branch.id}`}
                          onClick={() => handleDeleteBranch(branch.id, branch.name)}
                          className="p-2.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all flex-shrink-0 cursor-pointer"
                          title="Hapus Cabang"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Cross-Branch Comparison Table */}
            {branches.length > 0 && (
              <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-xl p-6">
                <h4 className="text-xs font-black text-white uppercase tracking-wider mb-4">Volume Antrean Hari Ini</h4>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={branchComparisonData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#18181b" />
                      <XAxis dataKey="name" fontSize={10} stroke="#71717a" tickLine={false} style={{ fontFamily: "JetBrains Mono", fontWeight: "bold" }} />
                      <YAxis fontSize={10} stroke="#71717a" tickLine={false} style={{ fontFamily: "JetBrains Mono", fontWeight: "bold" }} />
                      <Tooltip contentStyle={{ backgroundColor: "#09090b", border: "1px solid #27272a", borderRadius: "12px", fontFamily: "JetBrains Mono" }} />
                      <Legend wrapperStyle={{ fontSize: "11px", fontFamily: "JetBrains Mono", fontWeight: "bold", textTransform: "uppercase" }} />
                      <Bar dataKey="Antrean Hari Ini" fill="#a3e635" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Selesai Hari Ini" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

          </div>

          {/* Right Column: Add branch Form & Multi-Branch AI Advisor (5 cols) */}
          <div className="lg:col-span-5 space-y-8">
            
            {/* Create Branch Form */}
            <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 shadow-xl">
              <div className="flex items-center space-x-3 mb-5">
                <div className="p-2 bg-zinc-950 border border-zinc-850 rounded-xl text-lime-400">
                  <Plus className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight text-white">Tambah Cabang Toko</h3>
                  <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mt-0.5">Daftarkan lokasi baru retail toko</p>
                </div>
              </div>

              <form onSubmit={handleAddBranch} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Nama Cabang</label>
                  <input
                    id="new-branch-name-input"
                    type="text"
                    required
                    placeholder="Contoh: Cabang Jakarta Pusat"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 text-sm font-bold text-white placeholder-zinc-750 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Alamat Cabang</label>
                  <textarea
                    id="new-branch-address-input"
                    required
                    rows={2}
                    placeholder="Contoh: Jl. Merdeka No. 12, Gambir, Jakarta Pusat"
                    value={newBranchAddress}
                    onChange={(e) => setNewBranchAddress(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 focus:border-lime-400 focus:ring-1 focus:ring-lime-400 text-sm font-bold text-white placeholder-zinc-750 focus:outline-none resize-none"
                  />
                </div>

                <button
                  id="btn-super-submit-branch"
                  type="submit"
                  className="w-full py-3.5 bg-lime-400 hover:bg-lime-500 text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg border border-lime-300 flex items-center justify-center space-x-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Daftarkan Cabang</span>
                </button>
              </form>
            </div>

            {/* AI Multi-Branch Strategic Advisor */}
            <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 shadow-xl relative overflow-hidden">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2.5 bg-lime-400 rounded-xl text-black border border-lime-300">
                  <Sparkles className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-tight text-white">AI Executive Advisor</h3>
                  <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mt-0.5">Multi-Store Strategy</p>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Bandingkan kepadatan antrean di seluruh cabang ritel secara komprehensif. AI akan merekomendasikan redistribusi staf loket atau pembukaan jam layanan fleksibel di lokasi yang paling membutuhkan.
                </p>

                <button
                  id="btn-super-request-advice"
                  onClick={handleSuperAdvice}
                  disabled={loadingSuperAdvice}
                  className="w-full py-3.5 bg-lime-400 hover:bg-lime-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg border border-lime-300 flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <Brain className="w-4 h-4" />
                  <span>{loadingSuperAdvice ? "MENGEVALUASI KINERJA CABANG..." : "ANALISIS KINERJA STRATEGIS AI"}</span>
                </button>

                <AnimatePresence mode="wait">
                  {superAdvice && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800 shadow-inner overflow-hidden"
                    >
                      <div className="flex items-center space-x-1.5 mb-2.5 text-white">
                        <Sparkles className="w-4 h-4 text-lime-400 animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-wider font-mono">REKOMENDASI EKSEKUTIF:</span>
                      </div>
                      <div className="text-xs text-zinc-300 leading-relaxed prose prose-invert max-w-none font-mono text-[11px]">
                        {superAdvice.split("\n").map((line, i) => {
                          const parsedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-lime-450 font-black">$1</strong>');
                          return (
                            <p key={i} className="mb-1.5 leading-relaxed" dangerouslySetInnerHTML={{ __html: parsedLine }} />
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

          </div>

        </div>
      ) : (
        /* Analytics Monthly Tab */
        <div className="space-y-8 animate-fadeIn">
          
          {/* Chart Set 1: Monthly trend and Service distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-xl p-6 space-y-4">
              <div>
                <h4 className="text-base font-black text-white uppercase tracking-wide flex items-center gap-1.5">
                  <BarChart3 className="w-5 h-5 text-lime-400" />
                  Volume Antrean Bulanan Per Cabang (Tahun Berjalan)
                </h4>
                <p className="text-xs text-zinc-500 font-medium mt-0.5">Total volume pelanggan bulanan di Jakarta, Bandung, dan Surabaya.</p>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyVolumeData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#18181b" />
                    <XAxis dataKey="month" fontSize={10} stroke="#71717a" tickLine={false} style={{ fontFamily: "JetBrains Mono", fontWeight: "bold" }} />
                    <YAxis fontSize={10} stroke="#71717a" tickLine={false} style={{ fontFamily: "JetBrains Mono", fontWeight: "bold" }} />
                    <Tooltip contentStyle={{ backgroundColor: "#09090b", border: "1px solid #27272a", borderRadius: "12px", fontFamily: "JetBrains Mono" }} />
                    <Legend wrapperStyle={{ fontSize: "11px", fontFamily: "JetBrains Mono", fontWeight: "bold", textTransform: "uppercase" }} />
                    <Bar dataKey="Jakarta Pusat" fill="#a3e635" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Bandung" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Surabaya" fill="#fbbf24" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-xl p-6 space-y-4">
              <div>
                <h4 className="text-base font-black text-white uppercase tracking-wide flex items-center gap-1.5">
                  <PieIcon className="w-5 h-5 text-lime-400" />
                  Popularitas Tipe Layanan (Gabungan Semua Toko)
                </h4>
                <p className="text-xs text-zinc-500 font-medium mt-0.5">Distribusi kumulatif jenis layanan yang diakses oleh pelanggan.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                <div className="md:col-span-7 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={serviceTypeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {serviceTypeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="md:col-span-5 space-y-2.5">
                  {serviceTypeData.map((item, index) => {
                    const total = serviceTypeData.reduce((sum, i) => sum + i.value, 0);
                    const pct = Math.round((item.value / total) * 100);
                    return (
                      <div key={item.name} className="flex items-center space-x-2 text-xs">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                        <div className="font-black text-zinc-300 uppercase tracking-tight truncate w-24" title={item.name}>{item.name}</div>
                        <div className="text-lime-400 font-mono font-black text-right flex-1">{pct}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Chart Set 2: Weekly peak and average wait time */}
          <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-xl p-6 space-y-4">
            <div>
              <h4 className="text-base font-black text-white uppercase tracking-wide flex items-center gap-1.5">
                <LineIcon className="w-5 h-5 text-lime-400" />
                Tren Mingguan: Volume & Rata-rata Waktu Tunggu
              </h4>
              <p className="text-xs text-zinc-500 font-medium mt-0.5">Analisis beban hari sibuk (peak days) dan dampaknya terhadap waktu tunggu pelanggan.</p>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weeklyTrendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#18181b" />
                  <XAxis dataKey="day" fontSize={10} stroke="#71717a" tickLine={false} style={{ fontFamily: "JetBrains Mono", fontWeight: "bold" }} />
                  <YAxis yAxisId="left" fontSize={10} stroke="#a3e635" tickLine={false} style={{ fontFamily: "JetBrains Mono", fontWeight: "bold" }} />
                  <YAxis yAxisId="right" orientation="right" fontSize={10} stroke="#fbbf24" tickLine={false} style={{ fontFamily: "JetBrains Mono", fontWeight: "bold" }} />
                  <Tooltip contentStyle={{ backgroundColor: "#09090b", border: "1px solid #27272a", borderRadius: "12px", fontFamily: "JetBrains Mono" }} />
                  <Legend wrapperStyle={{ fontSize: "11px", fontFamily: "JetBrains Mono", fontWeight: "bold", textTransform: "uppercase" }} />
                  <Line yAxisId="left" type="monotone" dataKey="Volume" stroke="#a3e635" strokeWidth={3} activeDot={{ r: 8 }} />
                  <Line yAxisId="right" type="monotone" dataKey="Rata-Rata Tunggu (Menit)" stroke="#fbbf24" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
