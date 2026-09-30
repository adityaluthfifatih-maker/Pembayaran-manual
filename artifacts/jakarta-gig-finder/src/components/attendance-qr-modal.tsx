import { useCallback, useEffect, useState } from "react";
import { X, LogIn, LogOut, RefreshCw, CheckCircle, Zap, ShieldCheck } from "lucide-react";
import QrCodeView from "./qr-code-view";
import { requestAttendanceToken, type AttendanceKind } from "@/lib/attendance-client";
import { subscribeAttendance } from "@/lib/central-server";
import CompanyBranchPicker from "./company-branch-picker";
import type { CompanyBranch } from "@/lib/company-branches-client";

interface AttendanceQrModalProps {
  jobId: number;
  jobTitle: string;
  onClose: () => void;
}

/**
 * Employer-side QR Presensi board. The employer picks Masuk (check-in) or
 * Pulang (check-out); a real, single-use, short-lived QR token is minted and
 * rendered. When the worker scans it, the live attendance event confirms it
 * here in real time (cross-device).
 */
export default function AttendanceQrModal({ jobId, jobTitle, onClose }: AttendanceQrModalProps) {
  const [kind, setKind] = useState<AttendanceKind>("masuk");
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<CompanyBranch | null>(null);
  const [confirmed, setConfirmed] = useState<{ workerName: string; kind: AttendanceKind } | null>(null);

  const handleBranchChange = useCallback((branch: CompanyBranch | null) => {
    setSelectedBranch(branch);
    setConfirmed(null);
  }, []);

  const loadToken = useCallback(
    async (k: AttendanceKind) => {
      if (!selectedBranch) {
        setToken(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setToken(null);
      try {
        const t = await requestAttendanceToken(jobId, k, selectedBranch.id);
        setToken(t.token);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal membuat QR Presensi.");
      } finally {
        setLoading(false);
      }
    },
    [jobId, selectedBranch],
  );

  useEffect(() => {
    void loadToken(kind);
  }, [kind, loadToken]);

  // Live confirmation the instant the worker scans this job's QR.
  useEffect(() => {
    return subscribeAttendance((e) => {
      if (
        e.jobId === jobId &&
        e.branchId === selectedBranch?.id &&
        e.kind === kind
      ) {
        setConfirmed({ workerName: e.workerName, kind: e.kind });
      }
    });
  }, [jobId, kind, selectedBranch?.id]);

  const isMasuk = kind === "masuk";

  return (
    <div
      className="fixed inset-0 z-[240] flex flex-col justify-end"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }}
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative w-full max-h-[92vh] overflow-y-auto rounded-t-3xl bg-white"
        style={{ animation: "slideUp 0.28s cubic-bezier(0.32,0.72,0,1)" }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-gray-200" />
        </div>

        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div>
            <h2 className="font-bold text-gray-900">QR Presensi Pemberi Kerja</h2>
            <p className="mt-0.5 text-xs text-gray-500">{jobTitle} · Tunjukkan ke pekerja</p>
          </div>
          <button
            onClick={onClose}
            data-testid="button-close-attendance-qr"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100"
          >
            <X className="h-4 w-4 text-gray-600" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <CompanyBranchPicker
            onChange={handleBranchChange}
          />

          {/* Masuk / Pulang toggle */}
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">
            <button
              onClick={() => setKind("masuk")}
              data-testid="button-qr-masuk"
              className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition-all ${
                isMasuk ? "bg-primary text-white shadow" : "text-gray-500"
              }`}
            >
              <LogIn className="h-4 w-4" /> Presensi Masuk
            </button>
            <button
              onClick={() => setKind("pulang")}
              data-testid="button-qr-pulang"
              className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition-all ${
                !isMasuk ? "bg-red-500 text-white shadow" : "text-gray-500"
              }`}
            >
              <LogOut className="h-4 w-4" /> Presensi Pulang
            </button>
          </div>

          {/* QR display */}
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-5">
            {loading && (
              <div className="flex h-[220px] w-[220px] items-center justify-center">
                <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            )}
            {!loading && error && (
              <div className="flex h-[220px] w-[220px] flex-col items-center justify-center gap-2 text-center">
                <p className="text-sm text-red-600">{error}</p>
                <button
                  onClick={() => loadToken(kind)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white"
                >
                  Coba Lagi
                </button>
              </div>
            )}
            {!loading && !error && !selectedBranch && (
              <div className="flex h-[220px] w-[220px] items-center justify-center text-center text-sm text-gray-500">
                Tambahkan atau pilih cabang untuk membuat QR.
              </div>
            )}
            {!loading && !error && token && <QrCodeView value={token} />}
            <div className="flex items-center gap-2 text-[10px] text-gray-500">
              <Zap className="h-3 w-3 text-orange-500" />
              <span>QR unik & sekali pakai — kadaluarsa otomatis dalam 3 menit</span>
            </div>
            <button
              onClick={() => void loadToken(kind)}
              disabled={!selectedBranch || loading}
              data-testid="button-refresh-qr"
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Perbarui QR
            </button>
          </div>

          {/* Live scan confirmation */}
          {confirmed && (
            <div
              data-testid="text-scan-confirmed"
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                confirmed.kind === "masuk"
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-blue-200 bg-blue-50"
              }`}
            >
              <CheckCircle
                className={`h-5 w-5 shrink-0 ${
                  confirmed.kind === "masuk" ? "text-emerald-600" : "text-blue-600"
                }`}
              />
              <div>
                <p className="text-xs font-black text-gray-800">
                  {confirmed.workerName} berhasil presensi{" "}
                  {confirmed.kind === "masuk" ? "MASUK ✅" : "PULANG 🏁"}
                </p>
                <p className="mt-0.5 text-[10px] text-gray-500">
                  {confirmed.kind === "masuk"
                    ? "Shift dimulai — status tersinkron di semua perangkat."
                    : "Shift selesai — escrow dilepas & rating dibuka."}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <p className="text-[11px] leading-relaxed text-emerald-800">
              Presensi via QR mencegah joki: hanya pekerja yang hadir fisik di lokasi dan memindai
              QR dinamis ini yang tercatat. Status presensi tersinkron real-time ke perangkat
              pekerja.
            </p>
          </div>
        </div>
      </div>
      <style>{`@keyframes slideUp { from{transform:translateY(100%);opacity:0.6} to{transform:translateY(0);opacity:1} }`}</style>
    </div>
  );
}
