import { useCallback, useEffect, useRef, useState } from "react";
import {
  Shield, LogOut, Wallet, Users, GraduationCap, Zap, RefreshCw,
  Ban, CheckCircle2, Lock, KeyRound, Loader2, AlertTriangle, ClipboardList,
} from "lucide-react";
import {
  adminLogin, adminLogout, adminMe, fetchLedger, forceRelease,
  fetchAdminUsers, toggleSuspend, AdminError,
  type LedgerRow, type AdminUserRow,
} from "@/lib/admin-client";

const API_BASE = "/api";
const GOLD = "#D4AF37";

function formatRp(v: number): string {
  return "Rp " + Math.round(v).toLocaleString("id-ID");
}

type Tab = "escrow" | "users" | "academy";

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

// ── Tab 3: Academy scaffold ───────────────────────────────────────
function AcademyTab() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h3 className="font-black text-gray-900 flex items-center gap-2 mb-1">
          <ClipboardList className="w-4 h-4 text-emerald-700" /> Peserta Lulus Kuis
        </h3>
        <p className="text-xs text-gray-500 mb-4">Daftar pekerja yang menyelesaikan asesmen akademi.</p>
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
          <GraduationCap className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Belum ada data — modul akademi segera hadir.</p>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <h3 className="font-black text-gray-900 flex items-center gap-2 mb-1">
          <GraduationCap className="w-4 h-4 text-emerald-700" /> Editor Parameter Soal
        </h3>
        <p className="text-xs text-gray-500 mb-4">Kurasi bank soal &amp; parameter penilaian asesmen.</p>
        <div className="space-y-3 opacity-60 pointer-events-none">
          <div>
            <label className="text-xs font-bold text-gray-600">Judul Soal</label>
            <div className="mt-1 h-10 rounded-xl border border-gray-200 bg-gray-50" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600">Kategori</label>
            <div className="mt-1 h-10 rounded-xl border border-gray-200 bg-gray-50" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600">Nilai Lulus (%)</label>
            <div className="mt-1 h-10 rounded-xl border border-gray-200 bg-gray-50" />
          </div>
          <div className="h-10 rounded-xl bg-emerald-700/30" />
        </div>
        <p className="text-[11px] text-gray-400 mt-3 text-center">Kerangka siap — logika akademi akan diaktifkan nanti.</p>
      </div>
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
        {tab === "users" && <UsersTab />}
        {tab === "academy" && <AcademyTab />}
      </main>
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
