import { useEffect, useState, useCallback } from "react";
import {
  Briefcase, Plus, X, Loader2, ExternalLink, CheckCircle2,
  Clock3, AlertTriangle, ChevronRight, ArrowLeft, Wallet, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createEscrowProject,
  fetchEscrowProjects,
  fetchEscrowProject,
  lockEscrowProject,
  simulatePaidEscrowProject,
  approveMilestone,
  EscrowError,
  type EscrowProject,
  type EscrowProjectWithMilestones,
} from "@/lib/escrow-client";
import { AuthUser } from "@/types/auth";

const STATUS_LABEL: Record<EscrowProject["status"], string> = {
  draft: "Draf",
  pending_payment: "Menunggu Pembayaran",
  funded: "Terdanai",
  completed: "Selesai",
  expired: "Kedaluwarsa",
};

const STATUS_STYLE: Record<EscrowProject["status"], string> = {
  draft: "bg-gray-100 text-gray-600",
  pending_payment: "bg-amber-100 text-amber-700",
  funded: "bg-violet-100 text-violet-700",
  completed: "bg-emerald-100 text-emerald-700",
  expired: "bg-red-100 text-red-600",
};

const MILESTONE_STATUS_STYLE: Record<string, string> = {
  pending: "bg-gray-100 text-gray-500",
  disbursed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-600",
};

function formatIdr(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function ProyekBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 ${className}`}>
      Proyek
    </span>
  );
}

type MilestoneDraft = { title: string; percentage: string };

function CreateProjectForm({
  onCreated,
  onCancel,
}: {
  onCreated: (p: EscrowProjectWithMilestones) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([
    { title: "Uang Muka (DP)", percentage: "50" },
    { title: "Pelunasan", percentage: "50" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const totalPct = milestones.reduce((s, m) => s + (parseFloat(m.percentage) || 0), 0);

  const updateMilestone = (i: number, field: keyof MilestoneDraft, value: string) => {
    setMilestones((prev) => prev.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));
  };

  const addMilestone = () => setMilestones((prev) => [...prev, { title: "", percentage: "" }]);
  const removeMilestone = (i: number) => setMilestones((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    setError(null);
    const amount = parseInt(totalAmount.replace(/\D/g, ""), 10);
    if (!title.trim()) return setError("Judul proyek wajib diisi.");
    if (!amount || amount <= 0) return setError("Nilai total proyek harus lebih dari 0.");
    if (milestones.some((m) => !m.title.trim() || !m.percentage)) {
      return setError("Setiap milestone harus memiliki judul dan persentase.");
    }
    if (Math.abs(totalPct - 100) > 0.01) {
      return setError(`Total persentase milestone harus 100% (saat ini ${totalPct}%).`);
    }
    setSubmitting(true);
    try {
      const project = await createEscrowProject({
        title: title.trim(),
        description: description.trim(),
        totalAmount: amount,
        milestones: milestones.map((m) => ({ title: m.title.trim(), percentage: parseFloat(m.percentage) })),
      });
      onCreated(project);
    } catch (err) {
      setError(err instanceof EscrowError ? err.message : "Gagal membuat proyek.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-900 text-base">Buat Proyek Baru</h3>
        <button onClick={onCancel} className="text-gray-400 p-1 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-gray-500">Judul Proyek</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Renovasi Toko — Fase 1"
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">Deskripsi</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ringkasan lingkup pekerjaan..."
            rows={2}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">Total Nilai Proyek (IDR)</label>
          <input
            inputMode="numeric"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value.replace(/\D/g, ""))}
            placeholder="10000000"
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          {!!totalAmount && (
            <p className="text-[11px] text-gray-400 mt-1">{formatIdr(parseInt(totalAmount, 10) || 0)}</p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-500">Milestone</label>
            <span className={`text-[11px] font-bold ${Math.abs(totalPct - 100) < 0.01 ? "text-emerald-600" : "text-amber-600"}`}>
              Total: {totalPct}%
            </span>
          </div>
          <div className="space-y-2">
            {milestones.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={m.title}
                  onChange={(e) => updateMilestone(i, "title", e.target.value)}
                  placeholder={`Milestone ${i + 1}`}
                  className="flex-1 rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <div className="relative w-20 shrink-0">
                  <input
                    inputMode="numeric"
                    value={m.percentage}
                    onChange={(e) => updateMilestone(i, "percentage", e.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="0"
                    className="w-full rounded-lg border border-gray-200 pl-2.5 pr-5 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                </div>
                {milestones.length > 1 && (
                  <button onClick={() => removeMilestone(i)} className="text-gray-300 hover:text-red-500 p-1 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button onClick={addMilestone} className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80">
            <Plus className="w-3.5 h-3.5" /> Tambah Milestone
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <Button
          disabled={submitting}
          onClick={handleSubmit}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl h-11"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Buat Proyek"}
        </Button>
      </div>
    </div>
  );
}

function ProjectDetail({
  project,
  onBack,
  onUpdated,
}: {
  project: EscrowProjectWithMilestones;
  onBack: () => void;
  onUpdated: (p: EscrowProjectWithMilestones) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sandboxHidden, setSandboxHidden] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const fresh = await fetchEscrowProject(project.id);
      onUpdated(fresh);
    } catch {
      // ignore transient refresh errors
    }
  }, [project.id, onUpdated]);

  useEffect(() => {
    if (project.status !== "pending_payment") return;
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [project.status, refresh]);

  const handleLock = async () => {
    setBusy("lock");
    setError(null);
    try {
      const updated = await lockEscrowProject(project.id);
      onUpdated({ ...project, ...updated });
    } catch (err) {
      setError(err instanceof EscrowError ? err.message : "Gagal mengunci proyek.");
    } finally {
      setBusy(null);
    }
  };

  const handleSimulate = async () => {
    setBusy("simulate");
    setError(null);
    setNotice(null);
    try {
      const res = await simulatePaidEscrowProject(project.id);
      setNotice(res.message);
    } catch (err) {
      if (err instanceof EscrowError && err.status === 403) {
        setSandboxHidden(true);
      } else {
        setError(err instanceof EscrowError ? err.message : "Gagal mensimulasikan pembayaran.");
      }
    } finally {
      setBusy(null);
    }
  };

  const handleApprove = async (milestoneId: number) => {
    setBusy(`approve-${milestoneId}`);
    setError(null);
    try {
      const res = await approveMilestone(project.id, milestoneId);
      onUpdated({
        ...project,
        status: res.projectCompleted ? "completed" : project.status,
        milestones: project.milestones.map((m) => (m.id === milestoneId ? res.milestone : m)),
      });
    } catch (err) {
      setError(err instanceof EscrowError ? err.message : "Gagal menyetujui milestone.");
    } finally {
      setBusy(null);
    }
  };

  const disbursedAmount = project.milestones.filter((m) => m.status === "disbursed").reduce((s, m) => s + m.amount, 0);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke daftar
      </button>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <ProyekBadge />
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[project.status]}`}>
                {STATUS_LABEL[project.status]}
              </span>
            </div>
            <h3 className="font-bold text-gray-900 text-lg truncate">{project.title}</h3>
            {project.description && <p className="text-sm text-gray-500 mt-1">{project.description}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Total Nilai</p>
            <p className="font-bold text-gray-900 mt-0.5">{formatIdr(project.totalAmount)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Sudah Dicairkan</p>
            <p className="font-bold text-emerald-600 mt-0.5">{formatIdr(disbursedAmount)}</p>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}
        {notice && (
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-700">{notice}</p>
          </div>
        )}

        {project.status === "draft" && (
          <Button onClick={handleLock} disabled={busy === "lock"} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl h-11">
            {busy === "lock" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Kunci & Bayar (Kirim Invoice Xendit)"}
          </Button>
        )}

        {project.status === "pending_payment" && (
          <div className="space-y-2">
            {project.xenditInvoiceUrl && (
              <a
                href={project.xenditInvoiceUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold rounded-xl h-11 text-sm transition-colors"
              >
                Bayar via Xendit <ExternalLink className="w-4 h-4" />
              </a>
            )}
            {!sandboxHidden && (
              <Button
                onClick={handleSimulate}
                disabled={busy === "simulate"}
                variant="outline"
                className="w-full font-semibold rounded-xl h-11 border-dashed border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                {busy === "simulate" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Simulasikan Pembayaran (Sandbox)"}
              </Button>
            )}
            <p className="text-[11px] text-gray-400 flex items-center gap-1.5 justify-center">
              <Clock3 className="w-3.5 h-3.5" /> Menunggu konfirmasi pembayaran dari Xendit...
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5">
        <h4 className="font-bold text-gray-900 text-sm mb-3">Milestone</h4>
        <div className="space-y-2.5">
          {project.milestones.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{m.title}</p>
                <p className="text-xs text-gray-500">{m.percentage}% · {formatIdr(m.amount)}</p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${MILESTONE_STATUS_STYLE[m.status]}`}>
                  {m.status === "pending" ? "Menunggu" : m.status === "disbursed" ? "Dicairkan" : "Gagal"}
                </span>
                {m.status === "pending" && (project.status === "funded" || project.status === "completed") && (
                  <button
                    onClick={() => handleApprove(m.id)}
                    disabled={busy === `approve-${m.id}`}
                    className="text-[11px] font-bold bg-primary text-white px-2.5 py-1.5 rounded-lg disabled:opacity-60"
                  >
                    {busy === `approve-${m.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : "Approve"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function EscrowProjectsPanel({ currentUser }: { currentUser: AuthUser }) {
  const [projects, setProjects] = useState<EscrowProject[] | null>(null);
  const [selected, setSelected] = useState<EscrowProjectWithMilestones | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isEmployer = currentUser.role === "perusahaan";

  const load = useCallback(async () => {
    try {
      const rows = await fetchEscrowProjects();
      setProjects(rows);
    } catch (err) {
      setLoadError(err instanceof EscrowError ? err.message : "Gagal memuat proyek.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (id: number) => {
    try {
      const full = await fetchEscrowProject(id);
      setSelected(full);
    } catch (err) {
      setLoadError(err instanceof EscrowError ? err.message : "Gagal memuat detail proyek.");
    }
  };

  if (selected) {
    return (
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-4 sm:p-6 max-w-3xl mx-auto lg:mx-0">
          <ProjectDetail
            project={selected}
            onBack={() => { setSelected(null); load(); }}
            onUpdated={(p) => { setSelected(p); setProjects((prev) => prev?.map((row) => (row.id === p.id ? p : row)) ?? prev); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto lg:mx-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-purple-600" /> Proyek & Milestone
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {isEmployer ? "Kontrak proyek dengan pembayaran escrow bertahap via Xendit" : "Proyek yang ditugaskan kepada Anda"}
            </p>
          </div>
          {isEmployer && !showCreate && (
            <Button onClick={() => setShowCreate(true)} className="bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl">
              <Plus className="w-4 h-4 mr-1.5" /> Proyek Baru
            </Button>
          )}
        </div>

        {loadError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{loadError}</p>
          </div>
        )}

        {showCreate && (
          <CreateProjectForm
            onCancel={() => setShowCreate(false)}
            onCreated={(p) => { setShowCreate(false); setSelected(p); load(); }}
          />
        )}

        {projects === null ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : projects.length === 0 && !showCreate ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-10 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center">
              <Wallet className="w-7 h-7 text-purple-400" />
            </div>
            <p className="font-bold text-gray-700 text-sm">Belum ada Proyek</p>
            <p className="text-xs text-gray-400 max-w-xs leading-relaxed">
              {isEmployer
                ? "Buat proyek dengan milestone untuk mendanai pekerjaan bertahap melalui escrow Xendit."
                : "Proyek yang ditugaskan oleh pemberi kerja akan muncul di sini."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => openDetail(p.id)}
                className="text-left bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md hover:border-purple-200 transition-all flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <ProyekBadge />
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[p.status]}`}>
                      {STATUS_LABEL[p.status]}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 truncate">{p.title}</h3>
                  {p.description && <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{p.description}</p>}
                </div>
                <p className="text-sm font-semibold text-gray-900">{formatIdr(p.totalAmount)}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
