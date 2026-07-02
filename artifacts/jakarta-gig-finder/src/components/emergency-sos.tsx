import { useState } from "react";
import { AlertTriangle, X, ShieldCheck, HeartPulse } from "lucide-react";
import { reportEmergency } from "@/lib/emergency-client";
import type { CustomJob } from "@/types/custom-job";

interface EmergencySOSProps {
  activeJob: CustomJob;
  workerPhone: string;
}

type SOSStep = "idle" | "confirm" | "sending" | "sent";

const EMERALD = "#065F46";
const CHARCOAL = "#1C2321";

/** Offline first-aid tips tailored to structural / on-site project safety. */
const FIRST_AID_TIPS: string[] = [
  "Hentikan semua pekerjaan & segera amankan area di sekitar Anda.",
  "Tekan luka dengan kain bersih untuk menghentikan pendarahan.",
  "Jangan pindahkan korban patah tulang atau cedera leher/punggung.",
  "Jauhi kabel listrik, material jatuh, dan struktur yang tidak stabil.",
  "Tetap di tempat yang aman & terlihat hingga bantuan tiba.",
];

/**
 * Worker SILENT SOS.
 *
 * A high-visibility crimson button on the active-job view. On tap it asks for a
 * short confirmation, then reports the emergency to the server (which logs it +
 * broadcasts it to the Admin Command Center over WebSocket). It NEVER dials a
 * phone number — the admin is the human dispatcher. On success the worker view
 * switches to a calming full-screen "Rekhastha Emergency Care" overlay.
 */
export default function EmergencySOS({ activeJob, workerPhone }: EmergencySOSProps) {
  const [step, setStep] = useState<SOSStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleReport = async () => {
    setStep("sending");
    setError(null);
    try {
      await reportEmergency({
        jobId: activeJob.id,
        jobTitle: activeJob.posisi,
        employerName: activeJob.employerName,
        projectAddress: activeJob.alamat,
        boronganType: activeJob.boronganType,
        workerPhone,
      });
      setStep("sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim laporan darurat.");
      setStep("confirm");
    }
  };

  return (
    <>
      {/* ── Crimson SOS trigger (active-job view) ── */}
      <button
        data-testid="button-emergency-sos"
        onClick={() => {
          setError(null);
          setStep("confirm");
        }}
        className="w-full flex items-center justify-center gap-2 rounded-2xl font-black text-white text-sm py-3.5 active:scale-[0.98] transition-transform"
        style={{
          background: "linear-gradient(135deg,#b91c1c,#dc2626)",
          boxShadow: "0 8px 24px rgba(220,38,38,0.45)",
        }}
      >
        <AlertTriangle className="w-5 h-5" />
        🚨 LAPOR DARURAT (SOS)
      </button>

      {/* ── Confirmation step ── */}
      {step === "confirm" || step === "sending" ? (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <div>
              <h2 className="text-lg font-black text-red-700">Kirim Laporan Darurat?</h2>
              <p className="text-sm text-gray-600 mt-1">
                Tim Pusat Tilu Company akan segera dikerahkan untuk membantu Anda.
                Gunakan hanya untuk keadaan darurat nyata.
              </p>
            </div>
            {error && (
              <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {error}
              </p>
            )}
            <div className="flex gap-3 pt-1">
              <button
                data-testid="button-emergency-cancel"
                disabled={step === "sending"}
                onClick={() => setStep("idle")}
                className="flex-1 h-12 rounded-2xl font-bold text-sm bg-gray-100 text-gray-700 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                data-testid="button-emergency-confirm"
                disabled={step === "sending"}
                onClick={handleReport}
                className="flex-[1.4] h-12 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-2 disabled:opacity-70"
                style={{ background: "linear-gradient(135deg,#b91c1c,#dc2626)" }}
              >
                {step === "sending" ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Mengirim...
                  </>
                ) : (
                  <>🚨 Ya, Lapor Sekarang</>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Calming full-screen "Rekhastha Emergency Care" overlay ── */}
      {step === "sent" && (
        <div
          data-testid="overlay-emergency-care"
          className="fixed inset-0 z-[9999] flex flex-col overflow-y-auto"
          style={{ background: `linear-gradient(165deg, ${CHARCOAL} 0%, ${EMERALD} 100%)` }}
        >
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center max-w-lg mx-auto w-full">
            <span className="relative flex h-20 w-20 items-center justify-center mb-6">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/25 animate-ping" />
              <span
                className="relative w-20 h-20 rounded-full flex items-center justify-center border-2"
                style={{ background: "rgba(255,255,255,0.08)", borderColor: "#D4AF37" }}
              >
                <ShieldCheck className="w-10 h-10" style={{ color: "#D4AF37" }} />
              </span>
            </span>

            <h1 className="text-2xl font-black text-white leading-tight">
              🚨 Laporan Darurat Telah Terkirim!
            </h1>
            <p className="text-sm text-emerald-50/90 mt-3 leading-relaxed">
              Tim Pusat Tilu Company sedang berkoordinasi dengan Ambulans/Pihak
              Berwajib menuju lokasi Anda. Harap tetap tenang.
            </p>

            <div
              className="mt-8 w-full rounded-3xl p-5 text-left space-y-3"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(212,175,55,0.35)" }}
            >
              <div className="flex items-center gap-2">
                <HeartPulse className="w-5 h-5" style={{ color: "#D4AF37" }} />
                <p className="text-sm font-black text-white">Panduan Pertolongan Pertama (Offline)</p>
              </div>
              <ul className="space-y-2.5">
                {FIRST_AID_TIPS.map((tip, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span
                      className="mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-black text-white"
                      style={{ background: EMERALD, border: "1px solid rgba(212,175,55,0.5)" }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm text-emerald-50/95 leading-snug">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs text-emerald-100/70 mt-6">
              Rekhastha <span className="opacity-80">by Tilu Company</span> · Pusat Bantuan Darurat
            </p>

            <button
              data-testid="button-emergency-care-close"
              onClick={() => setStep("idle")}
              className="mt-6 flex items-center gap-2 text-xs font-semibold text-white/70 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" /> Tutup panduan
            </button>
          </div>
        </div>
      )}
    </>
  );
}
