import { useState, useRef, useEffect, useCallback } from "react";
import {
  X, Send, ShieldCheck, Lock, AlertTriangle, Briefcase, ChevronRight,
  CheckCircle2, RefreshCw, Zap, BadgeDollarSign,
} from "lucide-react";
import { PLATFORM_FEE_LAMA } from "@/types/escrow";

// ── Bypass detection (RegEx + keyword) ─────────────────────────────
const BYPASS_RE = /(?:0[0-9]{8,13}|\+62[0-9]{8,12}|(?<![a-z])wa(?![a-z])|whatsapp|transfer\s*langsung|bayar\s*(?:di\s*luar|langsung|cash|tunai)|di\s*luar\s*(?:aplikasi|sistem)|kasih\s*nomor|minta\s*(?:wa|nomor|kontak|hp)|hubungi\s*(?:langsung|saya)|pindah\s*wa|bb[mn]|telpon(?:an)?|line\s*aja)/gi;

function hasBypass(text: string): boolean {
  BYPASS_RE.lastIndex = 0;
  return BYPASS_RE.test(text);
}

// ── Types ───────────────────────────────────────────────────────────
interface ChatMessage {
  id: number;
  sender: "company" | "worker";
  text: string;
  time: Date;
  isOfferMsg?: boolean;
  offerAmount?: number;
  offerStatus?: "pending" | "accepted" | "countered";
}

export interface ChatModalProps {
  jobTitle: string;
  nominal: number;
  companyName: string;
  workerName: string;
  currentRole: "company" | "worker";
  hiringMode?: "cepat" | "lama";
  onClose: () => void;
  onNominalUpdate?: (newNominal: number) => void;
}

let msgId = 100;

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 1, sender: "company",
    text: "Halo! Lamaran Anda untuk posisi ini telah kami terima. Mohon pastikan ketersediaan jadwal Anda.",
    time: new Date(Date.now() - 120000),
  },
  {
    id: 2, sender: "worker",
    text: "Siap! Saya tersedia sesuai jadwal yang tertera. Ada instruksi khusus dari perusahaan?",
    time: new Date(Date.now() - 60000),
  },
];

// ── Buy-Out Modal ────────────────────────────────────────────────────
function BuyOutModal({ jobTitle, nominal, onClose }: { jobTitle: string; nominal: number; onClose: () => void }) {
  const monthly = nominal * 8 * 22;
  return (
    <div className="fixed inset-0 z-[350] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}>
      <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-5" style={{ animation: "popIn 0.25s cubic-bezier(0.175,0.885,0.32,1.275)" }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-black text-gray-900">Ajukan Kontrak Tetap</h3>
            <p className="text-xs text-gray-500 mt-0.5">Simulasi Buy-Out — Rekruitmen Legal</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"><X className="w-4 h-4 text-gray-600" /></button>
        </div>
        <div className="bg-primary/5 border border-primary/15 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-bold text-primary flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Posisi: {jobTitle}</p>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Estimasi Gaji Bulanan</span>
              <span className="font-semibold">Rp {monthly.toLocaleString("id-ID")}</span>
            </div>
            <div className="flex justify-between border-t border-primary/10 pt-1.5">
              <span className="text-gray-500">Buy-Out Fee (1× Gaji)</span>
              <span className="font-bold text-primary">Rp {monthly.toLocaleString("id-ID")}</span>
            </div>
          </div>
        </div>
        <div className="space-y-2 text-xs text-gray-600">
          {[
            "Kontrak kerja tetap resmi berlegalisasi notaris",
            "Penghentian komisi platform setelah transfer",
            "BPJS Ketenagakerjaan & BPJS Kesehatan terdaftar",
          ].map(t => (
            <div key={t} className="flex items-start gap-2"><ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" /><span>{t}</span></div>
          ))}
        </div>
        <button onClick={onClose} className="w-full bg-primary text-white font-bold py-3 rounded-xl text-sm">Hubungi Tim Legal GigFinder</button>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────
export default function ChatModal({
  jobTitle, nominal, companyName, workerName,
  currentRole, hiringMode = "lama", onClose, onNominalUpdate,
}: ChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [bypassWarning, setBypassWarning] = useState(false);
  const [showBuyOut, setShowBuyOut] = useState(false);

  // ── Negotiation state ─────────────────────────────────────────────
  const [lockedNominal, setLockedNominal] = useState<number | null>(null);
  const [pendingOffer, setPendingOffer] = useState<{ amount: number; from: "company" | "worker" } | null>(null);
  const [showOfferInput, setShowOfferInput] = useState(false);
  const [offerRaw, setOfferRaw] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const currentNominal = lockedNominal ?? nominal;
  const fee7 = Math.round(currentNominal * PLATFORM_FEE_LAMA);
  const totalEscrow = currentNominal + fee7;
  const dealLocked = lockedNominal !== null;
  const canNegotiate = hiringMode !== "cepat" && !dealLocked;
  const isOtherPartyOffer = pendingOffer && pendingOffer.from !== currentRole;

  // ── Send regular message ──────────────────────────────────────────
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    if (hasBypass(text)) { setBypassWarning(true); return; }
    setMessages(prev => [...prev, { id: ++msgId, sender: currentRole, text, time: new Date() }]);
    setInput("");
    setTimeout(() => {
      const pool = currentRole === "company"
        ? ["Terima kasih, kami catat. Harap tiba 15 menit sebelum shift.", "Baik, kami konfirmasi segera.", "Instruksi akan dikirim via sistem sebelum hari H."]
        : ["Siap, kami proses. Ada hal lain yang perlu dipersiapkan?", "Terima kasih konfirmasinya.", "Oke, saya sudah catat lokasinya."];
      setMessages(prev => [...prev, {
        id: ++msgId,
        sender: currentRole === "company" ? "worker" : "company",
        text: pool[Math.floor(Math.random() * pool.length)],
        time: new Date(),
      }]);
    }, 800);
  }, [input, currentRole]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Send wage offer ───────────────────────────────────────────────
  const handleSendOffer = () => {
    const amount = parseInt(offerRaw.replace(/\D/g, ""));
    if (!amount || amount < 10_000) return;
    setMessages(prev => [...prev, {
      id: ++msgId,
      sender: currentRole,
      text: `💰 Tawaran Upah Baru: Rp ${amount.toLocaleString("id-ID")}`,
      time: new Date(),
      isOfferMsg: true,
      offerAmount: amount,
      offerStatus: "pending",
    }]);
    setPendingOffer({ amount, from: currentRole });
    setShowOfferInput(false);
    setOfferRaw("");
  };

  // ── Accept offer ──────────────────────────────────────────────────
  const handleAcceptOffer = (amount: number) => {
    setMessages(prev => prev.map(m =>
      m.isOfferMsg && m.offerStatus === "pending" ? { ...m, offerStatus: "accepted" as const } : m
    ));
    setMessages(prev => [...prev, {
      id: ++msgId, sender: currentRole,
      text: `✅ Kesepakatan! Upah Rp ${amount.toLocaleString("id-ID")} resmi disetujui. Escrow diperbarui.`,
      time: new Date(),
    }]);
    setLockedNominal(amount);
    setPendingOffer(null);
    onNominalUpdate?.(amount);
  };

  // ── Counter offer ─────────────────────────────────────────────────
  const handleCounterOffer = () => {
    setMessages(prev => prev.map(m =>
      m.isOfferMsg && m.offerStatus === "pending" ? { ...m, offerStatus: "countered" as const } : m
    ));
    setPendingOffer(null);
    setShowOfferInput(true);
    setOfferRaw("");
  };

  function formatTime(d: Date) {
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <>
      {showBuyOut && <BuyOutModal jobTitle={jobTitle} nominal={currentNominal} onClose={() => setShowBuyOut(false)} />}

      {/* ── Bypass Warning Modal ─────────────────────────────────── */}
      {bypassWarning && (
        <div className="fixed inset-0 z-[340] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }}>
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4" style={{ animation: "popIn 0.25s cubic-bezier(0.175,0.885,0.32,1.275)" }}>
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <div className="text-center space-y-2">
              <h3 className="font-black text-red-600 text-base">🚫 Pesan Diblokir!</h3>
              <p className="text-sm font-bold text-gray-800">Deteksi Bypass Keamanan Rekhastha</p>
              <div className="bg-gray-900 text-green-400 rounded-xl px-3 py-2 text-xs font-mono text-left break-all">
                [*** SENSOR KEAMANAN REKHASTHA ***]
              </div>
            </div>
            <div className={`rounded-xl p-3 border ${currentRole === "worker" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
              <p className="text-[11px] leading-relaxed font-medium text-center">
                {currentRole === "worker"
                  ? "⚠️ Transaksi di luar aplikasi menghilangkan perlindungan BPJS Ketenagakerjaan dan asuransi kecelakaan kerja Anda."
                  : "⚠️ Pembayaran di luar escrow menghilangkan jaminan anti-pencurian tenaga kerja dan tidak ada bukti hukum yang melindungi perusahaan."}
              </p>
            </div>
            <p className="text-[10px] text-gray-500 text-center">Pelanggaran berulang mengakibatkan pembekuan akun permanen.</p>
            <button
              onClick={() => { setBypassWarning(false); setInput(""); inputRef.current?.focus(); }}
              className="w-full bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl text-sm hover:bg-gray-200 transition-colors">
              Mengerti, Hapus Pesan
            </button>
          </div>
        </div>
      )}

      {/* ── Chat Modal ───────────────────────────────────────────── */}
      <div className="fixed inset-0 z-[300] flex flex-col" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}>
        <div className="absolute inset-0" onClick={onClose} />
        <div
          className="relative flex flex-col bg-white w-full h-full"
          style={{ animation: "slideUpFull 0.28s cubic-bezier(0.32,0.72,0,1)" }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-primary text-white shrink-0">
            <div className="bg-primary/80 px-4 py-1.5 flex items-center gap-2 overflow-hidden border-b border-white/10">
              <Lock className="w-3 h-3 text-white/80 shrink-0" />
              <div className="overflow-hidden flex-1">
                <p className="text-[10px] text-white/90 font-medium whitespace-nowrap" style={{ animation: "ticker 18s linear infinite" }}>
                  🔒 Ruang Chat Terproteksi · Transaksi dijamin escrow Rekhastha · Asuransi BPJS aktif setelah Clock-In QR.&nbsp;&nbsp;&nbsp;🔒 Ruang Chat Terproteksi · Transaksi dijamin escrow Rekhastha · Asuransi BPJS aktif setelah Clock-In QR.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"><X className="w-4 h-4 text-white" /></button>
                <div>
                  <p className="font-bold text-sm leading-tight">{jobTitle}</p>
                  <p className="text-[10px] text-white/70">
                    {currentRole === "company" ? workerName : companyName}
                    {" "}· {hiringMode === "cepat" ? "⚡ Mode Cepat" : "📅 Mode Lama"}
                  </p>
                </div>
              </div>
              {currentRole === "company" && (
                <button
                  onClick={() => setShowBuyOut(true)}
                  className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-[10px] font-semibold px-3 py-1.5 rounded-full transition-colors">
                  <Briefcase className="w-3 h-3" /> Kontrak Tetap <ChevronRight className="w-3 h-3 opacity-70" />
                </button>
              )}
            </div>
          </div>

          {/* Cepat mode: locked wage banner */}
          {hiringMode === "cepat" && (
            <div className="bg-orange-50 border-b border-orange-200 px-4 py-2.5 flex items-center gap-2.5 shrink-0">
              <Zap className="w-4 h-4 text-orange-600 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-bold text-orange-800">⚡ Mode Butuh Cepat — Upah Terkunci</p>
                <p className="text-[10px] text-orange-700">
                  Nominal upah <span className="font-bold">Rp {nominal.toLocaleString("id-ID")}</span> tidak dapat dimodifikasi. Negosiasi dinonaktifkan.
                </p>
              </div>
              <Lock className="w-4 h-4 text-orange-400 shrink-0" />
            </div>
          )}

          {/* Deal locked banner (Bisa Lama, after negotiation) */}
          {dealLocked && (
            <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2.5 flex items-center gap-2.5 shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-emerald-800">✅ Kesepakatan Upah Terkunci</p>
                <p className="text-[10px] text-emerald-700 flex flex-wrap gap-x-2">
                  <span>Upah Pokok: <b>Rp {lockedNominal!.toLocaleString("id-ID")}</b></span>
                  <span>· Biaya Sistem (7%): Rp {fee7.toLocaleString("id-ID")}</span>
                  <span>· Total Escrow: <b>Rp {totalEscrow.toLocaleString("id-ID")}</b></span>
                </p>
              </div>
            </div>
          )}

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ background: "#ece5dd" }}>
            <div className="flex justify-center my-2">
              <span className="bg-white/80 text-gray-500 text-[10px] font-medium px-3 py-1 rounded-full shadow-sm">Hari ini</span>
            </div>

            {messages.map(msg => {
              const isMine = msg.sender === currentRole;
              const isReceivedPendingOffer = msg.isOfferMsg && !isMine && msg.offerStatus === "pending";
              return (
                <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[82%] space-y-1.5">
                    <div className={`px-3.5 py-2.5 rounded-2xl shadow-sm ${
                      msg.isOfferMsg
                        ? msg.offerStatus === "accepted"
                          ? "bg-emerald-100 border border-emerald-300 text-emerald-900"
                          : msg.offerStatus === "countered"
                            ? "bg-gray-100 border border-gray-200 text-gray-500"
                            : isMine
                              ? "bg-amber-100 border border-amber-200 text-amber-900"
                              : "bg-blue-50 border border-blue-200 text-blue-900"
                        : isMine
                          ? "bg-primary text-white rounded-tr-sm"
                          : "bg-white text-gray-900 rounded-tl-sm"
                    }`}>
                      {!isMine && !msg.isOfferMsg && (
                        <p className="text-[10px] font-bold text-primary mb-0.5">
                          {msg.sender === "company" ? companyName : workerName}
                        </p>
                      )}
                      {msg.isOfferMsg && (
                        <div className="flex items-center gap-1.5 mb-1">
                          <BadgeDollarSign className="w-3.5 h-3.5 shrink-0" />
                          <span className="text-[10px] font-black uppercase tracking-wide flex-1">Tawaran Upah</span>
                          {msg.offerStatus === "accepted" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                          {msg.offerStatus === "countered" && <span className="text-[10px] text-gray-400">⚡ Di-counter</span>}
                        </div>
                      )}
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                      <p className={`text-[10px] mt-1 text-right ${
                        msg.isOfferMsg ? "opacity-50" : isMine ? "text-white/60" : "text-gray-400"
                      }`}>{formatTime(msg.time)}</p>
                    </div>

                    {/* Receiver sees Accept / Counter buttons */}
                    {isReceivedPendingOffer && msg.offerAmount && (
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleAcceptOffer(msg.offerAmount!)}
                          className="flex-1 flex items-center justify-center gap-1 bg-emerald-500 text-white text-[10px] font-black py-2 rounded-xl active:scale-95 transition-all shadow-sm">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Setujui Upah
                        </button>
                        <button
                          onClick={handleCounterOffer}
                          className="flex-1 flex items-center justify-center gap-1 bg-blue-500 text-white text-[10px] font-black py-2 rounded-xl active:scale-95 transition-all shadow-sm">
                          <RefreshCw className="w-3.5 h-3.5" /> Tawar Balik
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Offer input panel */}
          {canNegotiate && showOfferInput && (
            <div className="bg-amber-50 border-t border-amber-200 px-3 py-3 shrink-0">
              <p className="text-[10px] font-bold text-amber-800 mb-2">
                💰 {pendingOffer === null ? "Ajukan Tawaran Upah Baru" : "Masukkan Counter Offer"} — Mode Bisa Lama
              </p>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center bg-white border border-amber-300 rounded-xl px-3 py-2 gap-1.5">
                  <span className="text-sm text-gray-400 font-medium shrink-0">Rp</span>
                  <input
                    type="text"
                    value={offerRaw}
                    onChange={e => {
                      const raw = e.target.value.replace(/\D/g, "");
                      setOfferRaw(raw ? parseInt(raw).toLocaleString("id-ID") : "");
                    }}
                    placeholder="cth: 250.000"
                    className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleSendOffer}
                  disabled={!offerRaw}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${offerRaw ? "bg-amber-500 text-white active:scale-95" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}>
                  Kirim
                </button>
                <button
                  onClick={() => { setShowOfferInput(false); setOfferRaw(""); }}
                  className="px-3 py-2 rounded-xl bg-gray-100 text-gray-500 text-xs font-bold">
                  Batal
                </button>
              </div>
            </div>
          )}

          {/* Input bar */}
          <div className="bg-white border-t border-gray-100 px-3 py-3 shrink-0 safe-area-bottom">
            {/* Negotiate button */}
            {canNegotiate && !showOfferInput && !isOtherPartyOffer && (
              <button
                onClick={() => setShowOfferInput(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold mb-2.5 hover:bg-amber-100 active:scale-[0.98] transition-all">
                <BadgeDollarSign className="w-3.5 h-3.5" />
                💰 Ubah Nominal Upah (Negosiasi Berkelanjutan)
              </button>
            )}

            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 flex items-center">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ketik pesan..."
                  className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                />
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${input.trim() ? "bg-primary hover:bg-primary/90 active:scale-95" : "bg-gray-200"}`}>
                <Send className={`w-4 h-4 ${input.trim() ? "text-white" : "text-gray-400"}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUpFull { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes popIn { from{transform:scale(0.8);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes ticker { from{transform:translateX(0%)} to{transform:translateX(-50%)} }
        .safe-area-bottom { padding-bottom: max(12px, env(safe-area-inset-bottom)); }
      `}</style>
    </>
  );
}
