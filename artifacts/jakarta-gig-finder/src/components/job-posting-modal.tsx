import { useState, useEffect } from "react";
import { X, Plus, AlertTriangle, ShieldCheck } from "lucide-react";
import {
  CustomJob, PaymentType, calcCommission, calcTotal, paymentLabels,
  DurasiKontrak, durasiKontrakOptions, detectFraud, commissionRate,
} from "@/types/custom-job";

interface JobPostingModalProps {
  onSubmit: (job: Omit<CustomJob, "id" | "type" | "lat" | "lng" | "postedAt">) => void;
}

function formatRupiah(value: number): string {
  if (!value) return "Rp 0";
  return "Rp " + value.toLocaleString("id-ID");
}

export default function JobPostingModal({ onSubmit }: JobPostingModalProps) {
  const [open, setOpen] = useState(false);
  const [posisi, setPosisi] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [pembayaran, setPembayaran] = useState<PaymentType>("per_jam");
  const [nominal, setNominal] = useState("");
  const [dresscode, setDresscode] = useState("");
  const [kuota, setKuota] = useState("1");
  const [namaPerusahaan, setNamaPerusahaan] = useState("");
  const [nibPerusahaan, setNibPerusahaan] = useState("");
  const [durasiKontrak, setDurasiKontrak] = useState<DurasiKontrak>("harian");
  const [fraudWarning, setFraudWarning] = useState<string | null>(null);
  const [nibError, setNibError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const nominalNum = parseInt(nominal.replace(/\D/g, "")) || 0;
  const rate = commissionRate(durasiKontrak);
  const commission = calcCommission(nominalNum, pembayaran, durasiKontrak);
  const total = calcTotal(nominalNum, pembayaran);

  const handleNominalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    setNominal(raw ? parseInt(raw).toLocaleString("id-ID") : "");
  };

  const handleDeskripsiChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setDeskripsi(val);
    const kw = detectFraud(val);
    setFraudWarning(kw);
    setBlocked(!!kw);
  };

  const handleNibChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "");
    setNibPerusahaan(val);
    if (val.length > 0 && val.length < 13) {
      setNibError("NIB harus 13 digit (sesuai OSS-RBA)");
    } else {
      setNibError(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!posisi.trim() || !deskripsi.trim() || !nominalNum || !dresscode.trim()) return;
    if (blocked) return;
    if (nibPerusahaan.length > 0 && nibPerusahaan.length < 13) return;

    onSubmit({
      posisi: posisi.trim(),
      deskripsi: deskripsi.trim(),
      pembayaran,
      nominal: nominalNum,
      dresscode: dresscode.trim(),
      kuota: parseInt(kuota) || 1,
      durasiKontrak,
      nibPerusahaan: nibPerusahaan || undefined,
      namaPerusahaan: namaPerusahaan.trim() || undefined,
    });

    // Reset
    setPosisi(""); setDeskripsi(""); setPembayaran("per_jam"); setNominal("");
    setDresscode(""); setKuota("1"); setNamaPerusahaan(""); setNibPerusahaan("");
    setDurasiKontrak("harian"); setFraudWarning(null); setBlocked(false); setNibError(null);
    setOpen(false);
  };

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <button
        data-testid="button-open-job-posting"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-4 z-50 flex items-center gap-2 bg-primary text-white font-semibold px-5 py-3.5 rounded-full shadow-xl hover:bg-primary/90 active:scale-95 transition-all"
        style={{ boxShadow: "0 4px 20px rgba(6,95,70,0.45)" }}
      >
        <Plus className="w-5 h-5" />
        <span className="text-sm">Buka Lowongan Baru</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[200] flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
        >
          <div className="absolute inset-0" onClick={() => setOpen(false)} />
          <div
            className="relative bg-white rounded-t-3xl w-full max-h-[92vh] overflow-y-auto"
            style={{ animation: "slideUp 0.28s cubic-bezier(0.32,0.72,0,1)" }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Buat Lowongan Baru</h2>
                <p className="text-xs text-gray-500 mt-0.5">Tampil langsung di peta · Terproteksi anti-penipuan</p>
              </div>
              <button
                data-testid="button-close-modal"
                onClick={() => setOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100"
              >
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-5 py-5 space-y-5">
              {/* Nama Perusahaan */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-800">Nama Perusahaan</label>
                <input
                  data-testid="input-nama-perusahaan"
                  type="text" value={namaPerusahaan}
                  onChange={(e) => setNamaPerusahaan(e.target.value)}
                  placeholder="cth: PT Kopi Kenangan, CV Event Pro"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>

              {/* NIB / KTP Perusahaan */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  NIB / KTP Perusahaan
                  <span className="text-[10px] font-normal text-gray-500">(opsional, 13 digit)</span>
                </label>
                <input
                  data-testid="input-nib"
                  type="text" inputMode="numeric"
                  value={nibPerusahaan}
                  onChange={handleNibChange}
                  maxLength={13}
                  placeholder="1234567890123"
                  className={`w-full border rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 transition-all ${
                    nibError ? "border-red-300 focus:ring-red-200 focus:border-red-400" : "border-gray-200 focus:ring-primary/30 focus:border-primary"
                  }`}
                />
                {nibError && (
                  <p className="text-[11px] text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{nibError}</p>
                )}
                {nibPerusahaan.length === 13 && (
                  <p className="text-[11px] text-primary flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> NIB terverifikasi — pekerja lebih percaya</p>
                )}
              </div>

              {/* Nama Posisi */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-800">
                  Nama Posisi / Pekerjaan <span className="text-red-500">*</span>
                </label>
                <input
                  data-testid="input-posisi"
                  type="text" value={posisi}
                  onChange={(e) => setPosisi(e.target.value)}
                  placeholder="cth: Asisten Fotografer, Penjaga Booth"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  required
                />
              </div>

              {/* Deskripsi + Fraud Detection */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-800">
                  Deskripsi & Tugas Spesifik <span className="text-red-500">*</span>
                </label>
                <textarea
                  data-testid="input-deskripsi"
                  value={deskripsi}
                  onChange={handleDeskripsiChange}
                  placeholder="Jelaskan tugas, instruksi kerja, dan ekspektasi Anda secara detail..."
                  rows={4}
                  className={`w-full border rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 transition-all resize-none ${
                    fraudWarning ? "border-red-300 focus:ring-red-200 bg-red-50" : "border-gray-200 focus:ring-primary/30 focus:border-primary"
                  }`}
                  required
                />
                {fraudWarning ? (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold text-red-700">⚠️ Terdeteksi Kata Kunci Penipuan!</p>
                      <p className="text-[11px] text-red-600 mt-0.5">
                        Kata "<strong>{fraudWarning}</strong>" melanggar kebijakan platform. Lowongan ini tidak dapat diterbitkan. Hapus kata tersebut untuk melanjutkan.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-400 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-primary" />
                    Sensor anti-penipuan aktif: kata kunci "biaya seragam", "biaya admin", dll. diblokir otomatis
                  </p>
                )}
              </div>

              {/* Durasi Kontrak */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-800">
                  Durasi Kontrak Kerja
                </label>
                <select
                  data-testid="select-durasi-kontrak"
                  value={durasiKontrak}
                  onChange={(e) => setDurasiKontrak(e.target.value as DurasiKontrak)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                >
                  {durasiKontrakOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} — Komisi {(opt.rate * 100)}%
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500">
                  Kontrak lebih panjang = komisi platform lebih kecil. Saat ini: <span className="font-bold text-primary">{(rate * 100)}%</span>
                </p>
              </div>

              {/* Sistem Bayaran */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-800">Sistem Bayaran</label>
                <div className="flex gap-2">
                  {(["per_jam", "per_shift", "per_projek"] as PaymentType[]).map((type) => (
                    <button
                      key={type} type="button"
                      data-testid={`button-payment-${type}`}
                      onClick={() => setPembayaran(type)}
                      className={`flex-1 py-2.5 px-2 rounded-xl text-xs font-semibold border transition-all ${
                        pembayaran === type ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-primary/40"
                      }`}
                    >
                      {paymentLabels[type]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nominal */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-800">
                  Nominal Bayaran (Rupiah) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500">Rp</span>
                  <input
                    data-testid="input-nominal"
                    type="text" inputMode="numeric"
                    value={nominal} onChange={handleNominalChange}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    required
                  />
                </div>

                {nominalNum > 0 && (
                  <div className="mt-2 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 space-y-2" data-testid="commission-preview">
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>{pembayaran === "per_jam" ? `Total kerja (${formatRupiah(nominalNum)} × 8 jam)` : "Total pembayaran"}</span>
                      <span className="font-medium text-gray-900">{formatRupiah(total)}</span>
                    </div>
                    <div className="flex justify-between text-xs border-t border-primary/10 pt-2">
                      <span className="text-gray-600">Komisi platform ({(rate * 100)}% · {durasiKontrakOptions.find(o => o.value === durasiKontrak)?.label})</span>
                      <span className="font-bold text-primary">{formatRupiah(commission)}</span>
                    </div>
                    <div className="flex justify-between text-xs border-t border-primary/10 pt-2">
                      <span className="font-semibold text-gray-800">Anda membayar ke pekerja</span>
                      <span className="font-bold text-gray-900">{formatRupiah(total - commission)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Dresscode */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-800">
                  Persyaratan Pakaian & Atribut <span className="text-red-500">*</span>
                </label>
                <input
                  data-testid="input-dresscode"
                  type="text" value={dresscode}
                  onChange={(e) => setDresscode(e.target.value)}
                  placeholder="cth: Baju bebas rapi, bawa laptop sendiri"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  required
                />
              </div>

              {/* Kuota */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-800">Kuota Pekerja</label>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setKuota((k) => String(Math.max(1, parseInt(k) - 1)))}
                    className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-lg font-bold text-gray-600 hover:bg-gray-50">−</button>
                  <span className="text-xl font-bold text-gray-900 w-8 text-center">{kuota}</span>
                  <button type="button" onClick={() => setKuota((k) => String(parseInt(k) + 1))}
                    className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-lg font-bold text-gray-600 hover:bg-gray-50">+</button>
                  <span className="text-sm text-gray-500 ml-1">orang dibutuhkan</span>
                </div>
              </div>

              <div className="pt-2 pb-6">
                <button
                  data-testid="button-submit-job"
                  type="submit"
                  disabled={blocked || (nibPerusahaan.length > 0 && nibPerusahaan.length < 13)}
                  className={`w-full font-bold py-3.5 rounded-xl text-base transition-all shadow-lg ${
                    blocked || (nibPerusahaan.length > 0 && nibPerusahaan.length < 13)
                      ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                      : "bg-primary text-white hover:bg-primary/90 active:scale-[0.98]"
                  }`}
                  style={!blocked ? { boxShadow: "0 4px 16px rgba(6,95,70,0.35)" } : {}}
                >
                  {blocked ? "⚠️ Hapus Kata Kunci Penipuan Dulu" : "Terbitkan Lowongan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`@keyframes slideUp { from{transform:translateY(100%);opacity:0.6} to{transform:translateY(0);opacity:1} }`}</style>
    </>
  );
}
