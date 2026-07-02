import { useState } from "react";
import { Briefcase, HardHat, CheckCircle, ArrowRight } from "lucide-react";
import { UserRole } from "@/types/auth";

interface RoleSelectModalProps {
  onSelect: (role: UserRole) => void;
  isGoogle?: boolean;
}

export default function RoleSelectModal({ onSelect, isGoogle }: RoleSelectModalProps) {
  const [selected, setSelected] = useState<UserRole | null>(null);
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = () => {
    if (!selected) return;
    setConfirming(true);
    setTimeout(() => onSelect(selected), 600);
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col items-center justify-end pb-0"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="w-full bg-white rounded-t-3xl px-5 pt-5 pb-10 flex flex-col gap-5"
        style={{ animation: "slideUp 0.32s cubic-bezier(0.32,0.72,0,1)" }}
      >
        {/* Handle */}
        <div className="flex justify-center -mt-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="text-center space-y-1">
          {isGoogle && (
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                <span className="text-white text-[9px] font-black">G</span>
              </div>
              <span className="text-xs font-semibold text-blue-600">Akun Google Terhubung</span>
            </div>
          )}
          <h2 className="text-xl font-black text-gray-900">Anda mendaftar sebagai?</h2>
          <p className="text-sm text-gray-500">Pilih peran Anda — ini menentukan tampilan dan fitur yang tersedia</p>
        </div>

        {/* Role cards */}
        <div className="grid grid-cols-2 gap-3">
          <RoleCard
            icon={<HardHat className="w-8 h-8" />}
            title="Pencari Kerja"
            subtitle="Karyawan / Pekerja Lepas Harian"
            color="emerald"
            selected={selected === "pekerja"}
            onClick={() => setSelected("pekerja")}
          />
          <RoleCard
            icon={<Briefcase className="w-8 h-8" />}
            title="Pemilik Usaha"
            subtitle="Perusahaan / Agensi / EO"
            color="blue"
            selected={selected === "perusahaan"}
            onClick={() => setSelected("perusahaan")}
          />
        </div>

        {/* Features preview */}
        {selected && (
          <div
            className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${selected === "pekerja" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}
            style={{ animation: "fadeIn 0.18s ease" }}
          >
            {selected === "pekerja" ? (
              <ul className="space-y-1">
                {["Lamar kerja harian di peta radar", "Clock-In/Out dengan GPS + selfie", "Slip gaji & rincian upah bersih", "Dashboard reputasi & riwayat pendapatan"].map((f) => (
                  <li key={f} className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 shrink-0" />{f}</li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-1">
                {["Posting lowongan di peta Jakarta", "Manajemen lamaran & persetujuan", "Chat terproteksi anti-penipuan", "Dashboard analitik keuangan real-time"].map((f) => (
                  <li key={f} className="flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5 shrink-0" />{f}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Confirm button */}
        <button
          onClick={handleConfirm} disabled={!selected || confirming}
          className={`w-full flex items-center justify-center gap-2 font-bold py-4 rounded-2xl text-base transition-all ${
            selected
              ? selected === "pekerja"
                ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg"
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
              : "bg-gray-100 text-gray-400"
          } ${confirming ? "opacity-70" : ""}`}
        >
          {confirming ? (
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <>
              Masuk sebagai {selected === "pekerja" ? "Pekerja" : selected === "perusahaan" ? "Perusahaan" : "..."}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      <style>{`
        @keyframes slideUp { from{transform:translateY(100%);opacity:0.5} to{transform:translateY(0);opacity:1} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

function RoleCard({ icon, title, subtitle, color, selected, onClick }: {
  icon: React.ReactNode; title: string; subtitle: string; color: "emerald" | "blue"; selected: boolean; onClick: () => void;
}) {
  const activeStyle = color === "emerald"
    ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-200"
    : "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200";
  const iconColor = color === "emerald" ? "text-emerald-400" : "text-blue-400";

  return (
    <button onClick={onClick}
      className={`flex flex-col items-center text-center gap-2.5 p-4 rounded-2xl border-2 transition-all active:scale-[0.97] ${selected ? activeStyle : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}>
      <div className={selected ? "text-white" : iconColor}>{icon}</div>
      <div>
        <p className={`text-sm font-bold ${selected ? "text-white" : "text-gray-900"}`}>{title}</p>
        <p className={`text-[10px] mt-0.5 leading-tight ${selected ? "text-white/80" : "text-gray-500"}`}>{subtitle}</p>
      </div>
      {selected && <CheckCircle className="w-4 h-4 text-white/80" />}
    </button>
  );
}
