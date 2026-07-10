import React, { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  updateDoc,
  doc
} from "firebase/firestore";
import { Branch, QueueTicket, Counter } from "../types";
import { speakQueueCall } from "../lib/voice";
import { 
  Users, 
  Clock, 
  Tv, 
  UserCheck, 
  Printer, 
  HelpCircle, 
  MapPin, 
  Layers, 
  Volume2, 
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface CustomerPanelProps {
  branches: Branch[];
  lockedBranchId?: string;
}

export default function CustomerPanel({ branches, lockedBranchId }: CustomerPanelProps) {
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [queues, setQueues] = useState<QueueTicket[]>([]);
  const [counters, setCounters] = useState<Counter[]>([]);
  
  // New ticket state
  const [customerName, setCustomerName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [serviceType, setServiceType] = useState("Kasir / Teller");
  
  // My active ticket (stored in local storage / component state)
  const [myTicketId, setMyTicketId] = useState<string>(() => {
    return localStorage.getItem("my_active_ticket_id") || "";
  });
  const [myTicket, setMyTicket] = useState<QueueTicket | null>(null);

  // Sound settings
  const [enableSound, setEnableSound] = useState(true);

  // Auto-select first branch if available
  useEffect(() => {
    if (lockedBranchId) {
      setSelectedBranchId(lockedBranchId);
    } else if (branches.length > 0 && !selectedBranchId) {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, selectedBranchId, lockedBranchId]);

  // Sync My Ticket from localStorage
  useEffect(() => {
    if (myTicketId) {
      localStorage.setItem("my_active_ticket_id", myTicketId);
    } else {
      localStorage.removeItem("my_active_ticket_id");
    }
  }, [myTicketId]);

  // Real-time listener for branch queues
  useEffect(() => {
    if (!selectedBranchId) return;

    const queuesRef = collection(db, `branches/${selectedBranchId}/queues`);
    const q = query(queuesRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const queueList: QueueTicket[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        queueList.push({
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
      setQueues(queueList);

      // Look for my ticket in the fresh list
      if (myTicketId) {
        const found = queueList.find(t => t.id === myTicketId);
        if (found) {
          // If status transitioned to serving and was just called, trigger Indonesian voice synthesizer
          if (myTicket && myTicket.status === "waiting" && found.status === "serving" && enableSound) {
            speakQueueCall(found.queueNumber, found.counterNumber || 1);
          }
          setMyTicket(found);
        } else {
          setMyTicket(null);
        }
      }
    });

    return () => unsubscribe();
  }, [selectedBranchId, myTicketId, myTicket, enableSound]);

  // Real-time listener for branch counters
  useEffect(() => {
    if (!selectedBranchId) return;

    const countersRef = collection(db, `branches/${selectedBranchId}/counters`);
    const unsubscribe = onSnapshot(countersRef, (snapshot) => {
      const counterList: Counter[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        counterList.push({
          id: doc.id,
          branchId: selectedBranchId,
          counterNumber: data.counterNumber,
          status: data.status,
          currentTicketId: data.currentTicketId,
          operatorName: data.operatorName,
        });
      });
      setCounters(counterList);
    });

    return () => unsubscribe();
  }, [selectedBranchId]);

  // Voice announcement listener for ANY ticket called in the lobby
  const [lastAnnouncedId, setLastAnnouncedId] = useState<string>("");
  useEffect(() => {
    if (!enableSound || queues.length === 0) return;
    
    // Find tickets that are currently 'serving' and called recently
    const activeCalls = queues.filter(q => q.status === "serving" && q.calledAt);
    if (activeCalls.length > 0) {
      // Sort to get the most recently called
      activeCalls.sort((a, b) => b.calledAt!.localeCompare(a.calledAt!));
      const mostRecent = activeCalls[0];
      
      // If we haven't announced this ticket call yet
      if (mostRecent.id !== lastAnnouncedId) {
        setLastAnnouncedId(mostRecent.id);
        speakQueueCall(mostRecent.queueNumber, mostRecent.counterNumber || 1);
      }
    }
  }, [queues, enableSound, lastAnnouncedId]);

  // Handle generating a new ticket
  const handleTakeTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranchId || !customerName.trim()) return;

    try {
      // Calculate prefix based on service type
      let prefix = "A";
      if (serviceType === "Customer Service") prefix = "B";
      else if (serviceType === "Klaim & Pengembalian") prefix = "C";
      else if (serviceType === "Konsultasi Teknis") prefix = "D";

      // Filter same service prefix queues from today to get sequential number
      const todayPrefixTickets = queues.filter(q => q.queueNumber.startsWith(prefix));
      const nextNum = todayPrefixTickets.length + 1;
      const formattedNumber = `${prefix}-${nextNum.toString().padStart(3, "0")}`;

      const newTicketData = {
        branchId: selectedBranchId,
        queueNumber: formattedNumber,
        customerName: customerName.trim(),
        serviceType: serviceType,
        status: "waiting",
        createdAt: new Date().toISOString(),
        phoneNumber: phoneNumber.trim() || undefined,
      };

      const docRef = await addDoc(collection(db, `branches/${selectedBranchId}/queues`), newTicketData);
      setMyTicketId(docRef.id);
      
      // Reset input fields
      setCustomerName("");
      setPhoneNumber("");
    } catch (err) {
      console.error("Error creating ticket:", err);
    }
  };

  const handleCancelTicket = () => {
    if (confirm("Apakah Anda yakin ingin membatalkan antrean Anda?")) {
      setMyTicketId("");
      setMyTicket(null);
    }
  };

  const selectedBranch = branches.find(b => b.id === selectedBranchId);
  const waitingTickets = queues.filter(q => q.status === "waiting");
  const servingTickets = queues.filter(q => q.status === "serving");

  // Calculate stats
  const totalWaiting = waitingTickets.length;
  // Standard estimated wait time: 4 minutes per waiting customer / active counters
  const activeCountersCount = counters.filter(c => c.status === "active").length || 1;
  const estimatedWaitMin = Math.max(2, Math.ceil((totalWaiting * 4) / activeCountersCount));

  // Find average queue number currently being served
  const lastCalledTicket = queues.find(q => q.status === "serving");

  return (
    <div className="space-y-8" id="customer-panel-root">
      {/* Branch Selector and Volume Toggle banner */}
      <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-zinc-800 rounded-xl text-lime-400 border border-zinc-700">
            <MapPin className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500">
              {lockedBranchId ? "Cabang Terkunci (Kiosk Mode)" : "Pilih Cabang Toko"}
            </label>
            {lockedBranchId ? (
              <div className="text-base font-black uppercase tracking-tight text-white">
                {branches.find(b => b.id === selectedBranchId)?.name || "Cabang Aktif"}
              </div>
            ) : (
              <select
                id="branch-selector"
                value={selectedBranchId}
                onChange={(e) => {
                  setSelectedBranchId(e.target.value);
                  // Clear active ticket if switching branches
                  setMyTicketId("");
                  setMyTicket(null);
                }}
                className="text-base font-black uppercase tracking-tight text-white bg-transparent border-none p-0 focus:ring-0 focus:outline-none cursor-pointer hover:text-lime-400 transition-colors"
              >
                {branches.length === 0 ? (
                  <option value="" className="bg-zinc-900 text-white">Tidak ada cabang tersedia</option>
                ) : (
                  branches.map(branch => (
                    <option key={branch.id} value={branch.id} className="bg-zinc-900 text-white">
                      {branch.name} — {branch.address}
                    </option>
                  ))
                )}
              </select>
            )}
          </div>
        </div>

        {/* Audio Speaker Alert Option */}
        <button
          id="toggle-audio-btn"
          onClick={() => setEnableSound(!enableSound)}
          className={`flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
            enableSound 
              ? "bg-lime-400 text-black border-lime-300" 
              : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white"
          }`}
        >
          <Volume2 className={`w-4 h-4 ${enableSound ? "animate-bounce" : ""}`} />
          <span>{enableSound ? "Suara Panggilan Aktif" : "Suara Panggilan Senyap"}</span>
        </button>
      </div>

      {/* Main Dashboard Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Real-time Monitor Board (8 cols in lg) */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* Lobby Real-time TV Screen */}
          <div className="bg-zinc-950 text-white rounded-3xl overflow-hidden shadow-2xl relative border-4 border-zinc-800">
            {/* Top Bar */}
            <div className="bg-zinc-900 px-6 py-4 flex justify-between items-center border-b border-zinc-800">
              <div className="flex items-center space-x-2">
                <Tv className="w-5 h-5 text-lime-400 animate-pulse" />
                <span className="font-mono text-[10px] font-black tracking-[0.2em] text-zinc-400">LOBBY TV MONITOR</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-lime-400 animate-ping"></span>
                <span className="text-[10px] font-black text-lime-400 font-mono uppercase tracking-wider">REAL-TIME SYNCED</span>
              </div>
            </div>

            {/* Main Screen Content */}
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Giant Current Called */}
              <div className="bg-zinc-900/50 rounded-2xl p-6 text-center flex flex-col justify-center items-center border border-zinc-800 relative overflow-hidden">
                <div className="absolute top-0 right-0 px-3 py-1 bg-lime-400 text-black text-[9px] font-black uppercase tracking-wider">
                  PANGGILAN TERAKHIR
                </div>
                <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 mt-4">NOMOR ANTREAN</h3>
                <div className="text-7xl font-black font-mono text-lime-400 my-4 tracking-tighter">
                  {lastCalledTicket ? lastCalledTicket.queueNumber : "—"}
                </div>
                <p className="text-sm font-black uppercase tracking-tight text-zinc-300 truncate max-w-full">
                  {lastCalledTicket ? lastCalledTicket.customerName : "Belum ada panggilan"}
                </p>
                <div className="mt-5 px-4 py-2 bg-zinc-950 rounded-lg inline-flex items-center space-x-2 text-xs font-bold text-zinc-400 border border-zinc-800">
                  <span className="uppercase text-[10px] tracking-wider text-zinc-500">Silakan ke:</span>
                  <span className="font-black text-lime-400 text-xs uppercase font-mono">LOKET {lastCalledTicket?.counterNumber || "—"}</span>
                </div>
              </div>

              {/* Counter status grid */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-wider mb-2">DAFTAR LOKET AKTIF</h4>
                {counters.length === 0 ? (
                  <div className="text-center py-10 text-zinc-600 text-xs font-mono uppercase">
                    Belum ada loket aktif saat ini.
                  </div>
                ) : (
                  counters.map(counter => {
                    // Find active ticket details served at this counter
                    const activeTicket = queues.find(q => q.status === "serving" && q.counterNumber === counter.counterNumber);
                    return (
                      <div 
                        key={counter.id} 
                        className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                          counter.status === "active" 
                            ? "bg-zinc-900 border-zinc-800" 
                            : "bg-zinc-950/40 border-zinc-900/40 opacity-30"
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <span className={`w-2.5 h-2.5 rounded-full ${counter.status === "active" ? "bg-lime-400" : "bg-zinc-700"}`}></span>
                          <div>
                            <p className="text-xs font-black text-white uppercase tracking-tight">Loket {counter.counterNumber}</p>
                            <p className="text-[10px] font-mono text-zinc-500 mt-0.5">{counter.operatorName || "Staf Toko"}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          {counter.status === "active" ? (
                            activeTicket ? (
                              <span className="px-3 py-1 bg-lime-400/10 text-lime-400 rounded-lg text-xs font-mono font-black border border-lime-400/20">
                                {activeTicket.queueNumber}
                              </span>
                            ) : (
                              <span className="text-[9px] font-black uppercase text-lime-400 bg-lime-950/40 px-2.5 py-1 rounded border border-lime-900/50">SIAP</span>
                            )
                          ) : (
                            <span className="text-[9px] font-black tracking-wider text-zinc-600 uppercase font-mono">TUTUP</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Bottom Marquee / Alert */}
            {servingTickets.length > 0 && (
              <div className="bg-lime-400 text-black px-6 py-3 text-xs font-black flex items-center space-x-2 border-t border-lime-300">
                <span className="flex-shrink-0 px-2 py-0.5 bg-black text-lime-400 rounded text-[10px] font-mono font-black uppercase">PANGGILAN:</span>
                <marquee className="font-mono uppercase font-black tracking-tight">
                  {servingTickets.map(t => `Nomor ${t.queueNumber} (${t.customerName}) silakan ke Loket ${t.counterNumber || 1}`).join("  |  ")}
                </marquee>
              </div>
            )}
          </div>

          {/* Quick Statistics Panels */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 shadow-xl flex items-center space-x-4">
              <div className="p-3 bg-zinc-800 rounded-xl text-lime-400 border border-zinc-750">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Antrean Menunggu</p>
                <p className="text-3xl font-black text-white tracking-tight mt-1">
                  {totalWaiting} <span className="text-xs text-zinc-500 font-medium lowercase font-sans">orang</span>
                </p>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 shadow-xl flex items-center space-x-4">
              <div className="p-3 bg-zinc-800 rounded-xl text-lime-400 border border-zinc-750">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Estimasi Tunggu</p>
                <p className="text-3xl font-black text-white tracking-tight mt-1">
                  ± {estimatedWaitMin} <span className="text-xs text-zinc-500 font-medium lowercase font-sans">menit</span>
                </p>
              </div>
            </div>

            <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 shadow-xl flex items-center space-x-4">
              <div className="p-3 bg-zinc-800 rounded-xl text-lime-400 border border-zinc-750">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Loket Melayani</p>
                <p className="text-3xl font-black text-white tracking-tight mt-1">
                  {activeCountersCount} <span className="text-xs text-zinc-500 font-medium lowercase font-sans">aktif</span>
                </p>
              </div>
            </div>
          </div>

          {/* List of active queue numbers for transparency */}
          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 shadow-xl">
            <h3 className="text-xs font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
              <Layers className="w-4 h-4 text-lime-400" />
              Alur Antrean Menunggu Saat Ini
            </h3>
            {waitingTickets.length === 0 ? (
              <p className="text-center py-10 text-zinc-500 text-xs font-mono uppercase">
                Antrean kosong. Silakan ambil tiket antrean baru!
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {waitingTickets.slice().reverse().map((ticket, index) => (
                  <div key={ticket.id} className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-center">
                    <p className="text-xs font-bold text-white truncate">{ticket.customerName}</p>
                    <p className="text-lg font-black text-lime-400 font-mono my-2">{ticket.queueNumber}</p>
                    <span className="text-[9px] px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded font-black uppercase tracking-wider">
                      {ticket.serviceType.split(" ")[0]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Ticket Actions / Active Ticket (5 cols in lg) */}
        <div className="lg:col-span-5 space-y-8">
          
          {/* Active Ticket Card (If the user took a ticket) */}
          <AnimatePresence mode="wait">
            {myTicket ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-zinc-900 text-white rounded-3xl p-8 shadow-2xl relative overflow-hidden border-2 border-lime-400"
                id="my-ticket-card"
              >
                {/* Visual accent background */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-lime-400/5 rounded-full filter blur-xl"></div>

                {/* Ticket Details */}
                <div className="text-center relative">
                  <span className="px-3 py-1 bg-lime-400 text-black rounded text-[10px] font-black tracking-widest font-mono uppercase">
                    TIKET ANTREAN ANDA
                  </span>
                  
                  <h2 className="text-7xl font-black font-mono mt-8 tracking-tighter text-lime-400">
                    {myTicket.queueNumber}
                  </h2>
                  <p className="text-base font-black uppercase tracking-tight text-white mt-3">
                    {myTicket.customerName}
                  </p>

                  <div className="my-6 border-t border-dashed border-zinc-800 relative">
                    {/* Dashed cuts */}
                    <div className="absolute -left-12 -top-3 w-6 h-6 bg-zinc-950 rounded-full"></div>
                    <div className="absolute -right-12 -top-3 w-6 h-6 bg-zinc-950 rounded-full"></div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-left">
                    <div>
                      <p className="text-[9px] text-zinc-500 uppercase font-black tracking-wider">Tipe Layanan</p>
                      <p className="text-xs font-black uppercase tracking-tight text-zinc-200 mt-1 truncate">{myTicket.serviceType}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-zinc-500 uppercase font-black tracking-wider">Status Tiket</p>
                      <span className={`inline-flex items-center px-2 py-1 mt-1 rounded text-[10px] font-black uppercase tracking-wider ${
                        myTicket.status === "waiting" 
                          ? "bg-amber-400/10 text-amber-400 border border-amber-400/20 animate-pulse" 
                          : myTicket.status === "serving"
                          ? "bg-lime-400 text-black animate-bounce"
                          : "bg-zinc-850 text-zinc-500 border border-zinc-800"
                      }`}>
                        {myTicket.status === "waiting" && "Menunggu"}
                        {myTicket.status === "serving" && "PANGGILAN!"}
                        {myTicket.status === "completed" && "Selesai"}
                        {myTicket.status === "skipped" && "Terlewati"}
                      </span>
                    </div>
                  </div>

                  {myTicket.status === "serving" && (
                    <div className="mt-6 bg-lime-400 text-black p-4 rounded-2xl flex items-center space-x-3 text-left">
                      <Volume2 className="w-5 h-5 text-black flex-shrink-0 animate-bounce" />
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider">SILAKAN MENUJU LOKET {myTicket.counterNumber}</p>
                        <p className="text-[10px] font-medium text-black/80 mt-0.5">Nama Anda sedang dipanggil oleh petugas loket.</p>
                      </div>
                    </div>
                  )}

                  {myTicket.status === "waiting" && (
                    <div className="mt-6 bg-zinc-950 p-4 rounded-2xl flex items-center space-x-3 text-left border border-zinc-850">
                      <Clock className="w-5 h-5 text-lime-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-black text-white uppercase tracking-tight">Estimasi Tunggu: ± {estimatedWaitMin} menit</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5 leading-normal">Harap tetap di area lobby. Kami akan memanggil Anda secara otomatis.</p>
                      </div>
                    </div>
                  )}

                  {/* Print / Cancel Button */}
                  <div className="mt-8 flex justify-center space-x-3">
                    <button
                      id="btn-print-ticket"
                      onClick={() => window.print()}
                      className="px-4 py-2.5 bg-lime-400 hover:bg-lime-500 text-black rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center space-x-2 border border-lime-300"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Cetak Tiket</span>
                    </button>
                    <button
                      id="btn-cancel-ticket"
                      onClick={handleCancelTicket}
                      className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-350 rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-zinc-700"
                    >
                      Batalkan Tiket
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              /* Generate Ticket Form */
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800 shadow-xl"
                id="take-ticket-form-container"
              >
                <div className="flex items-center space-x-3 mb-6">
                  <div className="p-2.5 bg-zinc-850 rounded-xl text-lime-400 border border-zinc-800">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black uppercase tracking-tight text-white">Ambil Antrean Baru</h3>
                    <p className="text-[11px] text-zinc-500 font-mono uppercase tracking-wider mt-0.5">Mulai antrean pintar Anda</p>
                  </div>
                </div>

                <form onSubmit={handleTakeTicket} className="space-y-4">
                  <div>
                    <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Nama Pelanggan</label>
                    <input
                      id="input-customer-name"
                      type="text"
                      required
                      placeholder="Masukkan nama lengkap Anda"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-white placeholder-zinc-600 focus:border-lime-400 focus:bg-zinc-950 text-sm focus:outline-none focus:ring-1 focus:ring-lime-400 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">No. Telepon / WhatsApp (Opsional)</label>
                    <input
                      id="input-phone-number"
                      type="tel"
                      placeholder="Contoh: 08123456789"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-white placeholder-zinc-600 focus:border-lime-400 focus:bg-zinc-950 text-sm focus:outline-none focus:ring-1 focus:ring-lime-400 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Layanan yang Dituju</label>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { name: "Kasir / Teller", code: "A", desc: "Setoran, penarikan, pembayaran ritel" },
                        { name: "Customer Service", code: "B", desc: "Informasi umum, registrasi, kartu" },
                        { name: "Klaim & Pengembalian", code: "C", desc: "Retur barang cacat, garansi toko" },
                        { name: "Konsultasi Teknis", code: "D", desc: "Bantuan instalasi, perbaikan gawai" }
                      ].map((svc) => (
                        <button
                          key={svc.name}
                          id={`service-btn-${svc.name.replace(/\s+/g, "-")}`}
                          type="button"
                          onClick={() => setServiceType(svc.name)}
                          className={`flex items-start justify-between p-3.5 rounded-xl border text-left transition-all ${
                            serviceType === svc.name
                              ? "bg-zinc-850 border-lime-400 ring-1 ring-lime-400 text-white"
                              : "bg-zinc-950 border-zinc-800 hover:bg-zinc-850 text-zinc-300"
                          }`}
                        >
                          <div>
                            <p className="text-sm font-black uppercase tracking-tight flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${serviceType === svc.name ? "bg-lime-400" : "bg-zinc-700"}`}></span>
                              {svc.name}
                            </p>
                            <p className="text-xs text-zinc-500 mt-1 leading-normal font-medium">{svc.desc}</p>
                          </div>
                          <span className={`px-2 py-1 rounded font-mono text-xs font-black border ${
                            serviceType === svc.name ? "bg-lime-400 text-black border-lime-300" : "bg-zinc-800 text-zinc-400 border-zinc-700"
                          }`}>
                            {svc.code}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    id="btn-submit-ticket"
                    type="submit"
                    className="w-full mt-4 py-3.5 bg-lime-400 hover:bg-lime-500 text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center space-x-2 border border-lime-300"
                  >
                    <Printer className="w-4 h-4 stroke-[2.5]" />
                    <span>Dapatkan Antrean</span>
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Quick FAQ / Guide */}
          <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 text-zinc-500">
            <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-lime-400" />
              Petunjuk Menggunakan Antrean
            </h4>
            <ul className="text-xs space-y-2.5 leading-relaxed">
              <li className="flex items-start gap-1">
                <span className="text-lime-400 font-bold font-mono">•</span>
                <span>Pilih jenis layanan yang sesuai agar diarahkan ke loket servis yang tepat.</span>
              </li>
              <li className="flex items-start gap-1">
                <span className="text-lime-400 font-bold font-mono">•</span>
                <span>Sistem akan memanggil nomor antrean Anda di lobby TV secara real-time.</span>
              </li>
              <li className="flex items-start gap-1">
                <span className="text-lime-400 font-bold font-mono">•</span>
                <span>Aktifkan "Suara Panggilan" jika Anda ingin mendengarkan suara penyebutan nomor antrean dari perangkat ini.</span>
              </li>
            </ul>
          </div>

        </div>
      </div>
    </div>
  );
}
