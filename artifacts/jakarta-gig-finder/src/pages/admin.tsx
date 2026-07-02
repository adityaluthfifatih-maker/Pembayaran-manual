import { useCallback, useEffect, useRef, useState } from "react";
import {
  Shield, LogOut, Wallet, Users, GraduationCap, Zap, RefreshCw,
  Ban, CheckCircle2, Lock, KeyRound, Loader2, AlertTriangle, ClipboardList,
  Scale, HardHat, ExternalLink, Gavel, Building2,
  XCircle, Award, RotateCcw, Trophy,
} from "lucide-react";
import {
  adminLogin, adminLogout, adminMe, fetchLedger, forceRelease,
  fetchAdminUsers, toggleSuspend, AdminError,
  fetchDisputes, refund, fetchOnsite,
  fetchAcademy, submitAcademy,
  type LedgerRow, type AdminUserRow,
  type DisputeRow, type OnsiteData,
  type AcademyQuestion, type AcademyCompletion, type AcademyResult,
} from "@/lib/admin-client";
import { EmergencyAlarm } from "@/components/emergency-alarm";

const API_BASE = "/api";
const GOLD = "#D4AF37";

function formatRp(v: number): string {
  return "Rp " + Math.round(v).toLocaleString("id-ID");
}

type Tab = "escrow" | "resolution" | "onsite" | "users" | "academy";

// ── Login gateway ─────────────────────────────────────────────────
function LoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [adminId, setAdminId] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await adminLogin(adminId.trim(), token);
      onSuccess();
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "radial-gradient(circle at 50% 20%, #064e3b 0%, #022c22 60%, #01100c 100%)" }}
    >
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3 shadow-lg"
            style={{ background: `linear-gradient(135deg, ${GOLD}, #b8912a)` }}
          >
            <Shield className="w-8 h-8 text-emerald-950" strokeWidth={2.5} />
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">🔐 Admin Portal</h1>
          <p className="text-sm mt-0.5" style={{ color: GOLD }}>Tilu Company · Rekhastha</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white/5 backdrop-blur border rounded-2xl p-6 space-y-4 shadow-2xl"
          style={{ borderColor: "rgba(212,175,55,0.3)" }}
        >
          <div>
            <label className="text-xs font-bold text-emerald-100 flex items-center gap-1.5 mb-1.5">
              <Lock className="w-3.5 h-3.5" /> Identitas Admin
            </label>
            <input
              data-testid="input-admin-id"
              value={adminId}
              onChange={(e) => setAdminId(e.target.value)}
              autoComplete="username"
              placeholder="Masukkan Identitas Admin"
              className="w-full bg-emerald-950/50 border border-emerald-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder-emerald-300/40 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-emerald-100 flex items-center gap-1.5 mb-1.5">
              <KeyRound className="w-3.5 h-3.5" /> Kode Token / Passkey
            </label>
            <input
              data-testid="input-admin-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="current-password"
              placeholder="Masukkan Kode Token"
              className="w-full bg-emerald-950/50 border border-emerald-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder-emerald-300/40 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-500/15 border border-red-500/30 px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-red-300 shrink-0 mt-0.5" />
              <p className="text-xs text-red-200 leading-relaxed">{error}</p>
            </div>
          )}

          <button
            data-testid="button-admin-login"
            type="submit"
            disabled={busy || !adminId || !token}
            className="w-full font-black py-3.5 rounded-xl text-sm text-emerald-950 transition-all disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2"
            style={{ background: `linear-gradient(135deg, ${GOLD}, #c9a227)` }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            Masuk ke Command Center
          </button>
        </form>
        <p className="text-center text-[11px] text-emerald-300/50 mt-4">
          Akses terbatas untuk operator platform. Aktivitas dicatat.
        </p>
      </div>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────
function StatusBadge({ row }: { row: LedgerRow }) {
  const map = {
    deposited: { label: "Didepositokan", cls: "bg-amber-100 text-amber-800 border-amber-200" },
    working: { label: "Sedang Bekerja", cls: "bg-blue-100 text-blue-800 border-blue-200" },
    released: { label: "Selesai Cair", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  } as const;
  const s = map[row.status];
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ── Tab 1: Escrow ledger ──────────────────────────────────────────
function EscrowTab() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchLedger());
    } catch {
      /* keep last known rows */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Live: refetch whenever any device posts a gig or scans attendance.
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}${API_BASE}/ws`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type?: string };
        if (msg.type === "gig_broadcast" || msg.type === "attendance") void load();
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => ws.close();
  }, [load]);

  const handleRelease = async (jobId: number) => {
    setReleasing(jobId);
    try {
      await forceRelease(jobId);
      await load();
    } catch {
      /* the ledger reload will reflect the true state */
    } finally {
      setReleasing(null);
    }
  };

  const totalHeld = rows
    .filter((r) => r.status !== "released")
    .reduce((s, r) => s + r.totalSetoran, 0);
  const totalCommission = rows.reduce((s, r) => s + r.komisiPlatform, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard label="Total Dana Ditahan (Escrow)" value={formatRp(totalHeld)} tone="amber" />
        <SummaryCard label="Total Komisi Platform (15%)" value={formatRp(totalCommission)} tone="gold" />
        <SummaryCard label="Jumlah Transaksi" value={String(rows.length)} tone="emerald" />
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="font-black text-gray-900 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-700" /> Pengawasan Escrow &amp; Transaksi
          </h3>
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-900"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Segarkan
          </button>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">Belum ada transaksi escrow.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2.5 font-bold">Job ID</th>
                  <th className="px-4 py-2.5 font-bold">Perusahaan</th>
                  <th className="px-4 py-2.5 font-bold">Pekerja</th>
                  <th className="px-4 py-2.5 font-bold text-right">Total Upah</th>
                  <th className="px-4 py-2.5 font-bold text-right">Komisi (15%)</th>
                  <th className="px-4 py-2.5 font-bold text-right">Total Setoran</th>
                  <th className="px-4 py-2.5 font-bold">Status</th>
                  <th className="px-4 py-2.5 font-bold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.jobId} data-testid={`ledger-row-${r.jobId}`} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-mono text-[11px] text-gray-500">{r.jobId}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{r.employerName}</p>
                      <p className="text-[11px] text-gray-400">{r.posisi}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.workerName}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700">{formatRp(r.totalUpah)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-600">{formatRp(r.komisiPlatform)}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{formatRp(r.totalSetoran)}</td>
                    <td className="px-4 py-3"><StatusBadge row={r} /></td>
                    <td className="px-4 py-3 text-right">
                      {r.status !== "released" ? (
                        <button
                          data-testid={`button-force-release-${r.jobId}`}
                          onClick={() => void handleRelease(r.jobId)}
                          disabled={releasing === r.jobId}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1.5 hover:bg-emerald-600 disabled:opacity-50"
                        >
                          {releasing === r.jobId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                          Paksa Pencairan
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Selesai
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab 2: User management ────────────────────────────────────────
function UsersTab() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchAdminUsers());
    } catch {
      /* keep last known rows */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleToggle = async (u: AdminUserRow) => {
    setBusyId(u.id);
    try {
      const res = await toggleSuspend(u.id, !u.suspended);
      setRows((prev) => prev.map((r) => (r.id === u.id ? { ...r, suspended: res.suspended } : r)));
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 border-b border-gray-100">
        <h3 className="font-black text-gray-900 flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-700" /> Manajemen Pengguna &amp; Blacklist
        </h3>
      </div>
      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-400">Belum ada pengguna terdaftar.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2.5 font-bold">Nama</th>
                <th className="px-4 py-2.5 font-bold">Email</th>
                <th className="px-4 py-2.5 font-bold">Peran</th>
                <th className="px-4 py-2.5 font-bold text-center">Rating Negatif</th>
                <th className="px-4 py-2.5 font-bold text-center">Status</th>
                <th className="px-4 py-2.5 font-bold text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((u) => (
                <tr key={u.id} data-testid={`user-row-${u.id}`} className={u.suspended ? "bg-red-50/50" : "hover:bg-gray-50/60"}>
                  <td className="px-4 py-3 font-semibold text-gray-900">{u.displayName}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                      u.role === "perusahaan" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                    }`}>
                      {u.role === "perusahaan" ? "Perusahaan" : "Pekerja"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {u.negativeRatings > 0 ? (
                      <span className="inline-flex items-center gap-1 text-red-600 font-bold">
                        <AlertTriangle className="w-3.5 h-3.5" /> {u.negativeRatings}
                      </span>
                    ) : (
                      <span className="text-gray-300">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {u.suspended ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700">Ditangguhkan</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">Aktif</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      data-testid={`button-suspend-${u.id}`}
                      onClick={() => void handleToggle(u)}
                      disabled={busyId === u.id}
                      className={`inline-flex items-center gap-1.5 rounded-lg text-[11px] font-bold px-2.5 py-1.5 disabled:opacity-50 ${
                        u.suspended
                          ? "bg-emerald-700 text-white hover:bg-emerald-600"
                          : "bg-red-600 text-white hover:bg-red-500"
                      }`}
                    >
                      {busyId === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : u.suspended ? <CheckCircle2 className="w-3 h-3" /> : <Ban className="w-3 h-3" />}
                      {u.suspended ? "Aktifkan" : "Tangguhkan"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Operator training academy ──────────────────────────────
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AcademyTab() {
  const [questions, setQuestions] = useState<AcademyQuestion[]>([]);
  const [completions, setCompletions] = useState<AcademyCompletion[]>([]);
  const [passingScore, setPassingScore] = useState(80);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AcademyResult | null>(null);
  const [taking, setTaking] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchAcademy();
      setQuestions(data.questions);
      setCompletions(data.completions);
      setPassingScore(data.passingScore);
    } catch {
      /* keep last known state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startQuiz = () => {
    setAnswers({});
    setResult(null);
    setTaking(true);
  };

  const answeredCount = Object.keys(answers).length;
  const allAnswered = questions.length > 0 && answeredCount === questions.length;

  const handleSubmit = async () => {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    try {
      const payload = questions.map((q) => ({
        questionId: q.id,
        selectedIndex: answers[q.id],
      }));
      const res = await submitAcademy(payload);
      setResult(res);
      setTaking(false);
      await load();
    } catch {
      /* leave the quiz open so the operator can retry */
    } finally {
      setSubmitting(false);
    }
  };

  const bestScore = completions.reduce((m, c) => Math.max(m, c.score), 0);
  const hasPassed = completions.some((c) => c.passed);

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard label="Nilai Lulus Minimum" value={`${passingScore}%`} tone="amber" />
        <SummaryCard label="Skor Terbaik Anda" value={completions.length ? `${bestScore}%` : "—"} tone="gold" />
        <SummaryCard label="Total Percobaan" value={String(completions.length)} tone="emerald" />
      </div>

      {/* Result banner */}
      {result && (
        <div
          data-testid="academy-result"
          className={`rounded-2xl border p-5 shadow-sm ${
            result.passed ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
          }`}
        >
          <div className="flex items-center gap-3">
            {result.passed ? (
              <Award className="w-8 h-8 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-amber-500" />
            )}
            <div>
              <p className="font-black text-gray-900">
                {result.passed ? "Selamat, Anda Lulus! 🎉" : "Belum Lulus"}
              </p>
              <p className="text-sm text-gray-600">
                Skor {result.score}% · {result.correct}/{result.total} benar
                {" · "}Batas lulus {result.passingScore}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quiz taking view */}
      {taking ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-gray-900 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-emerald-700" /> Asesmen Operator
            </h3>
            <span className="text-xs font-bold text-gray-500">
              {answeredCount}/{questions.length} terjawab
            </span>
          </div>

          {questions.map((q, qi) => (
            <div key={q.id} data-testid={`question-${q.id}`} className="border-t border-gray-100 pt-4 first:border-t-0 first:pt-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">{q.category}</p>
              <p className="font-semibold text-gray-900 mt-0.5">
                {qi + 1}. {q.prompt}
              </p>
              <div className="mt-3 space-y-2">
                {q.options.map((opt, oi) => {
                  const selected = answers[q.id] === oi;
                  return (
                    <button
                      key={oi}
                      data-testid={`option-${q.id}-${oi}`}
                      onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                      className={`w-full text-left rounded-xl border px-3.5 py-2.5 text-sm transition-colors ${
                        selected
                          ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-900"
                          : "border-gray-200 hover:bg-gray-50 text-gray-700"
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={`w-4 h-4 rounded-full border flex-shrink-0 ${
                            selected ? "border-emerald-600 bg-emerald-600" : "border-gray-300"
                          }`}
                        />
                        {opt}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-3 pt-2">
            <button
              data-testid="button-submit-quiz"
              onClick={() => void handleSubmit()}
              disabled={!allAnswered || submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 text-white text-sm font-bold px-4 py-2.5 hover:bg-emerald-600 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Kirim Jawaban
            </button>
            <button
              onClick={() => setTaking(false)}
              className="text-sm font-bold text-gray-500 hover:text-gray-700"
            >
              Batal
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Start / review card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="font-black text-gray-900 flex items-center gap-2 mb-1">
              <GraduationCap className="w-4 h-4 text-emerald-700" /> Asesmen Onboarding Operator
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              {questions.length} soal seputar escrow, broadcast, presensi, dan moderasi. Nilai lulus {passingScore}%.
            </p>

            {hasPassed && !result && (
              <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5">
                <Trophy className="w-4 h-4 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-800">Anda sudah lulus asesmen ini.</p>
              </div>
            )}

            <button
              data-testid="button-start-quiz"
              onClick={startQuiz}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 text-white text-sm font-bold px-4 py-2.5 hover:bg-emerald-600"
            >
              {completions.length ? <RotateCcw className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
              {completions.length ? "Ulangi Asesmen" : "Mulai Asesmen"}
            </button>

            {result && (
              <div className="mt-5 space-y-2.5 border-t border-gray-100 pt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Pembahasan</p>
                {result.answers.map((a, i) => {
                  const q = questions.find((qq) => qq.id === a.questionId);
                  return (
                    <div key={a.questionId} className="flex items-start gap-2 text-sm">
                      {a.correct ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-semibold text-gray-800">
                          {i + 1}. {q?.prompt ?? a.questionId}
                        </p>
                        {!a.correct && (
                          <p className="text-[13px] text-emerald-800">
                            Jawaban benar: {q?.options[a.correctIndex] ?? "—"}
                          </p>
                        )}
                        <p className="text-[12px] text-gray-500">{a.explanation}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Completion history */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="font-black text-gray-900 flex items-center gap-2 mb-1">
              <ClipboardList className="w-4 h-4 text-emerald-700" /> Riwayat Penyelesaian
            </h3>
            <p className="text-xs text-gray-500 mb-4">Rekam jejak asesmen yang telah Anda selesaikan.</p>

            {completions.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
                <GraduationCap className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Belum ada percobaan — mulai asesmen pertama Anda.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {completions.map((c) => (
                  <div
                    key={c.id}
                    data-testid={`completion-${c.id}`}
                    className="flex items-center justify-between rounded-xl border border-gray-100 px-3.5 py-2.5"
                  >
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{c.score}% <span className="font-normal text-gray-400">({c.correct}/{c.total})</span></p>
                      <p className="text-[11px] text-gray-400">{formatDateTime(c.completedAt)}</p>
                    </div>
                    {c.passed ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold px-2.5 py-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Lulus
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-600 text-[11px] font-bold px-2.5 py-1">
                        <XCircle className="w-3.5 h-3.5" /> Belum Lulus
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Pusat Resolusi (remote disputes) ─────────────────────────
function ResolutionTab() {
  const [rows, setRows] = useState<DisputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await fetchDisputes());
    } catch {
      /* keep last known rows */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}${API_BASE}/ws`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type?: string };
        if (msg.type === "gig_broadcast") void load();
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => ws.close();
  }, [load]);

  const decide = async (jobId: number, action: "release" | "refund") => {
    setBusyId(jobId);
    try {
      if (action === "release") await forceRelease(jobId);
      else await refund(jobId);
      await load();
    } catch {
      /* the reload will reflect the true state */
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
          <Gavel className="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <h3 className="font-black text-gray-900">Pusat Resolusi Sengketa Remote</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Proyek remote yang bukti kerjanya ditolak employer &amp; dibekukan (escrow terkunci). Putuskan pemenang sengketa.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm py-16 text-center text-sm text-gray-400">
          Tidak ada sengketa aktif. 🎉
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map((r) => (
            <div
              key={r.jobId}
              data-testid={`dispute-row-${r.jobId}`}
              className="bg-white rounded-2xl border border-amber-200 shadow-sm p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-gray-900">{r.posisi}</p>
                  <p className="text-[11px] text-gray-400 font-mono">Job #{r.jobId}</p>
                </div>
                <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200">
                  Dibekukan (Sengketa)
                </span>
              </div>

              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">Employer</span>
                  <span className="font-semibold text-gray-900 text-right">{r.employerName}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">Employer ID</span>
                  <span className="font-mono text-[11px] text-gray-600 text-right">{r.employerId ?? "—"}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">Escrow Terkunci</span>
                  <span className="font-bold text-emerald-700 text-right">{formatRp(r.escrowAmount)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500">Hak Pekerja (net)</span>
                  <span className="font-semibold text-gray-700 text-right">{formatRp(r.workerNet)}</span>
                </div>
              </div>

              <div className="mt-3">
                {r.proofUrl ? (
                  <a
                    data-testid={`dispute-proof-${r.jobId}`}
                    href={r.proofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 break-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" /> Lihat Bukti Kerja (Project Link)
                  </a>
                ) : (
                  <span className="text-xs text-gray-400 italic">Tidak ada link bukti terlampir.</span>
                )}
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  data-testid={`button-release-worker-${r.jobId}`}
                  onClick={() => void decide(r.jobId, "release")}
                  disabled={busyId === r.jobId}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 text-white text-xs font-bold px-3 py-2.5 hover:bg-emerald-600 disabled:opacity-50"
                >
                  {busyId === r.jobId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scale className="w-3.5 h-3.5" />}
                  ⚖️ Putuskan Cairkan ke Pekerja
                </button>
                <button
                  data-testid={`button-refund-employer-${r.jobId}`}
                  onClick={() => void decide(r.jobId, "refund")}
                  disabled={busyId === r.jobId}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 text-white text-xs font-bold px-3 py-2.5 hover:bg-amber-500 disabled:opacity-50"
                >
                  {busyId === r.jobId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scale className="w-3.5 h-3.5" />}
                  ⚖️ Putuskan Refund ke Employer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Monitoring Proyek Fisik (on-site tracker) ────────────────
function OnsiteTab() {
  const [data, setData] = useState<OnsiteData>({ gigs: [], payouts: [] });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await fetchOnsite());
    } catch {
      /* keep last known data */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}${API_BASE}/ws`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type?: string };
        if (msg.type === "daily_payout" || msg.type === "gig_broadcast") void load();
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => ws.close();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
          <HardHat className="w-5 h-5 text-emerald-700" />
        </div>
        <div>
          <h3 className="font-black text-gray-900">Monitoring Proyek Fisik (On-Site)</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Progres durasi borongan fisik &amp; log pencairan upah harian via QR Check-out.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="ml-auto flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-900 shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Segarkan
        </button>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
      ) : (
        <>
          {data.gigs.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm py-16 text-center text-sm text-gray-400">
              Belum ada proyek fisik aktif.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.gigs.map((g) => {
                const total = Math.max(1, g.jumlahHari);
                const pct = Math.min(100, Math.round((g.daysPaid / total) * 100));
                return (
                  <div
                    key={g.jobId}
                    data-testid={`onsite-gig-${g.jobId}`}
                    className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-gray-900">{g.posisi}</p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <Building2 className="w-3 h-3" /> {g.employerName}
                        </p>
                      </div>
                      <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700 border border-blue-200">
                        {g.escrowStatus}
                      </span>
                    </div>

                    {g.alamat && (
                      <p className="text-[11px] text-gray-400 mt-1.5">{g.alamat}</p>
                    )}

                    <div className="mt-4">
                      <div className="flex justify-between text-xs font-bold mb-1.5">
                        <span className="text-gray-700">Hari ke-{g.daysPaid} dari {g.jumlahHari}</span>
                        <span className="text-emerald-700">{pct}%</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex justify-between text-xs">
                      <span className="text-gray-500">Total Escrow</span>
                      <span className="font-bold text-gray-900">{formatRp(g.escrowAmount)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <h3 className="font-black text-gray-900 flex items-center gap-2">
                <Zap className="w-4 h-4 text-emerald-700" /> Log Pencairan Harian (QR)
              </h3>
            </div>
            {data.payouts.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">Belum ada pencairan harian.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-2.5 font-bold">Pekerja</th>
                      <th className="px-4 py-2.5 font-bold">Job ID</th>
                      <th className="px-4 py-2.5 font-bold">Hari ke-</th>
                      <th className="px-4 py-2.5 font-bold text-right">Bruto</th>
                      <th className="px-4 py-2.5 font-bold text-right">Potongan (15%)</th>
                      <th className="px-4 py-2.5 font-bold text-right">Net Pekerja</th>
                      <th className="px-4 py-2.5 font-bold">Waktu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.payouts.map((p) => (
                      <tr key={p.id} data-testid={`payout-row-${p.id}`} className="hover:bg-gray-50/60">
                        <td className="px-4 py-3 font-semibold text-gray-900">{p.workerName}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-gray-500">{p.jobId}</td>
                        <td className="px-4 py-3 text-gray-700">Hari ke-{p.dayIndex}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{formatRp(p.grossFraction)}</td>
                        <td className="px-4 py-3 text-right text-red-600">− {formatRp(p.platformFee)}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-700">{formatRp(p.netToWorker)}</td>
                        <td className="px-4 py-3 text-[11px] text-gray-400">
                          {new Date(p.at).toLocaleString("id-ID")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: "amber" | "gold" | "emerald" }) {
  const tones = {
    amber: "from-amber-500 to-amber-600",
    gold: "from-yellow-500 to-amber-500",
    emerald: "from-emerald-600 to-emerald-700",
  } as const;
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${tones[tone]} p-4 text-white shadow-sm`}>
      <p className="text-[11px] font-semibold opacity-80">{label}</p>
      <p className="text-xl font-black mt-1">{value}</p>
    </div>
  );
}

// ── Command center shell ──────────────────────────────────────────
function CommandCenter({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("escrow");
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "escrow", label: "💰 Pengawasan Escrow", icon: <Wallet className="w-4 h-4" /> },
    { id: "resolution", label: "⚖️ Pusat Resolusi", icon: <Gavel className="w-4 h-4" /> },
    { id: "onsite", label: "👷 Monitoring Proyek Fisik", icon: <HardHat className="w-4 h-4" /> },
    { id: "users", label: "🚫 Pengguna & Blacklist", icon: <Users className="w-4 h-4" /> },
    { id: "academy", label: "🎓 Kurasi Akademi", icon: <GraduationCap className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside
        className="md:w-64 shrink-0 md:min-h-screen text-white"
        style={{ background: "linear-gradient(180deg, #064e3b 0%, #022c22 100%)" }}
      >
        <div className="px-5 py-5 flex items-center gap-3 border-b border-emerald-800/50">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow"
            style={{ background: `linear-gradient(135deg, ${GOLD}, #b8912a)` }}
          >
            <Shield className="w-5 h-5 text-emerald-950" strokeWidth={2.5} />
          </div>
          <div>
            <p className="font-black text-sm leading-tight">Tilu Company</p>
            <p className="text-[11px]" style={{ color: GOLD }}>Command Center</p>
          </div>
        </div>
        <nav className="p-3 flex md:flex-col gap-1.5 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              data-testid={`tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-bold whitespace-nowrap transition-colors ${
                tab === t.id ? "bg-white/10 text-white" : "text-emerald-200/70 hover:bg-white/5"
              }`}
              style={tab === t.id ? { boxShadow: `inset 3px 0 0 ${GOLD}` } : {}}
            >
              {t.icon} <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-3 md:absolute md:bottom-0 md:w-64">
          <button
            data-testid="button-admin-logout"
            onClick={onLogout}
            className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-bold text-emerald-200/70 hover:bg-white/5 w-full"
          >
            <LogOut className="w-4 h-4" /> Keluar
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-4 sm:p-6 max-w-full overflow-x-hidden">
        <div className="mb-5">
          <h2 className="text-lg font-black text-gray-900">
            {tabs.find((t) => t.id === tab)?.label}
          </h2>
          <p className="text-sm text-gray-500">Panel operator platform Rekhastha</p>
        </div>
        {tab === "escrow" && <EscrowTab />}
        {tab === "resolution" && <ResolutionTab />}
        {tab === "onsite" && <OnsiteTab />}
        {tab === "users" && <UsersTab />}
        {tab === "academy" && <AcademyTab />}
      </main>

      {/* Full-screen worker SOS alarm — blocks everything when active */}
      <EmergencyAlarm />
    </div>
  );
}

export default function AdminPortal() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    adminMe().then(() => setAuthed(true)).catch(() => setAuthed(false));
  }, []);

  const handleLogout = async () => {
    try { await adminLogout(); } catch { /* ignore */ }
    setAuthed(false);
  };

  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-emerald-950">
        <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
      </div>
    );
  }

  return authed
    ? <CommandCenter onLogout={handleLogout} />
    : <LoginGate onSuccess={() => setAuthed(true)} />;
}
