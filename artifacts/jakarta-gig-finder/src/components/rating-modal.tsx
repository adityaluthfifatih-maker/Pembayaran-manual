import { useState } from "react";
import { Star, X, Building2, User, Ban } from "lucide-react";

export interface RatingPayload {
  stars: number;
  comment: string;
  raterType: "company" | "worker";
  targetName: string;
  blacklist?: boolean;
}

interface RatingModalProps {
  raterType: "company" | "worker";
  targetName: string;
  jobTitle: string;
  onSubmit: (payload: RatingPayload) => void;
  onClose: () => void;
}

export default function RatingModal({ raterType, targetName, jobTitle, onSubmit, onClose }: RatingModalProps) {
  const [stars, setStars] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [blacklist, setBlacklist] = useState(false);

  const isCompany = raterType === "company";
  const title = isCompany ? "Beri Rating Pekerja" : "Beri Rating Perusahaan";
  const subtitle = isCompany ? `Bagaimana kinerja ${targetName}?` : `Bagaimana pengalaman bekerja dengan ${targetName}?`;

  const quickComments = isCompany
    ? ["Sangat profesional", "Datang tepat waktu", "Hasil kerja memuaskan", "Perlu peningkatan"]
    : ["Lingkungan kerja baik", "Pembayaran tepat waktu", "Instruksi jelas", "Kurang terorganisir"];

  const handleSubmit = () => {
    if (stars === 0) return;
    onSubmit({ stars, comment, raterType, targetName, blacklist: isCompany ? blacklist : false });
  };

  return (
    <div
      className="fixed inset-0 z-[250] flex flex-col justify-end"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }}
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative bg-white rounded-t-3xl w-full"
        style={{ animation: "slideUp 0.28s cubic-bezier(0.32,0.72,0,1)" }}
      >
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Pekerjaan: {jobTitle}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Target info */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              {isCompany ? <User className="w-6 h-6 text-primary" /> : <Building2 className="w-6 h-6 text-primary" />}
            </div>
            <div>
              <p className="font-bold text-gray-900">{targetName}</p>
              <p className="text-xs text-gray-500">{subtitle}</p>
            </div>
          </div>

          {/* Star rating */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  data-testid={`star-${s}`}
                  onMouseEnter={() => setHovered(s)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => setStars(s)}
                  className="transition-transform hover:scale-110 active:scale-95"
                >
                  <Star
                    className={`w-9 h-9 transition-colors ${
                      s <= (hovered || stars)
                        ? "fill-amber-400 text-amber-400"
                        : "text-gray-200 fill-gray-200"
                    }`}
                  />
                </button>
              ))}
            </div>
            {stars > 0 && (
              <p className="text-sm font-semibold text-gray-700">
                {["", "Sangat Buruk", "Buruk", "Cukup", "Baik", "Sangat Baik"][stars]}
              </p>
            )}
          </div>

          {/* Quick comment tags */}
          <div className="flex flex-wrap gap-2">
            {quickComments.map((q) => (
              <button
                key={q}
                onClick={() => setComment((c) => c ? `${c}, ${q}` : q)}
                className="px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:border-primary/50 hover:text-primary transition-colors"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Comment textarea */}
          <textarea
            data-testid="input-rating-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tambahkan komentar (opsional)..."
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
          />

          {/* Blacklist toggle — employers only */}
          {isCompany && (
            <button
              type="button"
              onClick={() => setBlacklist((b) => !b)}
              data-testid="toggle-blacklist"
              className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                blacklist ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    blacklist ? "bg-red-100" : "bg-gray-100"
                  }`}
                >
                  <Ban className={`h-5 w-5 ${blacklist ? "text-red-500" : "text-gray-400"}`} />
                </div>
                <div>
                  <p className={`text-sm font-bold ${blacklist ? "text-red-700" : "text-gray-800"}`}>
                    Blacklist pekerja ini
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {targetName} tidak akan melihat lowongan Anda lagi.
                  </p>
                </div>
              </div>
              <div
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  blacklist ? "bg-red-500" : "bg-gray-200"
                }`}
              >
                <div
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    blacklist ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </div>
            </button>
          )}

          <div className="pb-4">
            <button
              data-testid="button-submit-rating"
              onClick={handleSubmit}
              disabled={stars === 0}
              className={`w-full font-bold py-3.5 rounded-xl text-base transition-all ${
                stars > 0
                  ? "bg-primary text-white hover:bg-primary/90 active:scale-[0.98] shadow-lg"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
              style={stars > 0 ? { boxShadow: "0 4px 16px rgba(6,95,70,0.3)" } : {}}
            >
              Kirim Rating
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes slideUp { from{transform:translateY(100%);opacity:0.6} to{transform:translateY(0);opacity:1} }`}</style>
    </div>
  );
}
