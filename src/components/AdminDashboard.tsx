import React, { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  updateDoc,
  doc,
  writeBatch
} from "firebase/firestore";
import { Branch, QueueTicket, Counter, UserSession } from "../types";
import { 
  Users, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Play, 
  RotateCcw, 
  Check, 
  Plus, 
  Sliders, 
  Sparkles, 
  HelpCircle,
  Building,
  Radio,
  History,
  TrendingUp,
  Brain,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AdminDashboardProps {
  session: UserSession;
  branches: Branch[];
}

export default function AdminDashboard({ session, branches }: AdminDashboardProps) {
  // If admin has a specific branch assigned, use it. Otherwise default to first available branch.
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    session.branchId || (branches.length > 0 ? branches[0].id : "")
  );

  const [queues, setQueues] = useState<QueueTicket[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  const [activeCounter, setActiveCounter] = useState<number>(1);
  const [operatorName, setOperatorName] = useState(session.name || "Operator Staf");

  // Gemini Smart Advice state
  const [advice, setAdvice] = useState<string>("");
  const [loadingAdvice, setLoadingAdvice] = useState(false);

  // Tab view: "active" | "history" | "counters"
  const [activeTab, setActiveTab] = useState<"active" | "history" | "counters">("active");

  // Load queues and counters for selected branch
  useEffect(() => {
    if (!selectedBranchId) return;

    // Real-time Queues
    const queuesRef = collection(db, `branches/${selectedBranchId}/queues`);
    const qQueues = query(queuesRef, orderBy("createdAt", "asc"));
    const unsubscribeQueues = onSnapshot(qQueues, (snapshot) => {
      const list: QueueTicket[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: doc.id,
          branchId: selectedBranchId,
          queueNumber: data.queueNumber,
          customerName: data.customerName,
          serviceType: data.serviceType,
          status: data.status,
          counterNumber: data.counterNumber,
          phoneNumber: data.phoneNumber,
          createdAt: data.createdAt,
          calledAt: data.calledAt,
          completedAt: data.completedAt,
        });
      });
      setQueues(list);
    });

    // Real-time Counters
    const countersRef = collection(db, `branches/${selectedBranchId}/counters`);
    const qCounters = query(countersRef, orderBy("counterNumber", "asc"));
    const unsubscribeCounters = onSnapshot(qCounters, (snapshot) => {
      const list: Counter[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: doc.id,
          branchId: selectedBranchId,
          counterNumber: data.counterNumber,
          status: data.status,
          currentTicketId: data.currentTicketId,
          operatorName: data.operatorName,
        });
      });
      setCounters(list);

      // Set initial operator counter
      if (list.length > 0 && !list.some(c => c.counterNumber === activeCounter)) {
        setActiveCounter(list[0].counterNumber);
      }
    });

    return () => {
      unsubscribeQueues();
      unsubscribeCounters();
    };
  }, [selectedBranchId]);

  // Sync active counter info to the selected database counter
  useEffect(() => {
    if (!selectedBranchId || counters.length === 0) return;
    const currentC = counters.find(c => c.counterNumber === activeCounter);
    if (currentC && currentC.operatorName !== operatorName) {
      const ref = doc(db, `branches/${selectedBranchId}/counters/${currentC.id}`);
      updateDoc(ref, { operatorName });
    }
  }, [operatorName, activeCounter, selectedBranchId, counters]);

  // Handle calling the NEXT queue ticket
  const handleCallNext = async () => {
    if (!selectedBranchId) return;

    // Get first ticket that is "waiting"
    const nextTicket = queues.find(q => q.status === "waiting");
    if (!nextTicket) {
      alert("Tidak ada nomor antrean yang menunggu giliran saat ini!");
      return;
    }

    try {
      // Find the counter document
      const counterDoc = counters.find(c => c.counterNumber === activeCounter);
      
      // Update ticket status to "serving" and assign counter
      const ticketRef = doc(db, `branches/${selectedBranchId}/queues/${nextTicket.id}`);
      await updateDoc(ticketRef, {
        status: "serving",
        counterNumber: activeCounter,
        calledAt: new Date().toISOString()
      });

      // Update counter with active ticket info
      if (counterDoc) {
        const counterRef = doc(db, `branches/${selectedBranchId}/counters/${counterDoc.id}`);
        await updateDoc(counterRef, {
          currentTicketId: nextTicket.id,
          operatorName: operatorName
        });
      }
      
      setAdvice(""); // Reset advice when state changes to prompt fresh analyzer
    } catch (err) {
      console.error("Error calling next queue:", err);
    }
  };

  // Handle recalling a ticket
  const handleRecall = async (ticket: QueueTicket) => {
    try {
      const ticketRef = doc(db, `branches/${selectedBranchId}/queues/${ticket.id}`);
      await updateDoc(ticketRef, {
        calledAt: new Date().toISOString() // Updates to trigger real-time voice re-broadcast
      });
    } catch (err) {
      console.error("Error recalling ticket:", err);
    }
  };

  // Handle completing a ticket
  const handleComplete = async (ticket: QueueTicket) => {
    try {
      const ticketRef = doc(db, `branches/${selectedBranchId}/queues/${ticket.id}`);
      await updateDoc(ticketRef, {
        status: "completed",
        completedAt: new Date().toISOString()
      });

      // Clear ticket on counter
      const counterDoc = counters.find(c => c.counterNumber === activeCounter);
      if (counterDoc && counterDoc.currentTicketId === ticket.id) {
        const counterRef = doc(db, `branches/${selectedBranchId}/counters/${counterDoc.id}`);
        await updateDoc(counterRef, {
          currentTicketId: ""
        });
      }
    } catch (err) {
      console.error("Error completing ticket:", err);
    }
  };

  // Handle skipping a ticket
  const handleSkip = async (ticket: QueueTicket) => {
    try {
      const ticketRef = doc(db, `branches/${selectedBranchId}/queues/${ticket.id}`);
      await updateDoc(ticketRef, {
        status: "skipped",
        completedAt: new Date().toISOString()
      });

      // Clear ticket on counter
      const counterDoc = counters.find(c => c.counterNumber === activeCounter);
      if (counterDoc && counterDoc.currentTicketId === ticket.id) {
        const counterRef = doc(db, `branches/${selectedBranchId}/counters/${counterDoc.id}`);
        await updateDoc(counterRef, {
          currentTicketId: ""
        });
      }
    } catch (err) {
      console.error("Error skipping ticket:", err);
    }
  };

  // Add a new Loket counter
  const handleAddCounter = async () => {
    if (!selectedBranchId) return;
    const nextNumber = counters.length + 1;

    try {
      await addDoc(collection(db, `branches/${selectedBranchId}/counters`), {
        branchId: selectedBranchId,
        counterNumber: nextNumber,
        status: "active",
        currentTicketId: "",
        operatorName: nextNumber === activeCounter ? operatorName : `Staf Loket ${nextNumber}`
      });
    } catch (err) {
      console.error("Error adding counter:", err);
    }
  };

  // Toggle active/inactive for any counter
  const handleToggleCounterStatus = async (counter: Counter) => {
    try {
      const ref = doc(db, `branches/${selectedBranchId}/counters/${counter.id}`);
      await updateDoc(ref, {
        status: counter.status === "active" ? "inactive" : "active"
      });
    } catch (err) {
      console.error("Error toggling counter status:", err);
    }
  };

  // Request AI suggestions for this specific branch
  const handleRequestAdvice = async () => {
    setLoadingAdvice(true);
    setAdvice("");
    
    // Package relevant metadata for AI analysis
    const waitingList = queues.filter(q => q.status === "waiting");
    const servingList = queues.filter(q => q.status === "serving");
    const completedList = queues.filter(q => q.status === "completed");
    
    const branchName = branches.find(b => b.id === selectedBranchId)?.name || "Cabang";

    const branchSummary = {
      totalQueuesCount: queues.length,
      waitingCount: waitingList.length,
      servingCount: servingList.length,
      completedCount: completedList.length,
      countersCount: counters.length,
      activeCountersCount: counters.filter(c => c.status === "active").length,
      servicesDistribution: queues.reduce((acc: any, curr) => {
        acc[curr.serviceType] = (acc[curr.serviceType] || 0) + 1;
        return acc;
      }, {})
    };

    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: branchSummary,
          branchName: branchName,
          role: "admin"
        })
      });
      const result = await res.json();
      if (result.success) {
        setAdvice(result.advice);
      } else {
        setAdvice(`Gagal memuat rekomendasi AI: ${result.advice || "Koneksi terputus."}`);
      }
    } catch (err: any) {
      setAdvice(`Terjadi kesalahan saat memproses saran AI: ${err.message}`);
    } finally {
      setLoadingAdvice(false);
    }
  };

  const waitingTickets = queues.filter(q => q.status === "waiting");
  const servingTickets = queues.filter(q => q.status === "serving");
  const historyTickets = queues.filter(q => q.status === "completed" || q.status === "skipped");

  // Current selected branch details
  const currentBranch = branches.find(b => b.id === selectedBranchId);

  // Filter queues currently assigned to THIS admin's counter number
  const myCurrentTicket = queues.find(q => q.status === "serving" && q.counterNumber === activeCounter);

  return (
    <div className="space-y-8" id="admin-dashboard-root">
      
      {/* Top Controls: Select Active Counter / Operator details */}
      <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 shadow-xl grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        <div>
          <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Cabang yang Dikelola</label>
          <div className="flex items-center space-x-2 text-white">
            <Building className="w-5 h-5 text-lime-400" />
            <select
              id="admin-branch-select"
              value={selectedBranchId}
              disabled={!!session.branchId} // If tied to a branch, disable switcher
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="font-black text-base bg-transparent border-none focus:ring-0 focus:outline-none cursor-pointer hover:text-lime-400 transition-colors uppercase tracking-tight"
            >
              {branches.map(branch => (
                <option key={branch.id} value={branch.id} className="bg-zinc-900 text-white">{branch.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Loket Anda Saat Ini</label>
          <div className="flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-lime-400" />
            <select
              id="admin-counter-select"
              value={activeCounter}
              onChange={(e) => setActiveCounter(Number(e.target.value))}
              className="font-black text-base bg-transparent border-none focus:ring-0 focus:outline-none cursor-pointer hover:text-lime-400 transition-colors uppercase tracking-tight"
            >
              {counters.filter(c => c.status === "active").map(c => (
                <option key={c.id} value={c.counterNumber} className="bg-zinc-900 text-white">Loket {c.counterNumber}</option>
              ))}
              {counters.filter(c => c.status === "active").length === 0 && (
                <option value="1" className="bg-zinc-900 text-white">Loket 1 (Default)</option>
              )}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Nama Operator / Petugas</label>
          <input
            id="admin-operator-input"
            type="text"
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
            placeholder="Masukkan nama petugas"
            className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-sm font-bold text-white placeholder-zinc-700 focus:outline-none focus:border-lime-400 focus:ring-1 focus:ring-lime-400"
          />
        </div>
      </div>

      {/* Main Grid: Control Station and Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Service Console Controls (7 cols) */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* Main Calling Box */}
          <div className="bg-zinc-900 text-white rounded-3xl p-8 shadow-2xl relative overflow-hidden border-2 border-lime-400">
            <div className="absolute top-4 right-4 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800 flex items-center space-x-1.5">
              <Radio className="w-3.5 h-3.5 text-lime-400 animate-ping" />
              <span className="font-mono text-[9px] font-black text-zinc-400 uppercase tracking-wider">CONSOLE LOKET {activeCounter}</span>
            </div>

            <div className="space-y-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Melayani Antrean Sekarang</p>
              
              {myCurrentTicket ? (
                <div className="space-y-4">
                  <div>
                    <h2 className="text-7xl font-black font-mono tracking-tighter text-lime-400">
                      {myCurrentTicket.queueNumber}
                    </h2>
                    <p className="text-lg font-black uppercase tracking-tight text-white mt-3">
                      {myCurrentTicket.customerName}
                    </p>
                    <span className="inline-flex mt-2 px-2.5 py-1 bg-zinc-950 border border-zinc-800 text-zinc-400 rounded text-[10px] font-black uppercase tracking-wider font-mono">
                      Layanan: {myCurrentTicket.serviceType}
                    </span>
                  </div>

                  <div className="pt-4 flex flex-wrap gap-3">
                    <button
                      id="btn-admin-complete"
                      onClick={() => handleComplete(myCurrentTicket)}
                      className="px-6 py-3.5 bg-lime-400 hover:bg-lime-500 text-black text-xs font-black uppercase tracking-wider rounded-xl shadow-lg border border-lime-300 transition-colors flex items-center space-x-2 cursor-pointer"
                    >
                      <Check className="w-4 h-4 stroke-[2.5]" />
                      <span>Selesaikan Layanan</span>
                    </button>
                    <button
                      id="btn-admin-recall"
                      onClick={() => handleRecall(myCurrentTicket)}
                      className="px-5 py-3.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center space-x-2 border border-zinc-700"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Panggil Ulang</span>
                    </button>
                    <button
                      id="btn-admin-skip"
                      onClick={() => handleSkip(myCurrentTicket)}
                      className="px-5 py-3.5 bg-red-500/15 hover:bg-red-500 hover:text-black text-red-400 text-xs font-black uppercase tracking-wider rounded-xl transition-all border border-red-500/30"
                    >
                      <span>Lewati</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-8">
                  <p className="text-zinc-500 text-xs font-mono uppercase">Loket Anda belum melayani antrean.</p>
                  <button
                    id="btn-admin-call-next"
                    onClick={handleCallNext}
                    className="mt-5 px-6 py-3.5 bg-lime-400 hover:bg-lime-500 text-black text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-lg flex items-center space-x-2 border border-lime-300"
                  >
                    <Play className="w-4 h-4 fill-black text-black" />
                    <span>Panggil Antrean Berikutnya</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Quick Statistics Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 shadow-xl text-center">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Menunggu</p>
              <p className="text-3xl font-black text-white font-mono tracking-tight mt-1">{waitingTickets.length}</p>
            </div>
            <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 shadow-xl text-center">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Dipanggil</p>
              <p className="text-3xl font-black text-lime-400 font-mono tracking-tight mt-1">{servingTickets.length}</p>
            </div>
            <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 shadow-xl text-center">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Selesai</p>
              <p className="text-3xl font-black text-emerald-400 font-mono tracking-tight mt-1">
                {queues.filter(q => q.status === "completed").length}
              </p>
            </div>
            <div className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800 shadow-xl text-center">
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">Terlewati</p>
              <p className="text-3xl font-black text-rose-500 font-mono tracking-tight mt-1">
                {queues.filter(q => q.status === "skipped").length}
              </p>
            </div>
          </div>

          {/* Tab Menu and lists */}
          <div className="bg-zinc-900 rounded-3xl border border-zinc-800 shadow-xl overflow-hidden">
            {/* Tabs Navigation */}
            <div className="border-b border-zinc-800 bg-zinc-950 p-2 flex space-x-2">
              <button
                id="admin-tab-active"
                onClick={() => setActiveTab("active")}
                className={`flex-1 py-2.5 text-center text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                  activeTab === "active" 
                    ? "bg-lime-400 text-black border border-lime-300" 
                    : "text-zinc-500 hover:text-white"
                }`}
              >
                Antrean Aktif
              </button>
              <button
                id="admin-tab-history"
                onClick={() => setActiveTab("history")}
                className={`flex-1 py-2.5 text-center text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                  activeTab === "history" 
                    ? "bg-lime-400 text-black border border-lime-300" 
                    : "text-zinc-500 hover:text-white"
                }`}
              >
                Log Histori
              </button>
              <button
                id="admin-tab-counters"
                onClick={() => setActiveTab("counters")}
                className={`flex-1 py-2.5 text-center text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                  activeTab === "counters" 
                    ? "bg-lime-400 text-black border border-lime-300" 
                    : "text-zinc-500 hover:text-white"
                }`}
              >
                Kelola Loket
              </button>
            </div>

            {/* Tab Contents */}
            <div className="p-6">
              
              {activeTab === "active" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-black text-white uppercase tracking-wider">Daftar Menunggu</h4>
                    <span className="text-[10px] font-mono font-black bg-zinc-950 text-lime-400 px-3 py-1 rounded border border-zinc-800 uppercase tracking-wider">
                      Total: {waitingTickets.length} Tiket
                    </span>
                  </div>

                  {waitingTickets.length === 0 ? (
                    <div className="text-center py-10 text-zinc-500 text-xs font-mono uppercase">
                      Tidak ada antrean menunggu giliran saat ini.
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-850">
                      {waitingTickets.map((ticket, index) => (
                        <div key={ticket.id} className="py-4 flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <span className="w-12 h-12 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-center font-mono font-black text-sm text-lime-400">
                              {ticket.queueNumber}
                            </span>
                            <div>
                              <p className="text-sm font-black uppercase tracking-tight text-white">{ticket.customerName}</p>
                              <p className="text-[11px] text-zinc-500 font-medium mt-0.5">{ticket.serviceType} {ticket.phoneNumber ? `• ${ticket.phoneNumber}` : ""}</p>
                            </div>
                          </div>
                          
                          {/* Quick call this specific ticket directly */}
                          <button
                            id={`call-ticket-direct-${ticket.queueNumber}`}
                            onClick={async () => {
                              const ticketRef = doc(db, `branches/${selectedBranchId}/queues/${ticket.id}`);
                              await updateDoc(ticketRef, {
                                status: "serving",
                                counterNumber: activeCounter,
                                calledAt: new Date().toISOString()
                              });
                              
                              // Clear active ticket on counter if needed
                              const counterDoc = counters.find(c => c.counterNumber === activeCounter);
                              if (counterDoc) {
                                const counterRef = doc(db, `branches/${selectedBranchId}/counters/${counterDoc.id}`);
                                await updateDoc(counterRef, {
                                  currentTicketId: ticket.id,
                                  operatorName: operatorName
                                });
                              }
                            }}
                            className="px-3 py-1.5 bg-zinc-800 hover:bg-lime-400 hover:text-black text-zinc-300 rounded text-[10px] font-black uppercase tracking-wider transition-colors border border-zinc-700 hover:border-lime-300"
                            title="Panggil Sekarang"
                          >
                            Panggil
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "history" && (
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-lime-400" />
                    Tiket Selesai & Terlewati
                  </h4>
                  {historyTickets.length === 0 ? (
                    <div className="text-center py-10 text-zinc-500 text-xs font-mono uppercase">
                      Belum ada histori antrean hari ini.
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto divide-y divide-zinc-850">
                      {historyTickets.slice().reverse().map((ticket) => (
                        <div key={ticket.id} className="py-3.5 flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <span className="w-11 h-11 bg-zinc-950 border border-zinc-850 rounded-xl flex items-center justify-center font-mono font-bold text-xs text-zinc-500">
                              {ticket.queueNumber}
                            </span>
                            <div>
                              <p className="text-sm font-black uppercase tracking-tight text-white">{ticket.customerName}</p>
                              <p className="text-xs text-zinc-500 mt-0.5">{ticket.serviceType} • Loket {ticket.counterNumber || "—"}</p>
                            </div>
                          </div>
                          <div>
                            {ticket.status === "completed" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                Selesai
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                Terlewati
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "counters" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-black text-white uppercase tracking-wider">Konfigurasi Loket</h4>
                    <button
                      id="btn-admin-add-counter"
                      onClick={handleAddCounter}
                      className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center space-x-1 border border-zinc-700"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Loket</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {counters.map((c) => (
                      <div key={c.id} className="p-4 bg-zinc-950 border border-zinc-805 rounded-2xl flex items-center justify-between">
                        <div>
                          <p className="text-sm font-black text-white">Loket {c.counterNumber}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{c.operatorName || "Tanpa Operator"}</p>
                        </div>
                        <button
                          id={`toggle-counter-status-${c.counterNumber}`}
                          onClick={() => handleToggleCounterStatus(c)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${
                            c.status === "active"
                              ? "bg-lime-400 text-black border-lime-300"
                              : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
                          }`}
                        >
                          {c.status === "active" ? "Aktif" : "Tutup"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>

        </div>

        {/* Right Side: AI Assistant & Real-time Branch advisor (5 cols) */}
        <div className="lg:col-span-5 space-y-8">
          
          {/* AI Smart Advisor Panel */}
          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Brain className="w-24 h-24 text-lime-400" />
            </div>

            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2.5 bg-lime-400 rounded-xl text-black border border-lime-300">
                <Sparkles className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase tracking-tight text-white">AI Queue Advisor</h3>
                <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mt-0.5">Asisten pintar analisis performa antrean</p>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-zinc-400 leading-relaxed">
                Analisis kepadatan antrean secara instan untuk mendapatkan saran penambahan loket aktif atau alokasi staf berdasarkan beban antrean saat ini.
              </p>

              <button
                id="btn-admin-request-advice"
                onClick={handleRequestAdvice}
                disabled={loadingAdvice}
                className="w-full py-3.5 bg-lime-400 hover:bg-lime-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center space-x-2 border border-lime-300 cursor-pointer"
              >
                <Brain className="w-4 h-4" />
                <span>{loadingAdvice ? "MENGANALISIS POLA..." : "ANALISIS BEBAN ANTREAN AI"}</span>
              </button>

              <AnimatePresence mode="wait">
                {advice && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-4 bg-zinc-950 rounded-2xl border border-zinc-800 shadow-inner overflow-hidden"
                  >
                    <div className="flex items-center space-x-1.5 mb-2.5 text-white">
                      <Sparkles className="w-4 h-4 text-lime-400 animate-pulse" />
                      <span className="text-[10px] font-black uppercase tracking-wider font-mono">REKOMENDASI AI:</span>
                    </div>
                    <div className="text-xs text-zinc-300 leading-relaxed prose prose-invert max-w-none font-mono text-[11px]">
                      {advice.split("\n").map((line, i) => {
                        // Safe bolding parser for simple markdown styling
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

          {/* Quick Stats Summary Graphic */}
          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 shadow-xl space-y-4">
            <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-lime-400" />
              Statistik Distribusi Layanan
            </h4>

            <div className="space-y-4">
              {[
                { name: "Kasir / Teller", code: "A", color: "bg-lime-400" },
                { name: "Customer Service", code: "B", color: "bg-sky-400" },
                { name: "Klaim & Pengembalian", code: "C", color: "bg-amber-400" },
                { name: "Konsultasi Teknis", code: "D", color: "bg-purple-500" }
              ].map((svc) => {
                const count = queues.filter(q => q.serviceType === svc.name).length;
                const percent = queues.length > 0 ? Math.round((count / queues.length) * 100) : 0;
                return (
                  <div key={svc.name} className="space-y-1">
                    <div className="flex justify-between text-xs font-black uppercase tracking-tight text-zinc-300">
                      <span>{svc.name}</span>
                      <span className="font-mono text-zinc-500">{count} tiket ({percent}%)</span>
                    </div>
                    <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-850">
                      <div className={`${svc.color} h-full rounded-full transition-all duration-500`} style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
