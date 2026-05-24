import { useState, useRef, useEffect, useCallback } from "react";
import {
  X, Send, ShieldCheck, Lock, ChevronRight, AlertTriangle, Briefcase,
} from "lucide-react";

interface ChatMessage {
  id: number;
  sender: "company" | "worker";
  text: string;
  time: Date;
}

interface BuyOutModalProps {
  jobTitle: string;
  nominal: number;
  onClose: () => void;
}

const BYPASS_KEYWORDS = [
  "nomor wa", "minta kontak", "bayar cash", "pindah wa", "batalin aplikasi",
  "minta nomor hp", "transfer langsung", "whatsapp", "nomor hp", "hubungi langsung",
  "wa aja", "telpon", "bbm", "line aja", "bayar di luar", "di luar aplikasi",
  "cash langsung", "minta wa", "kasih nomor", "hubungi saya",
];

function detectBypass(text: string): string | null {
  const lower = text.toLowerCase();
  for (const kw of BYPASS_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

let msgId = 1;

function BuyOutModal({ jobTitle, nominal, onClose }: BuyOutModalProps) {
  const monthlyEquiv = nominal * 8 * 22; // ~22 working days
  const buyOutFee = monthlyEquiv;

  return (
    <div
      className="fixed inset-0 z-[350] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-5"
        style={{ animation: "popIn 0.25s cubic-bezier(0.175,0.885,0.32,1.275)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-black text-gray-900">Ajukan Kontrak Tetap</h3>
            <p className="text-xs text-gray-500 mt-0.5">Simulasi Buy-Out — Perekrutan Legal</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="bg-primary/5 border border-primary/15 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-bold text-primary flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5" /> Posisi: {jobTitle}
          </p>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Estimasi Gaji Bulanan</span>
              <span className="font-semibold text-gray-900">
                Rp {monthlyEquiv.toLocaleString("id-ID")}
              </span>
            </div>
            <div className="flex justify-between border-t border-primary/10 pt-1.5">
              <span className="text-gray-500">Buy-Out Fee (1× Gaji)</span>
              <span className="font-bold text-primary">
                Rp {buyOutFee.toLocaleString("id-ID")}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2.5 text-xs text-gray-600">
          <p className="font-semibold text-gray-800">Apa yang termasuk dalam Buy-Out?</p>
          {[
            "Kontrak kerja tetap resmi berlegalisasi notaris",
            "Penghentian komisi platform setelah transfer",
            "BPJS Ketenagakerjaan & BPJS Kesehatan terdaftar",
            "Bukti Potong PPh 21 tahunan (Form 1721-A1)",
          ].map((item) => (
            <div key={item} className="flex items-start gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <span>{item}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full bg-primary text-white font-bold py-3 rounded-xl text-sm hover:bg-primary/90 transition-colors"
          style={{ boxShadow: "0 4px 16px rgba(6,95,70,0.3)" }}
        >
          Hubungi Tim Legal GigFinder
        </button>
      </div>
      <style>{`@keyframes popIn { from{transform:scale(0.8);opacity:0} to{transform:scale(1);opacity:1} }`}</style>
    </div>
  );
}

interface ChatModalProps {
  jobTitle: string;
  nominal: number;
  companyName: string;
  workerName: string;
  currentRole: "company" | "worker";
  onClose: () => void;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: msgId++, sender: "company",
    text: "Halo! Lamaran Anda untuk posisi ini telah kami terima. Mohon pastikan ketersediaan jadwal Anda.",
    time: new Date(Date.now() - 120000),
  },
  {
    id: msgId++, sender: "worker",
    text: "Siap! Saya tersedia sesuai jadwal yang tertera. Ada instruksi khusus dari perusahaan?",
    time: new Date(Date.now() - 60000),
  },
];

export default function ChatModal({ jobTitle, nominal, companyName, workerName, currentRole, onClose }: ChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [blockedKw, setBlockedKw] = useState<string | null>(null);
  const [showBuyOut, setShowBuyOut] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    const kw = detectBypass(text);
    if (kw) {
      setBlockedKw(kw);
      return;
    }

    setMessages((prev) => [
      ...prev,
      { id: msgId++, sender: currentRole, text, time: new Date() },
    ]);
    setInput("");

    // Auto-reply simulation from the other party
    setTimeout(() => {
      const replies =
        currentRole === "company"
          ? [
              "Terima kasih informasinya, kami akan konfirmasi lebih lanjut.",
              "Baik, sudah kami catat. Harap tiba 15 menit sebelum jam kerja.",
              "Oke, nanti kami kirimkan briefing via sistem ini.",
            ]
          : [
              "Baik, siap kami proses. Ada lagi yang perlu dipersiapkan?",
              "Terima kasih konfirmasinya. Dress code sudah sesuai prosedur ya.",
              "Oke, ditunggu kehadirannya sesuai lokasi di peta.",
            ];
      const reply = replies[Math.floor(Math.random() * replies.length)];
      setMessages((prev) => [
        ...prev,
        {
          id: msgId++,
          sender: currentRole === "company" ? "worker" : "company",
          text: reply,
          time: new Date(),
        },
      ]);
    }, 800);
  }, [input, currentRole]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  function formatTime(d: Date) {
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <>
      {showBuyOut && (
        <BuyOutModal jobTitle={jobTitle} nominal={nominal} onClose={() => setShowBuyOut(false)} />
      )}

      {/* Blocked message warning */}
      {blockedKw && (
        <div
          className="fixed inset-0 z-[340] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }}
        >
          <div
            className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4"
            style={{ animation: "popIn 0.25s cubic-bezier(0.175,0.885,0.32,1.275)" }}
          >
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7 text-red-500" />
            </div>
            <div className="text-center space-y-1.5">
              <h3 className="font-black text-red-600 text-base">❌ Pesan Diblokir!</h3>
              <p className="text-sm font-semibold text-gray-800">Deteksi Transaksi Luar Aplikasi</p>
              <p className="text-xs text-gray-600 leading-relaxed">
                Kata kunci terlarang terdeteksi:{" "}
                <span className="font-bold text-red-500">"{blockedKw}"</span>
              </p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-[11px] text-red-700 leading-relaxed text-center">
                Pelanggaran sistem dapat mengakibatkan <strong>pembekuan akun permanen</strong> dan hilangnya jaminan asuransi kerja.
              </p>
            </div>
            <button
              onClick={() => { setBlockedKw(null); setInput(""); inputRef.current?.focus(); }}
              className="w-full bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl text-sm hover:bg-gray-200 transition-colors"
            >
              Mengerti, Hapus Pesan
            </button>
          </div>
        </div>
      )}

      {/* Chat modal */}
      <div
        className="fixed inset-0 z-[300] flex flex-col"
        style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
      >
        <div className="absolute inset-0" onClick={onClose} />
        <div
          className="relative flex flex-col bg-white w-full h-full"
          style={{ animation: "slideUpFull 0.28s cubic-bezier(0.32,0.72,0,1)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-primary text-white shrink-0">
            {/* Protection banner ticker */}
            <div className="bg-primary/80 px-4 py-1.5 flex items-center gap-2 overflow-hidden border-b border-white/10">
              <Lock className="w-3 h-3 text-white/80 shrink-0" />
              <div className="overflow-hidden flex-1">
                <p
                  className="text-[10px] text-white/90 font-medium whitespace-nowrap"
                  style={{ animation: "ticker 18s linear infinite" }}
                >
                  🔒 Ruang Chat Terproteksi: Transaksi resmi dijamin asuransi BPJS Ketenagakerjaan (Clock-In) & Bukti Potong Pajak PPh 21.&nbsp;&nbsp;&nbsp;🔒 Ruang Chat Terproteksi: Transaksi resmi dijamin asuransi BPJS Ketenagakerjaan (Clock-In) & Bukti Potong Pajak PPh 21.
                </p>
              </div>
            </div>

            {/* Chat header row */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                  <X className="w-4 h-4 text-white" />
                </button>
                <div>
                  <p className="font-bold text-sm leading-tight">{jobTitle}</p>
                  <p className="text-[10px] text-white/70">
                    {currentRole === "company" ? workerName : companyName} · Chat Aman
                  </p>
                </div>
              </div>
              {currentRole === "company" && (
                <button
                  data-testid="button-buyout"
                  onClick={() => setShowBuyOut(true)}
                  className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-[10px] font-semibold px-3 py-1.5 rounded-full transition-colors"
                >
                  <Briefcase className="w-3 h-3" />
                  Kontrak Tetap
                  <ChevronRight className="w-3 h-3 opacity-70" />
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div
            className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
            style={{ background: "#ece5dd" }}
          >
            {/* Date divider */}
            <div className="flex justify-center my-2">
              <span className="bg-white/80 text-gray-500 text-[10px] font-medium px-3 py-1 rounded-full shadow-sm">
                Hari ini
              </span>
            </div>

            {messages.map((msg) => {
              const isMine = msg.sender === currentRole;
              return (
                <div
                  key={msg.id}
                  className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[78%] px-3.5 py-2.5 rounded-2xl shadow-sm ${
                      isMine
                        ? "bg-primary text-white rounded-tr-sm"
                        : "bg-white text-gray-900 rounded-tl-sm"
                    }`}
                  >
                    {!isMine && (
                      <p className="text-[10px] font-bold text-primary mb-0.5">
                        {msg.sender === "company" ? companyName : workerName}
                      </p>
                    )}
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                    <p className={`text-[10px] mt-1 text-right ${isMine ? "text-white/60" : "text-gray-400"}`}>
                      {formatTime(msg.time)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div className="bg-white border-t border-gray-100 px-3 py-3 flex items-end gap-2 shrink-0 safe-area-bottom">
            <div className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 flex items-center">
              <input
                ref={inputRef}
                data-testid="input-chat-message"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ketik pesan..."
                className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
              />
            </div>
            <button
              data-testid="button-chat-send"
              onClick={handleSend}
              disabled={!input.trim()}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                input.trim() ? "bg-primary hover:bg-primary/90 active:scale-95" : "bg-gray-200"
              }`}
            >
              <Send className={`w-4 h-4 ${input.trim() ? "text-white" : "text-gray-400"}`} />
            </button>
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
