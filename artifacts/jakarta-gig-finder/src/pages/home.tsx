import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Map from "@/components/map";
import WorkerMap from "@/components/worker-map";
import WorkerSheet from "@/components/bottom-sheet";
import JobSheet from "@/components/job-sheet";
import JobPostingModal from "@/components/job-posting-modal";
import WorkerOnboarding from "@/components/worker-onboarding";
import NotificationPanel from "@/components/notification-panel";
import ClockInModal from "@/components/clock-in-modal";
import RatingModal, { RatingPayload } from "@/components/rating-modal";
import SOSButton from "@/components/sos-button";
import PaySlipModal from "@/components/pay-slip-modal";
import EarningsDashboard from "@/components/earnings-dashboard";
import { workers, Worker } from "@/data/workers";
import { jobs } from "@/data/jobs";
import { CustomJob, calcTotal } from "@/types/custom-job";
import { WorkerProfile, isVerified } from "@/types/worker-profile";
import {
  ApplicationNotification, ApplicationStatus,
  maskName, maskNik, maskNpwp, maskRekening,
} from "@/types/notification";
import { Button } from "@/components/ui/button";
import {
  MapPin, Clock, Banknote, Search, X, ShieldCheck, UserCircle,
  Map as MapIcon, Briefcase, Star, TrendingUp, XCircle,
} from "lucide-react";

let nextJobId = 100;
let nextNotifId = 1;

function randomJakartaCoords() {
  return {
    lat: -6.2088 + (Math.random() - 0.5) * 0.14,
    lng: 106.8456 + (Math.random() - 0.5) * 0.14,
  };
}

const JAKARTA_CENTER = { lat: -6.2088, lng: 106.8456 };

type JobStatus = "accepted" | "clocked_in" | "completed" | null;

export default function Home() {
  // ── Mode & navigation ──────────────────────────────────────────────
  const [mode, setMode] = useState<"perusahaan" | "pekerja">("perusahaan");
  const [workerView, setWorkerView] = useState<"list" | "map">("list");

  // ── Search & filter ────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);

  // ── Selected items ─────────────────────────────────────────────────
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [selectedJob, setSelectedJob] = useState<CustomJob | null>(null);

  // ── Job data ───────────────────────────────────────────────────────
  const [customJobs, setCustomJobs] = useState<CustomJob[]>([]);

  // ── Worker profile & onboarding ────────────────────────────────────
  const [workerProfile, setWorkerProfile] = useState<WorkerProfile | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // ── Reputation system (Fitur 3) ────────────────────────────────────
  const [reputationPoints, setReputationPoints] = useState(100);
  const isSuspended = reputationPoints < 50;

  // ── Active job & clock-in/out (Fitur 1) ───────────────────────────
  const [activeJob, setActiveJob] = useState<CustomJob | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>(null);
  const [clockedInAt, setClockedInAt] = useState<Date | null>(null);
  const [clockedOutAt, setClockedOutAt] = useState<Date | null>(null);
  const [showClockIn, setShowClockIn] = useState(false);

  // ── Rating system (Fitur 2) ────────────────────────────────────────
  const [pendingRating, setPendingRating] = useState<{
    raterType: "company" | "worker"; targetName: string; job: CustomJob;
  } | null>(null);

  // ── Pay slip (Fitur 5) ────────────────────────────────────────────
  const [showPaySlip, setShowPaySlip] = useState(false);

  // ── Earnings dashboard ────────────────────────────────────────────
  const [showEarnings, setShowEarnings] = useState(false);
  const [totalEarned, setTotalEarned] = useState(0);
  const [completedNotifs, setCompletedNotifs] = useState<ApplicationNotification[]>([]);

  // ── Notifications (Fitur for company) ────────────────────────────
  const [notifications, setNotifications] = useState<ApplicationNotification[]>([]);

  // ── Geolocation ───────────────────────────────────────────────────
  const [userLocation, setUserLocation] = useState(JAKARTA_CENTER);

  useEffect(() => {
    if (mode === "pekerja" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setUserLocation({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => setUserLocation(JAKARTA_CENTER)
      );
    }
  }, [mode]);

  // ── Mode change ───────────────────────────────────────────────────
  const handleModeChange = useCallback((m: "perusahaan" | "pekerja") => {
    setMode(m);
    if (m === "pekerja" && !workerProfile) setShowOnboarding(true);
  }, [workerProfile]);

  // ── Search & tags ─────────────────────────────────────────────────
  const suggestedTags = ["Barista", "Waiter / Waitress", "Event Crew / Runner", "Latte Art", "POS/Kasir", "Crowd Control"];
  const visibleTags = searchQuery
    ? suggestedTags.filter((t) => t.toLowerCase().includes(searchQuery.toLowerCase()) && !activeTags.includes(t))
    : suggestedTags.filter((t) => !activeTags.includes(t));

  const addTag = useCallback((tag: string) => {
    setActiveTags((p) => p.includes(tag) ? p : [...p, tag]);
    setSearchQuery("");
  }, []);
  const removeTag = useCallback((tag: string) => setActiveTags((p) => p.filter((t) => t !== tag)), []);

  const filteredWorkers = useMemo(() => {
    if (!activeTags.length && !searchQuery.trim()) return workers;
    return workers.filter((w) => {
      const q = searchQuery.toLowerCase().trim();
      const matchQ = !q || w.name.toLowerCase().includes(q) || w.category.toLowerCase().includes(q) || w.skills.some((s) => s.toLowerCase().includes(q));
      const matchT = !activeTags.length || activeTags.some((tag) => w.category === tag || w.skills.some((s) => s.toLowerCase() === tag.toLowerCase()));
      return matchQ && matchT;
    });
  }, [searchQuery, activeTags]);

  // ── Job posting ───────────────────────────────────────────────────
  const handleJobPosted = useCallback((data: Omit<CustomJob, "id" | "type" | "lat" | "lng" | "postedAt">) => {
    const coords = randomJakartaCoords();
    setCustomJobs((p) => [...p, { id: nextJobId++, type: "custom_job", ...data, ...coords, postedAt: new Date() }]);
  }, []);

  // ── Worker applies to job (Fitur: notification + active job) ──────
  const handleApply = useCallback((job: CustomJob, profile: WorkerProfile) => {
    const notif: ApplicationNotification = {
      id: nextNotifId++, jobId: job.id, jobTitle: job.posisi,
      applicantName: maskName(profile.namaLengkap),
      applicantNikMasked: maskNik(profile.nik),
      applicantNpwpMasked: profile.belumPunyaNpwp ? "Belum ada NPWP" : maskNpwp(profile.npwp),
      hasNpwp: !profile.belumPunyaNpwp,
      bank: profile.namaBank || "—",
      rekening: maskRekening(profile.nomorRekening),
      timestamp: new Date(), status: "baru",
    };
    setNotifications((p) => [notif, ...p]);
    // Set this as the worker's active job
    setActiveJob(job);
    setJobStatus("accepted");
  }, []);

  const handleStatusChange = useCallback((id: number, status: ApplicationStatus) => {
    setNotifications((p) => p.map((n) => n.id === id ? { ...n, status } : n));
    // Company accepts → trigger company rating modal
    if (status === "diterima") {
      const n = notifications.find((x) => x.id === id);
      if (n && customJobs.length > 0) {
        const job = customJobs.find((j) => j.id === n.jobId);
        if (job) {
          setPendingRating({ raterType: "company", targetName: n.applicantName, job });
        }
      }
    }
  }, [notifications, customJobs]);

  // ── Clock-in ──────────────────────────────────────────────────────
  const handleClockIn = useCallback(() => {
    setClockedInAt(new Date());
    setJobStatus("clocked_in");
  }, []);

  // ── Clock-out → trigger worker rating ────────────────────────────
  const handleClockOut = useCallback(() => {
    const now = new Date();
    setClockedOutAt(now);
    setJobStatus("completed");
    // Accumulate earnings
    if (activeJob) {
      const gross = calcTotal(activeJob.nominal, activeJob.pembayaran);
      setTotalEarned((p) => p + gross);
      setCompletedNotifs((p) => {
        const dummy: ApplicationNotification = {
          id: nextNotifId++, jobId: activeJob.id, jobTitle: activeJob.posisi,
          applicantName: workerProfile?.namaLengkap ?? "Pekerja",
          applicantNikMasked: "", applicantNpwpMasked: "",
          hasNpwp: !(workerProfile?.belumPunyaNpwp ?? true),
          bank: workerProfile?.namaBank ?? "",
          rekening: workerProfile?.nomorRekening ?? "",
          timestamp: now, status: "diterima",
        };
        return [...p, dummy];
      });
      // Trigger worker→company rating
      setPendingRating({ raterType: "worker", targetName: "Perusahaan Pengiklan", job: activeJob });
    }
  }, [activeJob, workerProfile]);

  // ── Rating submit ─────────────────────────────────────────────────
  const handleRatingSubmit = useCallback((_payload: RatingPayload) => {
    setPendingRating(null);
  }, []);

  // ── Cancel active job (Fitur 3: -20 poin) ────────────────────────
  const handleCancelJob = useCallback(() => {
    setActiveJob(null);
    setJobStatus(null);
    setClockedInAt(null);
    setClockedOutAt(null);
    setReputationPoints((p) => Math.max(0, p - 20));
  }, []);

  const verified = workerProfile ? isVerified(workerProfile) : false;

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-gray-50 relative overflow-hidden">

      {/* ── MODALS & OVERLAYS ─────────────────────────────────── */}

      {showOnboarding && (
        <WorkerOnboarding
          onComplete={(p) => { setWorkerProfile(p); setShowOnboarding(false); }}
          onDismiss={() => setShowOnboarding(false)}
        />
      )}

      {showClockIn && activeJob && (
        <ClockInModal
          job={activeJob}
          userLat={userLocation.lat}
          userLng={userLocation.lng}
          isClockedIn={jobStatus === "clocked_in"}
          clockedInAt={clockedInAt}
          onClockIn={handleClockIn}
          onClockOut={handleClockOut}
          onClose={() => setShowClockIn(false)}
        />
      )}

      {pendingRating && (
        <RatingModal
          raterType={pendingRating.raterType}
          targetName={pendingRating.targetName}
          jobTitle={pendingRating.job.posisi}
          onSubmit={handleRatingSubmit}
          onClose={() => setPendingRating(null)}
        />
      )}

      {showPaySlip && activeJob && workerProfile && (
        <PaySlipModal
          job={activeJob}
          workerProfile={workerProfile}
          clockedInAt={clockedInAt}
          clockedOutAt={clockedOutAt}
          onClose={() => setShowPaySlip(false)}
        />
      )}

      {showEarnings && workerProfile && (
        <EarningsDashboard
          workerProfile={workerProfile}
          reputationPoints={reputationPoints}
          completedJobs={completedNotifs}
          totalEarned={totalEarned}
          onDownloadSlip={() => { setShowEarnings(false); setShowPaySlip(true); }}
          onClose={() => setShowEarnings(false)}
        />
      )}

      {/* SOS — only when clocked-in (Fitur 4) */}
      {mode === "pekerja" && jobStatus === "clocked_in" && activeJob && (
        <SOSButton jobTitle={activeJob.posisi} />
      )}

      {/* ── HEADER ───────────────────────────────────────────── */}
      <header className="z-10 bg-white border-b border-gray-100 shadow-sm flex flex-col shrink-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-lg text-primary tracking-tight">GigFinder</h1>
            {mode === "perusahaan" && (
              <NotificationPanel notifications={notifications} onStatusChange={handleStatusChange} />
            )}
          </div>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              data-testid="button-mode-perusahaan"
              onClick={() => handleModeChange("perusahaan")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${mode === "perusahaan" ? "bg-white text-primary shadow-sm" : "text-gray-500"}`}
            >
              Mode Perusahaan
            </button>
            <button
              data-testid="button-mode-pekerja"
              onClick={() => handleModeChange("pekerja")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${mode === "pekerja" ? "bg-white text-primary shadow-sm" : "text-gray-500"}`}
            >
              Mode Pekerja
            </button>
          </div>
        </div>

        {/* Company: Smart Search */}
        {mode === "perusahaan" && (
          <div className="px-4 pb-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                data-testid="input-search"
                type="text" value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kategori, keahlian, atau nama pekerja..."
                className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {activeTags.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {activeTags.map((tag) => (
                  <button key={tag} onClick={() => removeTag(tag)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-primary text-white text-xs font-semibold rounded-full">
                    {tag} <X className="w-3 h-3" />
                  </button>
                ))}
                <button onClick={() => setActiveTags([])} className="px-3 py-1 text-xs text-gray-500 border border-gray-200 rounded-full">
                  Hapus semua
                </button>
              </div>
            )}
            {visibleTags.length > 0 && (searchQuery || !activeTags.length) && (
              <div className="overflow-x-auto whitespace-nowrap flex gap-2 pb-0.5" style={{ scrollbarWidth: "none" }}>
                {visibleTags.map((tag) => (
                  <button key={tag} onClick={() => addTag(tag)}
                    className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:border-primary/50 hover:text-primary transition-colors">
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Worker: profile + view toggle */}
        {mode === "pekerja" && (
          <div className="px-4 pb-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {verified ? (
                  <button
                    onClick={() => setShowEarnings(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" /> Terverifikasi · Lihat Dashboard
                  </button>
                ) : (
                  <button
                    data-testid="button-complete-profile"
                    onClick={() => setShowOnboarding(true)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full"
                  >
                    <UserCircle className="w-3.5 h-3.5" />
                    {workerProfile ? "Lengkapi Profil" : "Daftar & Verifikasi"}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Reputation badge */}
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                  isSuspended ? "bg-red-100 text-red-600" :
                  reputationPoints < 80 ? "bg-amber-100 text-amber-700" :
                  "bg-primary/10 text-primary"
                }`}>
                  {isSuspended ? "Suspended" : `Rep: ${reputationPoints}`}
                </span>

                <div className="flex bg-gray-100 p-0.5 rounded-lg">
                  <button
                    onClick={() => setWorkerView("list")}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${workerView === "list" ? "bg-white text-primary shadow-sm" : "text-gray-500"}`}
                  >
                    Daftar
                  </button>
                  <button
                    onClick={() => setWorkerView("map")}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${workerView === "map" ? "bg-white text-primary shadow-sm" : "text-gray-500"}`}
                  >
                    <MapIcon className="w-3 h-3" /> Radar
                  </button>
                </div>
              </div>
            </div>

            {/* Active job banner */}
            {activeJob && (
              <div className={`rounded-xl px-3 py-2.5 border flex items-center justify-between gap-2 ${
                jobStatus === "clocked_in" ? "bg-primary text-white border-primary" :
                jobStatus === "completed" ? "bg-gray-50 border-gray-200" :
                "bg-amber-50 border-amber-200"
              }`}>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Briefcase className={`w-4 h-4 shrink-0 ${jobStatus === "clocked_in" ? "text-white" : jobStatus === "completed" ? "text-gray-400" : "text-amber-600"}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold truncate ${jobStatus === "clocked_in" ? "text-white" : "text-gray-900"}`}>{activeJob.posisi}</p>
                    <p className={`text-[10px] ${jobStatus === "clocked_in" ? "text-white/70" : "text-gray-500"}`}>
                      {jobStatus === "accepted" ? "Diterima — belum Clock-In" : jobStatus === "clocked_in" ? "Sedang bekerja..." : "Selesai"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {jobStatus === "completed" ? (
                    <>
                      <button
                        onClick={() => setShowPaySlip(true)}
                        className="text-[10px] font-bold bg-primary text-white px-2.5 py-1.5 rounded-lg"
                      >
                        Slip Gaji
                      </button>
                      <button onClick={() => { setActiveJob(null); setJobStatus(null); }} className="text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-1.5 rounded-lg">
                        Tutup
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        data-testid="button-open-clock-in"
                        onClick={() => setShowClockIn(true)}
                        className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg ${
                          jobStatus === "clocked_in" ? "bg-white/20 text-white" : "bg-primary text-white"
                        }`}
                      >
                        {jobStatus === "clocked_in" ? "Clock-Out" : "Clock-In"}
                      </button>
                      {jobStatus !== "clocked_in" && (
                        <button
                          data-testid="button-cancel-job"
                          onClick={handleCancelJob}
                          className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-1.5 rounded-lg"
                        >
                          Batal
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      {/* ── MAIN CONTENT ─────────────────────────────────────── */}
      <main className="flex-1 relative overflow-hidden flex flex-col">

        {/* ── COMPANY MODE ──────────────────────────────────── */}
        {mode === "perusahaan" ? (
          <div className="flex-1 relative">
            <Map
              workers={filteredWorkers} onWorkerClick={(w) => { setSelectedJob(null); setSelectedWorker(w); }}
              customJobs={customJobs} onJobClick={(j) => { setSelectedWorker(null); setSelectedJob(j); }}
            />
            {/* Legend */}
            <div className="absolute bottom-4 left-3 z-10 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow border border-gray-100 flex flex-col gap-1.5">
              {[["#065F46","Barista"],["#1D4ED8","Waiter / Waitress"],["#D97706","Event Crew"]].map(([c,l]) => (
                <div key={l} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border-2 border-white shadow-sm shrink-0" style={{ background: c }} />
                  <span className="text-[10px] font-medium text-gray-600">{l}</span>
                </div>
              ))}
              {customJobs.length > 0 && (
                <div className="flex items-center gap-2 border-t border-gray-100 pt-1.5">
                  <span className="w-3.5 h-3.5 rounded-[3px] bg-violet-600 border-2 border-white shadow-sm shrink-0 flex items-center justify-center text-white text-[8px] font-black">+</span>
                  <span className="text-[10px] font-medium text-gray-600">Lowongan ({customJobs.length})</span>
                </div>
              )}
            </div>
            <WorkerSheet worker={selectedWorker} onClose={() => setSelectedWorker(null)} />
            <JobSheet job={selectedJob} onClose={() => setSelectedJob(null)} workerProfile={workerProfile} onApply={handleApply} />
            <JobPostingModal onSubmit={handleJobPosted} />
          </div>

        ) : workerView === "map" ? (
          /* ── WORKER RADAR MAP ─────────────────────────────── */
          <div className="flex-1 relative">
            <WorkerMap
              userLat={userLocation.lat} userLng={userLocation.lng}
              customJobs={customJobs} selectedJob={selectedJob}
              onJobClick={(j) => setSelectedJob(j)}
            />
            <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow border border-gray-100 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-primary border-2 border-white shadow-sm shrink-0" />
                <span className="text-[10px] font-medium text-gray-600">Lokasi Saya</span>
              </div>
              {customJobs.length > 0
                ? <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-[3px] bg-violet-600 border-2 border-white shadow-sm shrink-0 flex items-center justify-center text-white text-[8px] font-black">+</span>
                    <span className="text-[10px] font-medium text-gray-600">{customJobs.length} Lowongan</span>
                  </div>
                : <p className="text-[10px] text-gray-400">Belum ada lowongan</p>
              }
            </div>
            {selectedJob && (
              <div className="absolute bottom-4 left-4 right-4 z-10 bg-white rounded-xl shadow-lg border border-gray-100 p-3 flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-gray-900 truncate">{selectedJob.posisi}</p>
                  <p className="text-[10px] text-violet-600 font-medium">Klik pin untuk detail</p>
                </div>
                <button onClick={() => setSelectedJob(null)} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-4 h-4" /></button>
              </div>
            )}
            <JobSheet job={selectedJob} onClose={() => setSelectedJob(null)} workerProfile={workerProfile} onApply={isSuspended ? undefined : handleApply} />
          </div>

        ) : (
          /* ── WORKER LIST ──────────────────────────────────── */
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Pekerjaan Tersedia</h2>
                  <p className="text-sm text-gray-500">
                    {customJobs.length > 0 ? `${customJobs.length} lowongan kustom · ${jobs.length} tetap` : "Berdasarkan lokasi Anda"}
                  </p>
                </div>
                {workerProfile && (
                  <button
                    onClick={() => setShowEarnings(true)}
                    className="flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full"
                  >
                    <TrendingUp className="w-3.5 h-3.5" /> Dashboard
                  </button>
                )}
              </div>

              {/* Suspended warning */}
              {isSuspended && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                  <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-700">Akun Ditangguhkan (Suspended)</p>
                    <p className="text-xs text-red-600 mt-0.5">Poin reputasi Anda di bawah 50. Anda tidak dapat melamar pekerjaan. Hubungi admin untuk pemulihan akun.</p>
                  </div>
                </div>
              )}

              {customJobs.length > 0 && (
                <button
                  onClick={() => setWorkerView("map")}
                  className="w-full flex items-center justify-center gap-2 bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold py-2.5 rounded-xl hover:bg-violet-100 transition-colors"
                >
                  <MapIcon className="w-4 h-4" /> Lihat {customJobs.length} lowongan di Peta Radar
                </button>
              )}

              {/* Custom jobs */}
              {customJobs.map((job) => (
                <div key={job.id} data-testid={`card-custom-job-${job.id}`}
                  className="bg-white p-4 rounded-xl border border-violet-100 shadow-sm flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 truncate">{job.posisi}</h3>
                      <p className="text-xs text-violet-600 font-medium mt-0.5">Lowongan Kustom</p>
                    </div>
                    <span className="text-xs font-semibold bg-violet-100 text-violet-700 px-2 py-1 rounded ml-2 shrink-0">Baru</span>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2">{job.deskripsi}</p>
                  <div className="flex flex-col gap-1.5 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                      <span>Jakarta (lihat peta radar)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-semibold text-gray-900">
                        Rp {job.nominal.toLocaleString("id-ID")}
                        {job.pembayaran === "per_jam" ? " / Jam" : job.pembayaran === "per_shift" ? " / Shift" : " / Projek"}
                      </span>
                    </div>
                  </div>
                  <Button
                    disabled={isSuspended}
                    className={`w-full font-semibold ${isSuspended ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-violet-600 hover:bg-violet-700 text-white"}`}
                    onClick={() => !isSuspended && setSelectedJob(job)}
                  >
                    {isSuspended ? "Akun Ditangguhkan" : "Lihat Detail & Lamar"}
                  </Button>
                </div>
              ))}

              {/* Static jobs */}
              {jobs.map((job) => (
                <div key={job.id} data-testid={`card-job-${job.id}`}
                  className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-gray-900">{job.category}</h3>
                      <p className="text-sm text-primary font-medium">{job.company}</p>
                    </div>
                    <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded">Baru</span>
                  </div>
                  <div className="flex flex-col gap-2 text-sm text-gray-600">
                    <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" /><span>{job.location}</span></div>
                    <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /><span>{job.time}</span></div>
                    <div className="flex items-center gap-2"><Banknote className="w-4 h-4 text-primary" /><span className="font-semibold text-gray-900">{job.pay}</span></div>
                  </div>
                  <Button disabled={isSuspended} className={`w-full mt-1 ${isSuspended ? "bg-gray-200 text-gray-400" : "bg-primary hover:bg-primary/90 text-white"} font-semibold`}>
                    {isSuspended ? "Akun Ditangguhkan" : "Lamar Sekarang"}
                  </Button>
                </div>
              ))}
            </div>

            <JobSheet job={selectedJob} onClose={() => setSelectedJob(null)} workerProfile={workerProfile} onApply={isSuspended ? undefined : handleApply} />
          </div>
        )}
      </main>
    </div>
  );
}
