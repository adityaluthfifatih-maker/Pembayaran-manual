import { useState } from "react";
import { ChevronRight, ChevronLeft, CheckCircle, Upload, ShieldCheck, AlertCircle } from "lucide-react";
import { WorkerProfile, bankOptions } from "@/types/worker-profile";

interface WorkerOnboardingProps {
  onComplete: (profile: WorkerProfile) => void;
  onDismiss: () => void;
}

const STEPS = ["Identitas", "Pajak & Bank", "Dokumen"];

const emptyProfile: WorkerProfile = {
  namaLengkap: "",
  nik: "",
  tempatLahir: "",
  tanggalLahir: "",
  jenisKelamin: "L",
  whatsapp: "",
  npwp: "",
  belumPunyaNpwp: false,
  namaBank: "",
  nomorRekening: "",
  namaRekening: "",
  ktpUploaded: false,
  selfieUploaded: false,
};

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-gray-400 mt-0.5 leading-tight">{children}</p>;
}

function Field({ label, hint, required, children }: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-semibold text-gray-800 flex items-center gap-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <FieldHint>{hint}</FieldHint>}
    </div>
  );
}

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all";

export default function WorkerOnboarding({ onComplete, onDismiss }: WorkerOnboardingProps) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<WorkerProfile>(emptyProfile);

  const set = <K extends keyof WorkerProfile>(k: K, v: WorkerProfile[K]) =>
    setProfile((p) => ({ ...p, [k]: v }));

  const canNext = (() => {
    if (step === 0)
      return (
        profile.namaLengkap.trim() &&
        profile.nik.length === 16 &&
        profile.tempatLahir.trim() &&
        profile.tanggalLahir &&
        profile.whatsapp.trim().length >= 10
      );
    if (step === 1)
      return (
        (profile.belumPunyaNpwp || profile.npwp.length >= 15) &&
        profile.namaBank &&
        profile.nomorRekening.trim() &&
        profile.namaRekening.trim()
      );
    if (step === 2) return profile.ktpUploaded && profile.selfieUploaded;
    return false;
  })();

  const handleFinish = () => {
    if (canNext) onComplete(profile);
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col justify-end"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }}
    >
      <div
        className="relative bg-white rounded-t-3xl w-full max-h-[94vh] overflow-y-auto"
        style={{ animation: "slideUp 0.3s cubic-bezier(0.32,0.72,0,1)" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Lengkapi Profil Legalitas</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Data Anda dienkripsi dan aman sesuai UU PDP
              </p>
            </div>
            <button
              onClick={onDismiss}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Lewati
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-4">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                      i < step
                        ? "bg-primary border-primary text-white"
                        : i === step
                        ? "border-primary text-primary bg-primary/10"
                        : "border-gray-200 text-gray-400 bg-white"
                    }`}
                  >
                    {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={`text-[10px] font-semibold ${i === step ? "text-primary" : "text-gray-400"}`}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mb-4 ${i < step ? "bg-primary" : "bg-gray-200"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="px-5 py-5 space-y-4">
          {step === 0 && (
            <>
              <Field label="Nama Lengkap (Sesuai KTP)" required hint="Pastikan ejaan sama persis dengan kartu identitas Anda">
                <input
                  data-testid="input-nama"
                  className={inputClass}
                  placeholder="cth: Budi Santoso"
                  value={profile.namaLengkap}
                  onChange={(e) => set("namaLengkap", e.target.value)}
                />
              </Field>

              <Field label="Nomor Induk Kependudukan (NIK)" required hint="16 digit angka yang tertera di KTP Anda">
                <input
                  data-testid="input-nik"
                  className={inputClass}
                  placeholder="3xxxxxxxxxxxxxxx"
                  inputMode="numeric"
                  maxLength={16}
                  value={profile.nik}
                  onChange={(e) => set("nik", e.target.value.replace(/\D/g, "").slice(0, 16))}
                />
                {profile.nik.length > 0 && profile.nik.length < 16 && (
                  <p className="text-[11px] text-amber-500 mt-0.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> NIK harus 16 digit ({profile.nik.length}/16)
                  </p>
                )}
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Tempat Lahir" required>
                  <input
                    data-testid="input-tempat-lahir"
                    className={inputClass}
                    placeholder="Jakarta"
                    value={profile.tempatLahir}
                    onChange={(e) => set("tempatLahir", e.target.value)}
                  />
                </Field>
                <Field label="Tanggal Lahir" required>
                  <input
                    data-testid="input-tgl-lahir"
                    className={inputClass}
                    type="date"
                    value={profile.tanggalLahir}
                    onChange={(e) => set("tanggalLahir", e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Jenis Kelamin" required>
                <div className="flex gap-3">
                  {(["L", "P"] as const).map((jk) => (
                    <button
                      key={jk}
                      type="button"
                      onClick={() => set("jenisKelamin", jk)}
                      className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-all ${
                        profile.jenisKelamin === jk
                          ? "bg-primary text-white border-primary"
                          : "bg-white text-gray-600 border-gray-200"
                      }`}
                    >
                      {jk === "L" ? "Laki-laki" : "Perempuan"}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Nomor WhatsApp Aktif" required hint="Nomor ini akan digunakan perusahaan untuk menghubungi Anda">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500">+62</span>
                  <input
                    data-testid="input-whatsapp"
                    className={`${inputClass} pl-12`}
                    placeholder="8xxxxxxxxxx"
                    inputMode="numeric"
                    value={profile.whatsapp}
                    onChange={(e) => set("whatsapp", e.target.value.replace(/\D/g, ""))}
                  />
                </div>
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex gap-3 items-start">
                <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  NPWP dikumpulkan sebagai data verifikasi. Segala kewajiban perpajakan menjadi tanggung jawab mandiri masing-masing pihak sesuai hukum yang berlaku.
                </p>
              </div>

              <Field label="NPWP (Nomor Pokok Wajib Pajak)" hint="15 atau 16 digit — tertera di kartu NPWP Anda">
                <input
                  data-testid="input-npwp"
                  className={inputClass}
                  placeholder="00.000.000.0-000.000"
                  inputMode="numeric"
                  disabled={profile.belumPunyaNpwp}
                  value={profile.npwp}
                  onChange={(e) => set("npwp", e.target.value.replace(/\D/g, "").slice(0, 16))}
                />
              </Field>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  data-testid="check-no-npwp"
                  type="checkbox"
                  className="mt-0.5 w-4 h-4 accent-primary"
                  checked={profile.belumPunyaNpwp}
                  onChange={(e) => set("belumPunyaNpwp", e.target.checked)}
                />
                <div>
                  <span className="text-sm font-medium text-gray-800">Saya belum memiliki NPWP</span>
                  {profile.belumPunyaNpwp && (
                    <p className="text-[11px] text-amber-600 mt-1 leading-tight bg-amber-50 border border-amber-200 rounded-lg p-2">
                      NPWP hanya digunakan sebagai data verifikasi. Segala kewajiban perpajakan menjadi tanggung jawab mandiri masing-masing pihak sesuai hukum yang berlaku. Disarankan segera daftar NPWP di pajak.go.id.
                    </p>
                  )}
                </div>
              </label>

              <div className="pt-2 border-t border-gray-100">
                <p className="text-sm font-bold text-gray-900 mb-3">Rekening Pencairan Gaji</p>

                <div className="space-y-3">
                  <Field label="Bank / E-Wallet" required>
                    <select
                      data-testid="select-bank"
                      className={`${inputClass} bg-white`}
                      value={profile.namaBank}
                      onChange={(e) => set("namaBank", e.target.value)}
                    >
                      <option value="">-- Pilih Bank / E-Wallet --</option>
                      {bankOptions.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Nomor Rekening / E-Wallet" required hint="Pastikan nomor aktif dan atas nama sendiri">
                    <input
                      data-testid="input-rekening"
                      className={inputClass}
                      placeholder="1234567890"
                      inputMode="numeric"
                      value={profile.nomorRekening}
                      onChange={(e) => set("nomorRekening", e.target.value.replace(/\D/g, ""))}
                    />
                  </Field>

                  <Field label="Nama Pemilik Rekening" required hint="Harus sesuai dengan nama di rekening bank">
                    <input
                      data-testid="input-nama-rekening"
                      className={inputClass}
                      placeholder="Nama persis sesuai buku tabungan"
                      value={profile.namaRekening}
                      onChange={(e) => set("namaRekening", e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="bg-primary/5 border border-primary/15 rounded-xl px-4 py-3 text-xs text-gray-700 leading-relaxed">
                Foto dokumen dienkripsi end-to-end dan hanya dapat diakses oleh petugas verifikasi berlisensi. Kami tidak menyimpan foto lebih dari 30 hari setelah verifikasi.
              </div>

              {/* KTP Upload */}
              <div
                data-testid="upload-ktp"
                onClick={() => set("ktpUploaded", true)}
                className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center gap-3 cursor-pointer transition-all ${
                  profile.ktpUploaded
                    ? "border-primary bg-primary/5"
                    : "border-gray-200 bg-gray-50 hover:border-primary/40"
                }`}
              >
                {profile.ktpUploaded ? (
                  <>
                    <CheckCircle className="w-8 h-8 text-primary" />
                    <p className="text-sm font-semibold text-primary">Foto KTP Terunggah</p>
                    <p className="text-xs text-gray-400">Klik untuk ganti foto</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-gray-400" />
                    <p className="text-sm font-semibold text-gray-700">Unggah Foto KTP</p>
                    <p className="text-xs text-gray-500 text-center">
                      Pastikan seluruh teks terbaca jelas, tidak buram atau terpotong
                    </p>
                    <span className="px-4 py-1.5 rounded-full bg-white border border-gray-200 text-xs font-medium text-gray-600">
                      Pilih Foto
                    </span>
                  </>
                )}
              </div>

              {/* Selfie Upload */}
              <div
                data-testid="upload-selfie"
                onClick={() => set("selfieUploaded", true)}
                className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center gap-3 cursor-pointer transition-all ${
                  profile.selfieUploaded
                    ? "border-primary bg-primary/5"
                    : "border-gray-200 bg-gray-50 hover:border-primary/40"
                }`}
              >
                {profile.selfieUploaded ? (
                  <>
                    <CheckCircle className="w-8 h-8 text-primary" />
                    <p className="text-sm font-semibold text-primary">Foto Selfie Terunggah</p>
                    <p className="text-xs text-gray-400">Klik untuk ganti foto</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-gray-400" />
                    <p className="text-sm font-semibold text-gray-700">Selfie Pegang KTP</p>
                    <p className="text-xs text-gray-500 text-center">
                      Foto wajah Anda sambil memegang KTP menghadap kamera
                    </p>
                    <span className="px-4 py-1.5 rounded-full bg-white border border-gray-200 text-xs font-medium text-gray-600">
                      Ambil Foto
                    </span>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="px-5 pb-8 pt-2 flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Kembali
            </button>
          )}
          <button
            data-testid="button-next-step"
            onClick={step < STEPS.length - 1 ? () => setStep((s) => s + 1) : handleFinish}
            disabled={!canNext}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
              canNext
                ? "bg-primary text-white hover:bg-primary/90 active:scale-[0.98] shadow-lg"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
            style={canNext ? { boxShadow: "0 4px 16px rgba(6,95,70,0.3)" } : {}}
          >
            {step < STEPS.length - 1 ? (
              <>Lanjut <ChevronRight className="w-4 h-4" /></>
            ) : (
              <>Selesai & Aktifkan Akun <CheckCircle className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0.6; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
