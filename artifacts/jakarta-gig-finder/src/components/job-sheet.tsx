import { useRef, useState } from "react";
import {
  CustomJob, calcTotal, paymentLabels,
  durasiKontrakOptions,
} from "@/types/custom-job";
import { calcEmployerFee, DEFAULT_FEE_RATE } from "@/types/escrow";
import { WorkerProfile, isVerified } from "@/types/worker-profile";
import { AuthUser } from "@/types/auth";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { uploadApplicationDocuments } from "@/lib/auth-client";
import {
  Users, FileText, Shirt, Banknote, CheckCircle, ShieldCheck,
  Loader2, MessageSquare, AlertTriangle, Calendar, Building2,
  FolderOpen, Upload, X,
} from "lucide-react";

interface JobSheetProps {
  job: CustomJob | null;
  onClose: () => void;
  workerProfile?: WorkerProfile | null;
  currentUser?: AuthUser | null;
  onApply?: (
    job: CustomJob,
    profile: WorkerProfile,
    docs?: { submittedCvUrl?: string; submittedPortfolioUrl?: string },
  ) => void | boolean | Promise<void | boolean>;
  onOpenChat?: (job: CustomJob) => void;
  onReportSuspect?: (jobId: number) => void;
  /** Called when the worker tries to apply without a completed profile — should open onboarding. */
  onRequireProfile?: () => void;
}

function formatRp(value: number): string {
  return "Rp " + value.toLocaleString("id-ID");
}

type ApplyState = "idle" | "sending" | "done";

export default function JobSheet({
  job, onClose, workerProfile, currentUser, onApply, onOpenChat, onReportSuspect, onRequireProfile,
}: JobSheetProps) {
  const [applyState, setApplyState] = useState<ApplyState>("idle");
  // Regular jobs show a modal asking the worker to choose which CV/Portfolio
  // to attach; Instant jobs skip this entirely and apply directly.
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [docsUploading, setDocsUploading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [newCvFile, setNewCvFile] = useState<File | null>(null);
  const [newPortfolioFile, setNewPortfolioFile] = useState<File | null>(null);
  const cvInputRef = useRef<HTMLInputElement>(null);
  const portfolioInputRef = useRef<HTMLInputElement>(null);

  if (!job) return null;

  const total = calcTotal(job.nominal, job.pembayaran);
  // Platform fee is a tiered employer-borne mark-up (3%/5%/8%); the worker
  // always receives 100% of the base wage (matches the escrow release payout).
  const commission = calcEmployerFee(total, job.feeRate ?? DEFAULT_FEE_RATE);
  const workerGets = total;
  const verified = workerProfile ? isVerified(workerProfile) : false;
  const durasiLabel = durasiKontrakOptions.find((o) => o.value === (job.durasiKontrak ?? "harian"))?.label ?? "Harian";
  const isRegular = job.hiringMode !== "cepat";
  const hasProfileDocs = !!(currentUser?.defaultCvUrl || currentUser?.defaultPortfolioUrl);

  const submitApplication = async (docs?: { submittedCvUrl?: string; submittedPortfolioUrl?: string }) => {
    // Guard: without a completed worker profile there is nothing to send to
    // the server, so never fake a "Lamaran Terkirim!" success — that used to
    // silently drop the application (no POST /api/applications was ever
    // made) while the worker saw a green checkmark and the employer never
    // received anything.
    if (!workerProfile || !onApply) {
      setDocsError("Lengkapi profil Anda terlebih dahulu untuk melamar.");
      onRequireProfile?.();
      return;
    }
    setDocsError(null);
    setApplyState("sending");
    try {
      const accepted = await onApply(job, workerProfile, docs);
      if (accepted === false) {
        setApplyState("idle");
        setDocsError("Lamaran belum berhasil dikirim ke server. Periksa koneksi lalu coba lagi.");
        return;
      }
      setApplyState("done");
    } catch {
      setApplyState("idle");
      setDocsError("Lamaran belum berhasil dikirim ke server. Periksa koneksi lalu coba lagi.");
    }
  };

  const handleApply = () => {
    if (applyState !== "idle") return;
    if (!workerProfile || !onApply) {
      setDocsError("Lengkapi profil Anda terlebih dahulu untuk melamar.");
      onRequireProfile?.();
      return;
    }
    if (isRegular) {
      setShowDocsModal(true);
      return;
    }
    // Instant jobs remain direct click-to-apply — no document upload phase.
    submitApplication();
  };

  const handleUseProfileDocs = () => {
    setShowDocsModal(false);
    submitApplication(); // no submittedCvUrl/Url ⇒ server falls back to profile defaults
  };

  const handleUploadNewDocs = async () => {
    if (!newCvFile && !newPortfolioFile) {
      setDocsError("Pilih minimal satu berkas (CV atau Portofolio).");
      return;
    }
    setDocsError(null);
    setDocsUploading(true);
    try {
      const result = await uploadApplicationDocuments({
        cv: newCvFile ?? undefined,
        portfolio: newPortfolioFile ?? undefined,
      });
      setShowDocsModal(false);
      submitApplication({ submittedCvUrl: result.cvUrl, submittedPortfolioUrl: result.portfolioUrl });
    } catch (e) {
      setDocsError(e instanceof Error ? e.message : "Gagal mengunggah berkas.");
    } finally {
      setDocsUploading(false);
    }
  };

  return (
    <Sheet open={!!job} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl p-6 h-[82vh] sm:h-auto overflow-y-auto">
        <div className="flex flex-col gap-5 pt-4">

          {/* Header */}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
              <FileText className="w-7 h-7 text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900 leading-tight">{job.posisi}</h2>
                <Badge className="bg-violet-100 text-violet-700 border-0 text-xs font-semibold">Lowongan Kustom</Badge>
                <Badge className={`border-0 text-xs font-semibold ${isRegular ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                  {isRegular ? "Reguler" : "Instan"}
                </Badge>
                {job.flaggedSuspect && (
                  <Badge className="bg-yellow-100 text-yellow-700 border-0 text-xs">⚠️ Sedang Ditinjau</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Users className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-sm text-gray-500">{job.kuota} orang dibutuhkan</span>
                {job.namaPerusahaan && (
                  <span className="flex items-center gap-1 text-[10px] text-gray-500">
                    <Building2 className="w-3 h-3" /> {job.namaPerusahaan}
                  </span>
                )}
                {job.nibPerusahaan?.length === 13 && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    <ShieldCheck className="w-3 h-3" /> NIB Terverifikasi
                  </span>
                )}
                {verified && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    <ShieldCheck className="w-3 h-3" /> Akun Terverifikasi
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Durasi kontrak */}
          <div className="flex items-center gap-2 bg-primary/5 border border-primary/10 rounded-xl px-4 py-2.5">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-xs font-semibold text-primary">{durasiLabel}</p>
              <p className="text-[10px] text-gray-500">Biaya platform {Math.round((job.feeRate ?? DEFAULT_FEE_RATE) * 100)}% (ditanggung perusahaan)</p>
            </div>
          </div>

          {/* Deskripsi */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wide">Deskripsi & Tugas</h3>
            <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-3.5 rounded-xl border border-gray-100">
              {job.deskripsi}
            </p>
          </div>

          {/* Dresscode */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
              <Shirt className="w-4 h-4" /> Persyaratan Pakaian
            </h3>
            <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-3.5 rounded-xl border border-gray-100">
              {job.dresscode}
            </p>
          </div>

          {/* Kalkulasi */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
              <Banknote className="w-4 h-4" /> Kalkulasi Penghasilan Bersih
            </h3>
            <div className="bg-primary/5 border border-primary/10 p-4 rounded-xl space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Sistem Bayaran</span>
                <span className="font-semibold text-gray-900">{paymentLabels[job.pembayaran]}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">
                  Total kotor ({paymentLabels[job.pembayaran]})
                </span>
                <span className="font-medium text-gray-900">{formatRp(total)}</span>
              </div>
              <div className="border-t border-primary/10 pt-2 space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Biaya platform {Math.round((job.feeRate ?? DEFAULT_FEE_RATE) * 100)}% (ditanggung perusahaan)</span>
                  <span>+{formatRp(commission)}</span>
                </div>
              </div>
              <div className="flex justify-between border-t border-primary/10 pt-2.5">
                <span className="font-bold text-gray-800">Anda terima bersih (100%)</span>
                <span className="font-bold text-primary text-lg">{formatRp(workerGets)}</span>
              </div>
              <p className="text-[10px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 leading-relaxed">
                Segala kewajiban perpajakan menjadi tanggung jawab mandiri masing-masing pihak sesuai hukum yang berlaku.
              </p>
            </div>
          </div>

          {/* Worker identity */}
          {workerProfile && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-gray-600">Data yang akan dikirim ke perusahaan:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
                {[
                  ["Nama", workerProfile.namaLengkap],
                  ["NIK", `${workerProfile.nik.slice(0, 4)}••••••••${workerProfile.nik.slice(-4)}`],
                  ["NPWP", workerProfile.belumPunyaNpwp ? "Belum ada" : `••••••${workerProfile.npwp.slice(-4)}`],
                  ["Bank", workerProfile.namaBank || "—"],
                ].map(([label, val]) => (
                  <div key={label}>
                    <p className="text-[10px] text-gray-400">{label}</p>
                    <p className="text-xs font-semibold text-gray-800 truncate">{val}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="pt-1 pb-2 space-y-3">
            {applyState === "idle" && (
              <>
                <button
                  data-testid="button-apply-job"
                  className="w-full bg-primary hover:bg-primary/90 active:scale-[0.98] text-white font-bold py-3.5 rounded-xl text-base transition-all shadow-lg"
                  style={{ boxShadow: "0 4px 16px rgba(6,95,70,0.35)" }}
                  onClick={handleApply}
                >
                  Lamar Pekerjaan Ini
                </button>
                {!workerProfile && docsError && (
                  <p className="text-xs font-semibold text-red-500 text-center" data-testid="text-apply-profile-error">
                    {docsError}
                  </p>
                )}
              </>
            )}

            {applyState === "sending" && (
              <div className="w-full bg-primary/10 border border-primary/20 text-primary font-semibold py-3.5 rounded-xl text-sm flex items-center justify-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin" />
                Mengirim data legalitas secara aman...
              </div>
            )}

            {applyState === "done" && (
              <div className="space-y-3">
                <div className="w-full bg-primary text-white font-semibold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Lamaran Terkirim!
                </div>
                {onOpenChat && (
                  <button
                    data-testid="button-open-chat-from-sheet"
                    onClick={() => { onClose(); onOpenChat(job); }}
                    className="w-full flex items-center justify-center gap-2 border-2 border-primary text-primary font-bold py-3 rounded-xl text-sm hover:bg-primary/5 transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Buka Chat Aplikasi
                  </button>
                )}
                <div className="bg-primary/5 border border-primary/15 rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-700 text-center leading-relaxed">
                    Perusahaan akan memvalidasi identitas dan kelengkapan data Anda.
                  </p>
                </div>
              </div>
            )}

            {/* Report suspicious */}
            {onReportSuspect && applyState === "idle" && (
              <button
                data-testid="button-report-suspect"
                onClick={() => { onReportSuspect(job.id); onClose(); }}
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-red-500 border border-red-200 bg-red-50 py-2.5 rounded-xl hover:bg-red-100 transition-colors"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Laporkan Lowongan Mencurigakan
              </button>
            )}
          </div>
        </div>
      </SheetContent>

      {/* Apply-modal: dual-entry CV/Portfolio choice (Regular jobs only) */}
      {showDocsModal && (
        <div
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
        >
          <div className="absolute inset-0" onClick={() => !docsUploading && setShowDocsModal(false)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-gray-900 text-base">CV & Portofolio</h3>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  Gunakan CV/Portofolio dari profil atau unggah berkas baru khusus untuk lowongan ini?
                </p>
              </div>
              <button onClick={() => !docsUploading && setShowDocsModal(false)} className="text-gray-300 hover:text-gray-500 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            {docsError && <p className="text-xs font-semibold text-red-500">{docsError}</p>}

            <button
              data-testid="button-use-profile-docs"
              onClick={handleUseProfileDocs}
              disabled={docsUploading}
              className="w-full flex items-center gap-3 border-2 border-primary/20 bg-primary/5 rounded-xl px-4 py-3.5 hover:bg-primary/10 transition-colors disabled:opacity-60"
            >
              <FolderOpen className="w-5 h-5 text-primary shrink-0" />
              <div className="text-left flex-1">
                <p className="text-sm font-bold text-gray-900">Gunakan Berkas dari Profil</p>
                <p className="text-[11px] text-gray-500">
                  {hasProfileDocs ? "Pakai CV/Portofolio master yang tersimpan di profil Anda" : "Belum ada berkas di profil — lamaran tetap terkirim tanpa CV/Portofolio"}
                </p>
              </div>
            </button>

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <p className="text-xs font-semibold text-gray-600">Atau unggah berkas baru untuk lowongan ini:</p>

              <input ref={cvInputRef} type="file" accept="application/pdf,.pdf" className="hidden"
                onChange={(e) => setNewCvFile(e.target.files?.[0] ?? null)} />
              <button
                onClick={() => cvInputRef.current?.click()}
                disabled={docsUploading}
                className="w-full flex items-center gap-3 border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors disabled:opacity-60"
              >
                <Upload className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-xs font-semibold text-gray-700 truncate">
                  {newCvFile ? newCvFile.name : "Unggah CV Baru (PDF, maks 10MB)"}
                </span>
              </button>

              <input ref={portfolioInputRef} type="file" accept="application/pdf,.pdf" className="hidden"
                onChange={(e) => setNewPortfolioFile(e.target.files?.[0] ?? null)} />
              <button
                onClick={() => portfolioInputRef.current?.click()}
                disabled={docsUploading}
                className="w-full flex items-center gap-3 border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors disabled:opacity-60"
              >
                <Upload className="w-4 h-4 text-gray-400 shrink-0" />
                <span className="text-xs font-semibold text-gray-700 truncate">
                  {newPortfolioFile ? newPortfolioFile.name : "Unggah Portofolio Baru (PDF, maks 10MB)"}
                </span>
              </button>

              <button
                data-testid="button-upload-new-docs"
                onClick={handleUploadNewDocs}
                disabled={docsUploading || (!newCvFile && !newPortfolioFile)}
                className="w-full flex items-center justify-center gap-2 bg-primary text-white font-bold py-3 rounded-xl text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {docsUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {docsUploading ? "Mengunggah..." : "Unggah & Lamar dengan Berkas Ini"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
