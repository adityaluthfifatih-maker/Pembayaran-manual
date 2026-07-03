import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Map from "@/components/map";
import WorkerMap from "@/components/worker-map";
import WorkerSheet from "@/components/bottom-sheet";
import JobSheet from "@/components/job-sheet";
import JobPostingModal from "@/components/job-posting-modal";
import WorkerOnboarding from "@/components/worker-onboarding";
import NotificationPanel from "@/components/notification-panel";
import ClockInModal from "@/components/clock-in-modal";
import AttendanceQrModal from "@/components/attendance-qr-modal";
import RatingModal, { RatingPayload } from "@/components/rating-modal";
import EmergencySOS from "@/components/emergency-sos";
import BoronganWorkerPanel from "@/components/borongan-worker-panel";
import PaySlipModal from "@/components/pay-slip-modal";
import EarningsDashboard from "@/components/earnings-dashboard";
import ChatModal from "@/components/chat-modal";
import AnalyticsDashboard from "@/components/analytics-dashboard";
import HiringModePanel from "@/components/hiring-mode-panel";
import JobPingModal from "@/components/job-ping-modal";
import ApplicantToast from "@/components/applicant-toast";
import InstantGigAlarm from "@/components/instant-gig-alarm";
import ScheduledJobsFeed from "@/components/scheduled-jobs-feed";
import { RekhasthaLogo } from "@/components/rekhastha-logo";
import {
  subscribeToServer,
  subscribeAttendance,
  subscribeApplication,
  postApplication,
  reconnectWs,
  type AttendanceEvent,
  type ApplicationEvent,
  getActiveGigs,
  resetServer,
  randomGeofenceCoords,
  triggerGlobalEscrowBroadcast,
  requestNotifPermission,
  fireNativeNotification,
  unlockAudio,
} from "@/lib/central-server";
import { createBlacklist, fetchEmployerIdsBlockingWorker } from "@/lib/blacklist-client";
import { submitRating } from "@/lib/rating-client";
import AuthPage from "@/pages/auth";
import { fetchMe, logout as logoutRequest } from "@/lib/auth-client";
import WorkerProfilePage from "@/components/worker-profile-page";
import CompanyProfilePage from "@/components/company-profile-page";
import { workers, Worker } from "@/data/workers";
import { jobs } from "@/data/jobs";
import { CustomJob, calcTotal, paymentUnits } from "@/types/custom-job";
import { WalletTransaction, EscrowEvent, calcSplit, ADMIN_DISPUTE_FEE, calcEscrowAmount, calcEmployerDeposit, DEFAULT_FEE_RATE, DURATION_DAYS, LATE_CLOCKIN_PENALTY, CLOCKIN_GRACE_MS, DISPUTE_WINDOW_MS, warnIfFeeRateMissing } from "@/types/escrow";
import { WorkerProfile, isVerified } from "@/types/worker-profile";
import { AuthUser } from "@/types/auth";
import {
  ApplicationNotification, ApplicationStatus,
  maskName, maskNik, maskNpwp, maskRekening,
} from "@/types/notification";
import { Button } from "@/components/ui/button";
import {
  MapPin, Clock, Banknote, Search, X, ShieldCheck, UserCircle,
  Map as MapIcon, Briefcase, TrendingUp, XCircle, MessageSquare,
  BarChart2, Home as HomeIcon, User, Users, Lock, CheckCircle2, AlertTriangle,
  CalendarDays, QrCode,
} from "lucide-react";

// Device-unique, monotonic id base so gigs posted from two different physical
// devices never collide on the shared server (client-provided primary key).
// A 29-bit random device prefix is shifted left by 20 bits, leaving ~1M
// monotonic ids per session; the whole space stays well under 2^53.
let nextJobId = Math.floor(Math.random() * 0x20000000) * 0x100000;

// Standby / backup workers for Butuh Cepat re-route on no-show
const STANDBY_WORKERS = ["Ahmad", "Rian", "Siti"];

function fmtCountdown(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
let nextNotifId = 1;

function randomJakartaCoords() {
  return {
    lat: -6.2088 + (Math.random() - 0.5) * 0.14,
    lng: 106.8456 + (Math.random() - 0.5) * 0.14,
  };
}

const JAKARTA_CENTER = { lat: -6.2088, lng: 106.8456 };
type JobStatus = "applied" | "accepted" | "clocked_in" | "completed" | null;
type CompanyView = "jobs" | "analytics";
type AppTab = "home" | "chat" | "profile";

// A gig is "instant" (Broadcast Instan) only when it is a cepat posting. Regular
// (lama) jobs — even once their escrow is locked and they go live — stay in the
// silent scheduled feed and never trigger the radar alarm or green pins.
const isInstantGig = (j: CustomJob) => j.hiringMode === "cepat";

// ── Demo data factories ────────────────────────────────────────────
function makeDemoWorkerProfile(): WorkerProfile {
  return {
    namaLengkap: "Budi Santoso", nik: "3175011502900001",
    tempatLahir: "Jakarta", tanggalLahir: "1990-02-15", jenisKelamin: "L",
    whatsapp: "08123456789", npwp: "123456789012345", belumPunyaNpwp: false,
    namaBank: "BCA", nomorRekening: "1234567890", namaRekening: "Budi Santoso",
    ktpUploaded: true, selfieUploaded: true,
  };
}

function makeDemoJobs(): CustomJob[] {
  const durations: Array<CustomJob["durasiKontrak"]> = ["harian", "1_bulan", "3_bulan", "6_bulan", "harian"];
  const tipes: Array<{ posisi: string; nominal: number; nama: string }> = [
    { posisi: "Barista Part-Time", nominal: 120_000, nama: "PT Kopi Kenangan" },
    { posisi: "Event Staff Runner", nominal: 200_000, nama: "EO Spekta Indonesia" },
    { posisi: "Pelayan Resto", nominal: 110_000, nama: "Resto Ayam Bakar Solo" },
    { posisi: "Admin & Kasir", nominal: 3_500_000, nama: "CV Indomaret Franchise" },
    { posisi: "Crew Packing Gudang", nominal: 175_000, nama: "PT Lazada Logistik" },
  ];
  return tipes.map((t, i) => {
    const pembayaran: CustomJob["pembayaran"] = i < 2 || i === 4 ? "per_shift" : i === 3 ? "per_projek" : "per_hari";
    const kuota = i === 1 ? 20 : 3;
    const jumlahHari = DURATION_DAYS[durations[i] ?? "harian"] ?? 1;
    const escrowAmount = calcEmployerDeposit(calcEscrowAmount(t.nominal, pembayaran, jumlahHari, kuota));
    return {
      id: nextJobId++, type: "custom_job" as const,
      posisi: t.posisi, deskripsi: `Dibutuhkan segera ${t.posisi} berpengalaman di bidangnya.`,
      pembayaran, nominal: t.nominal, dresscode: "Baju hitam, sopan", kuota,
      namaPerusahaan: t.nama, nibPerusahaan: "1234567890123",
      durasiKontrak: durations[i], tipeAkun: (i === 1 ? "agensi" : "perusahaan") as CustomJob["tipeAkun"],
      isAgency: i === 1,
      escrowStatus: "locked" as const,
      escrowAmount,
      jumlahHari,
      ...randomJakartaCoords(), postedAt: new Date(Date.now() - i * 3600_000),
    };
  });
}

function makeDemoRatings(): RatingPayload[] {
  const names = ["Andi Kurniawan", "Siti Rahayu", "Doni Prasetyo", "Maya Sari", "Rizky Pratama"];
  return names.map((name, i) => ({
    stars: 3 + (i % 3) + (i === 0 ? 2 : 0) > 5 ? 5 : 3 + (i % 3),
    comment: ["Pekerja sangat disiplin!", "Datang tepat waktu.", "Hasil kerja memuaskan.", "Cepat belajar & ramah.", "Profesional dan bertanggung jawab."][i],
    raterType: "company" as const,
    targetName: name,
  }));
}

function makeDemoNotifs(jobs: CustomJob[]): ApplicationNotification[] {
  const names = ["Andi K.", "Siti R.", "Doni P.", "Maya S.", "Rizky P.", "Agus T.", "Dewi L.", "Hendra M.", "Indah W.", "Joko S."];
  return names.slice(0, Math.min(names.length, jobs.length * 2)).map((name, i) => ({
    id: nextNotifId++,
    jobId: jobs[i % jobs.length]?.id ?? 100,
    jobTitle: jobs[i % jobs.length]?.posisi ?? "Pekerjaan",
    workerId: "",
    applicantName: name,
    applicantNikMasked: "3175••••••••0001",
    applicantNpwpMasked: "••••••0001",
    hasNpwp: i % 3 !== 0,
    bank: ["BCA", "BRI", "Mandiri", "OVO", "GoPay"][i % 5],
    rekening: "123••••789",
    timestamp: new Date(Date.now() - i * 900_000),
    status: (["baru", "ditinjau", "diterima", "baru", "ditinjau"] as ApplicationStatus[])[i % 5],
  }));
}

export default function Home() {
  // ── Auth & navigation ──────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [mode, setMode] = useState<"perusahaan" | "pekerja">("perusahaan");
  const [companyView, setCompanyView] = useState<CompanyView>("jobs");
  const [workerView, setWorkerView] = useState<"list" | "map" | "scheduled">("list");

  // ── Search ──────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);

  // ── Selections ──────────────────────────────────────────────────
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [selectedJob, setSelectedJob] = useState<CustomJob | null>(null);

  // ── Job data ────────────────────────────────────────────────────
  const [customJobs, setCustomJobs] = useState<CustomJob[]>([]);

  // ── Worker profile ──────────────────────────────────────────────
  const [workerProfile, setWorkerProfile] = useState<WorkerProfile | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // ── Reputation ──────────────────────────────────────────────────
  const [reputationPoints, setReputationPoints] = useState(100);
  const isSuspended = reputationPoints < 50;

  // ── Active job ──────────────────────────────────────────────────
  const [activeJob, setActiveJob] = useState<CustomJob | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>(null);
  const [clockedInAt, setClockedInAt] = useState<Date | null>(null);
  const [clockedOutAt, setClockedOutAt] = useState<Date | null>(null);
  const [showClockIn, setShowClockIn] = useState(false);

  // ── Discipline & dispute-window engines ─────────────────────────
  const [graceDeadline, setGraceDeadline] = useState<number | null>(null);   // 15-min Clock-In grace
  const [graceJob, setGraceJob] = useState<CustomJob | null>(null);           // job snapshot for grace-expiry penalty/re-route (survives activeJob changes)
  const [disputeDeadline, setDisputeDeadline] = useState<number | null>(null); // 24-hour post-shift window
  const [disputeJob, setDisputeJob] = useState<CustomJob | null>(null);       // job snapshot for auto-release (survives UI close)
  const [contractClosed, setContractClosed] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [standbyReroute, setStandbyReroute] = useState<{ workerName: string; jobTitle: string } | null>(null); // Butuh Cepat re-route on no-show

  // ── Ratings ─────────────────────────────────────────────────────
  const [ratings, setRatings] = useState<RatingPayload[]>([]);
  const [pendingRating, setPendingRating] = useState<{
    raterType: "company" | "worker"; targetName: string; job: CustomJob;
  } | null>(null);

  // ── Pay slip & earnings ─────────────────────────────────────────
  const [showPaySlip, setShowPaySlip] = useState(false);
  const [showEarnings, setShowEarnings] = useState(false);
  const [totalEarned, setTotalEarned] = useState(0);
  const [completedNotifs, setCompletedNotifs] = useState<ApplicationNotification[]>([]);

  // ── Escrow & Wallet ──────────────────────────────────────────────
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([]);
  const [platformBalance, setPlatformBalance] = useState(0);
  const [escrowEvents, setEscrowEvents] = useState<EscrowEvent[]>([]);

  // ── Chat ────────────────────────────────────────────────────────
  const [chatContext, setChatContext] = useState<{
    jobTitle: string; nominal: number; companyName: string;
    workerName: string; currentRole: "company" | "worker";
    hiringMode?: "cepat" | "lama"; jobId: number; workerId: string;
    feeRate?: number;
  } | null>(null);

  // ── Notifications ───────────────────────────────────────────────
  const [notifications, setNotifications] = useState<ApplicationNotification[]>([]);

  // ── Real-time: employer toast & worker ping ──────────────────────
  const [applicantToast, setApplicantToast] = useState<ApplicationNotification | null>(null);

  // ── Central virtual server: live employer→worker broadcast sync ──
  const [centralGigs, setCentralGigs] = useState<CustomJob[]>(() => getActiveGigs());
  // Employer ids that have blacklisted THIS worker (worker viewport only) — every
  // gig from these employers is hidden from the radar, pins, and feeds.
  const [blockedEmployerIds, setBlockedEmployerIds] = useState<Set<string>>(new Set());
  const blockedEmployerIdsRef = useRef<Set<string>>(new Set());
  // Employer-side QR Presensi board target (the job the employer is showing a QR for).
  const [attendanceQrJob, setAttendanceQrJob] = useState<CustomJob | null>(null);
  const [alarmGig, setAlarmGig] = useState<CustomJob | null>(null);
  const [radarOn, setRadarOn] = useState(true);
  const radarOnRef = useRef(true);
  const [radarStatusToast, setRadarStatusToast] = useState<string | null>(null);
  const radarToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Live mirror of the active UI role so the broadcast subscriber (registered once)
  // always reads the CURRENT viewport role instead of a stale closure value.
  const modeRef = useRef<"perusahaan" | "pekerja">(mode);
  // Gigs broadcast while the viewport is NOT in worker mode are held here and
  // surfaced the moment the viewport enters "pekerja" (Masuk Sebagai Pekerja).
  const pendingBroadcastRef = useRef<CustomJob | null>(null);

  // Register the central-server subscriber exactly once.
  useEffect(() => {
    const unsubscribe = subscribeToServer((gig, gigs) => {
      // Always keep the gig array in sync so radar pins + the scheduled feed stay
      // accurate for any viewport.
      setCentralGigs([...gigs]);
      if (!gig) return; // bulk/reset signal — never a notification
      // Suppress everything from an employer that has blacklisted this worker.
      if (gig.employerId && blockedEmployerIdsRef.current.has(gig.employerId)) return;
      // Regular (lama) scheduled jobs are SILENT: they simply appear in the
      // "Cari Kerja Terjadwal" feed via centralGigs above — no buzzer, no flash.
      if (!isInstantGig(gig)) return;
      // Instant broadcasts alert ONLY on a worker viewport with radar ON.
      if (modeRef.current === "pekerja") {
        if (radarOnRef.current) {
          seenPingJobIds.current.add(gig.id); // dedup vs the local JobPingModal path
          setAlarmGig(gig);
          fireNativeNotification();
        }
        // radar OFF → ignore the instant broadcast entirely (no alarm, pins hidden)
      } else {
        pendingBroadcastRef.current = gig;
      }
    });
    return unsubscribe;
  }, []);

  // ── Employer gig history: sync own jobs from server into customJobs ───────
  // On page reload customJobs starts empty. The employer's own gigs return via
  // TWO concurrent paths that can arrive in either order:
  //
  //   1. Hydration  — GET /api/gigs completes and calls notify(null).
  //   2. WS echo    — a gig_broadcast frame arrives before hydration finishes.
  //
  // Both paths flow through setCentralGigs → this effect.  In both cases the
  // server record carries the stored feeRate (reviveGig spreads the raw DB row
  // unchanged), so the fee-rate badge is correct regardless of which fires first.
  //
  // Guard: use `srv.feeRate ?? j.feeRate` (not a bare assignment) so that a WS
  // frame carrying a null feeRate (e.g. an in-flight echo for a legacy gig)
  // never clobbers a correctly-set local value that arrived from the other path.
  // The same guard applies to jobCategory.
  useEffect(() => {
    if (!currentUser || currentUser.role !== "perusahaan") return;
    const myServerGigs = centralGigs.filter((g) => g.employerId === currentUser.id);
    if (myServerGigs.length === 0) return;
    setCustomJobs((prev) => {
      const localIds = new Set(prev.map((j) => j.id));
      // Prefer the server value when present; keep the local value when the
      // server sends null — prevents a null WS echo from regressing a badge.
      // escrowStatus and escrowAmount are included so that a hydration pass
      // arriving after a stale WS echo always restores the DB-authoritative
      // lock state (fixes the disappearing lock badge on page reload).
      const updated = prev.map((j) => {
        const srv = myServerGigs.find((g) => g.id === j.id);
        if (!srv) return j;
        return {
          ...j,
          feeRate:      srv.feeRate      ?? j.feeRate,
          jobCategory:  srv.jobCategory  ?? j.jobCategory,
          escrowStatus: srv.escrowStatus ?? j.escrowStatus,
          escrowAmount: srv.escrowAmount ?? j.escrowAmount,
        };
      });
      // Append server gigs that have no local copy yet (e.g. after reload).
      const newFromServer = myServerGigs.filter((g) => !localIds.has(g.id));
      return [...updated, ...newFromServer];
    });
  }, [centralGigs, currentUser]);

  // ── Real-time QR attendance (Presensi) — EMPLOYER side ───────────
  // The worker device flips its own shift state locally on a successful scan
  // (see ClockInModal). This subscriber acts ONLY on the employer device that
  // posted the job: a "pulang" scan releases escrow and opens the rating modal.
  const attendanceHandlerRef = useRef<(e: AttendanceEvent) => void>(() => {});
  // Guards against duplicate WebSocket frames of the same scan double-releasing
  // escrow: each persisted attendance row has a unique id, so a repeat frame is
  // dropped before it can trigger a second payout.
  const processedAttendanceRef = useRef<Set<number>>(new Set());
  attendanceHandlerRef.current = (e: AttendanceEvent) => {
    if (!currentUser || currentUser.role !== "perusahaan") return;
    const gig = allJobs.find((j) => j.id === e.jobId);
    if (!gig || gig.employerId !== currentUser.id) return; // only my own jobs
    if (e.kind !== "pulang") return; // masuk is confirmed inside the QR modal
    if (processedAttendanceRef.current.has(e.id)) return; // duplicate frame
    const notif = notifications.find(
      (n) => n.jobId === e.jobId && n.status !== "selesai",
    );
    if (notif) {
      processedAttendanceRef.current.add(e.id);
      handleSplitPayment(notif.id);
      setPendingRating({
        raterType: "company",
        targetName: e.workerName,
        job: gig,
      });
    }
  };
  useEffect(() => {
    return subscribeAttendance((e) => attendanceHandlerRef.current(e));
  }, []);

  // ── Real-time applications — EMPLOYER side ───────────────────────
  // The server broadcasts `application_new` the instant a worker taps "Lamar".
  // This subscriber fires ONLY on the employer device that owns the gig.
  // Worker devices ignore full application events; they only react to the
  // `application_status` partial update (handled below in handleStatusChange).
  const applicationHandlerRef = useRef<(e: ApplicationEvent) => void>(() => {});
  const processedApplicationRef = useRef<Set<number>>(new Set());
  // Buffer for events that arrive before the auth cookie resolves (race window).
  const preAuthApplicationBuffer = useRef<ApplicationEvent[]>([]);
  applicationHandlerRef.current = (e: ApplicationEvent) => {
    if (!currentUser) {
      // Auth hasn't resolved yet — park the event and replay it once it does.
      preAuthApplicationBuffer.current.push(e);
      return;
    }

    if (currentUser.role === "perusahaan") {
      // ── Employer side: new application arrived (application_new) ──────
      // Partial status events have no workerName — skip them on the employer.
      if (!e.workerName) return;
      // Trust the server's scoping: the server resolves employerId from the DB
      // before inserting and before broadcasting, so any application_new event
      // that reaches this client with a workerName is already for this employer.
      // We do NOT re-check gig.employerId here because allJobs may not yet be
      // hydrated when a fast WS event arrives right after page load.
      if (processedApplicationRef.current.has(e.id)) return; // duplicate WS frame
      processedApplicationRef.current.add(e.id);
      const gig = allJobs.find((j) => j.id === e.jobId);
      const notif: ApplicationNotification = {
        id: nextNotifId++,
        serverId: e.id,  // DB row id for server-side status persistence
        jobId: e.jobId,
        jobTitle: e.jobTitle || gig?.posisi || "",
        workerId: e.workerId,
        applicantName: e.workerName,
        applicantNikMasked: e.workerNikMasked,
        applicantNpwpMasked: e.workerNpwpMasked,
        hasNpwp: e.hasNpwp,
        bank: e.bank,
        rekening: e.rekening,
        timestamp: new Date(e.createdAt),
        status: e.status as ApplicationStatus,
      };
      setNotifications((p) => [notif, ...p]);
      setApplicantToast(notif);
    } else if (currentUser.role === "pekerja" && !e.workerName) {
      // ── Worker side: employer changed their application status ─────────
      // Partial application_status events carry id/status/jobId only. We match
      // on `serverId` (DB row id back-filled when postApplication succeeded).
      setNotifications((prev) =>
        prev.map((n) =>
          n.serverId === e.id
            ? { ...n, status: e.status as ApplicationStatus }
            : n,
        ),
      );
      // Employer just accepted — unlock clock-in and start the 15-min grace timer.
      // We match on jobId (present in the partial event) against the worker's
      // activeJob so we never unlock for a different job they also applied for.
      if (e.status === "diterima" && activeJob && e.jobId === activeJob.id) {
        setJobStatus("accepted");
        setGraceJob(activeJob);
        setGraceDeadline(Date.now() + CLOCKIN_GRACE_MS);
      }
    }
  };
  useEffect(() => {
    return subscribeApplication((e) => applicationHandlerRef.current(e));
  }, []);

  // Replay any application events that arrived before auth resolved.
  useEffect(() => {
    if (!currentUser) return;
    const buffered = preAuthApplicationBuffer.current.splice(0);
    buffered.forEach((e) => applicationHandlerRef.current(e));
  }, [currentUser]);

  // ── Employer: hydrate existing applications on login/refresh ─────
  // Fetches all applications from the server for the logged-in employer so the
  // notification panel is populated even after a page reload (not just via WS).
  useEffect(() => {
    if (!currentUser || currentUser.role !== "perusahaan") return;
    let cancelled = false;
    fetch("/api/applications")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ApplicationEvent[]) => {
        if (cancelled || !rows.length) return;
        // Mark all hydrated IDs as seen so duplicate WS frames are dropped.
        rows.forEach((e) => processedApplicationRef.current.add(e.id));
        setNotifications((prev) => {
          const seenServerIds = new Set(
            prev.map((x) => x.serverId).filter((x): x is number => x !== undefined),
          );
          const toAdd: ApplicationNotification[] = rows
            .filter((e) => !seenServerIds.has(e.id))
            .map((e) => ({
              id: nextNotifId++,
              serverId: e.id,
              jobId: e.jobId,
              jobTitle: e.jobTitle,
              workerId: e.workerId,
              applicantName: e.workerName,
              applicantNikMasked: e.workerNikMasked,
              applicantNpwpMasked: e.workerNpwpMasked,
              hasNpwp: e.hasNpwp,
              bank: e.bank,
              rekening: e.rekening,
              timestamp: new Date(e.createdAt),
              status: e.status as ApplicationStatus,
            }));
          return toAdd.length ? [...prev, ...toAdd] : prev;
        });
      })
      .catch(() => {/* offline / not yet ready */});
    return () => { cancelled = true; };
  }, [currentUser]);

  // ── Worker: fetch which employers have blacklisted me ────────────
  useEffect(() => {
    if (!currentUser || currentUser.role !== "pekerja") {
      const empty = new Set<string>();
      setBlockedEmployerIds(empty);
      blockedEmployerIdsRef.current = empty;
      return;
    }
    const workerName = workerProfile?.namaLengkap || currentUser.name;
    let cancelled = false;
    fetchEmployerIdsBlockingWorker(workerName).then((ids) => {
      if (cancelled) return;
      setBlockedEmployerIds(ids);
      blockedEmployerIdsRef.current = ids;
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser, workerProfile]);

  // App init: request OS notification permission, and unlock the shared audio
  // context on the first user gesture so later chimes (incl. the role-switch
  // replay) are never blocked by the browser's autoplay policy.
  useEffect(() => {
    requestNotifPermission();
    const unlock = () => unlockAudio();
    const opts: AddEventListenerOptions = { once: true, passive: true };
    window.addEventListener("pointerdown", unlock, opts);
    window.addEventListener("keydown", unlock, opts);
    window.addEventListener("touchstart", unlock, opts);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  // Keep modeRef current AND replay any pending broadcast when entering worker view.
  // Runs for every role transition (login-as-worker or a future in-app toggle),
  // so the pending toast + pulsing radar pins surface AND the sound/native alert
  // fire again the microsecond the viewport becomes "pekerja".
  useEffect(() => {
    modeRef.current = mode;
    if (mode === "pekerja" && pendingBroadcastRef.current) {
      const pend = pendingBroadcastRef.current;
      pendingBroadcastRef.current = null;
      if (radarOnRef.current) {
        seenPingJobIds.current.add(pend.id);
        setAlarmGig(pend);
        fireNativeNotification();
      }
    }
  }, [mode]);

  // Keep the radar ref in sync so the (once-registered) subscriber always reads
  // the current on/off state.
  useEffect(() => {
    radarOnRef.current = radarOn;
  }, [radarOn]);

  // Clear any pending radar-status toast timer on unmount.
  useEffect(() => () => {
    if (radarToastTimer.current) clearTimeout(radarToastTimer.current);
  }, []);
  const [activePing, setActivePing] = useState<CustomJob | null>(null);
  const seenNotifIds = useRef<Set<number>>(new Set());
  const seenPingJobIds = useRef<Set<number>>(new Set());

  // ── Geolocation ─────────────────────────────────────────────────
  const [userLocation, setUserLocation] = useState(JAKARTA_CENTER);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);

  useEffect(() => {
    if (mode !== "pekerja" || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        setUserLocation({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocationAccuracy(Math.round(p.coords.accuracy));
      },
      () => setUserLocation(JAKARTA_CENTER),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [mode]);

  // ── Auth complete ───────────────────────────────────────────────
  const handleAuthComplete = useCallback((user: AuthUser) => {
    setCurrentUser(user);
    setMode(user.role);
    setActiveTab("home");
    // Role-specific initial view
    if (user.role === "pekerja") {
      setWorkerView("map");   // workers land on radar map
    } else {
      setCompanyView("jobs");  // companies land on job management panel
    }
    // The WS was opened at app-mount before the session cookie existed, so the
    // server couldn't register this socket in userClients. Force a reconnect now
    // so the new connection carries the cookie and gets into userClients — this
    // is required for scoped chat delivery (sendToUser) to work.
    reconnectWs();
  }, []);

  const handleLogout = useCallback(() => {
    void logoutRequest();
    setCurrentUser(null);
    setActiveTab("home");
    setMode("perusahaan");
    setCustomJobs([]);
    resetServer();
    setCentralGigs([]);
    setAlarmGig(null);
    setRadarOn(true);
    radarOnRef.current = true;
    setRadarStatusToast(null);
    pendingBroadcastRef.current = null;
    setNotifications([]);
    setRatings([]);
    setCompletedNotifs([]);
    setTotalEarned(0);
    setWorkerProfile(null);
    setActiveJob(null);
    setJobStatus(null);
    setGraceDeadline(null);
    setGraceJob(null);
    setDisputeDeadline(null);
    setDisputeJob(null);
    setContractClosed(false);
    setStandbyReroute(null);
    setReputationPoints(100);
    setWalletBalance(0);
    setWalletTransactions([]);
    setPlatformBalance(0);
    setEscrowEvents([]);
  }, []);

  // ── Restore a persisted session on load ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((user) => {
        if (!cancelled && user) handleAuthComplete(user);
      })
      .finally(() => {
        if (!cancelled) setAuthChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [handleAuthComplete]);

  // ── Escrow handlers ─────────────────────────────────────────────
  const handleSplitPayment = useCallback((notifId: number) => {
    const notif = notifications.find(n => n.id === notifId);
    if (!notif || notif.status === "selesai") return;
    const job = customJobs.find(j => j.id === notif.jobId);
    if (job) warnIfFeeRateMissing(job, "handleSplitPayment");
    const gross = job?.escrowAmount ?? calcTotal(job?.nominal ?? 0, job?.pembayaran ?? "per_shift");
    const jobFeeRate = job?.feeRate ?? DEFAULT_FEE_RATE;
    const { platformCut, workerNet } = calcSplit(gross, jobFeeRate);

    setCustomJobs(prev => prev.map(j =>
      j.id === notif.jobId ? { ...j, escrowStatus: "released" as const } : j
    ));
    setWalletBalance(prev => prev + workerNet);
    setWalletTransactions(prev => [...prev, {
      id: Date.now(),
      type: "credit" as const,
      amount: workerNet,
      label: "Upah penuh — pekerjaan selesai",
      jobTitle: notif.jobTitle,
      timestamp: new Date(),
      note: `Upah Anda dicairkan 100% utuh tanpa potongan. Biaya platform 15% (Rp ${platformCut.toLocaleString("id-ID")}) ditanggung penuh oleh perusahaan. Segala kewajiban perpajakan menjadi tanggung jawab mandiri masing-masing pihak sesuai hukum yang berlaku.`,
    }]);
    setPlatformBalance(prev => prev + platformCut);
    setTotalEarned(prev => prev + workerNet);
    setNotifications(prev => prev.map(n =>
      n.id === notifId ? { ...n, status: "selesai" as ApplicationStatus } : n
    ));
    setEscrowEvents(prev => [...prev, {
      id: Date.now(),
      jobId: notif.jobId,
      jobTitle: notif.jobTitle,
      fromStatus: "locked",
      toStatus: "released",
      actor: "company",
      amount: workerNet,
      timestamp: new Date(),
      note: `Pekerja: ${notif.applicantName}. Upah dicairkan 100% utuh; biaya platform 15% ditanggung perusahaan. Dana ditransfer ke e-wallet pekerja.`,
    }]);
  }, [notifications, customJobs]);

  const handleNotifDispute = useCallback((notifId: number) => {
    const notif = notifications.find(n => n.id === notifId);
    if (!notif) return;
    if (disputeJob && notif.jobId === disputeJob.id) { setDisputeDeadline(null); setDisputeJob(null); }
    setCustomJobs(prev => prev.map(j =>
      j.id === notif.jobId ? { ...j, escrowStatus: "disputed" as const } : j
    ));
    setEscrowEvents(prev => [...prev, {
      id: Date.now(),
      jobId: notif.jobId,
      jobTitle: notif.jobTitle,
      fromStatus: "locked",
      toStatus: "disputed",
      actor: "company",
      timestamp: new Date(),
      note: `Perusahaan mengajukan sengketa. Dana dibekukan otomatis oleh sistem Rekhastha.`,
    }]);
  }, [notifications, disputeJob]);

  const handleCancelJob = useCallback((jobId: number, deductFee: boolean) => {
    setCustomJobs(prev => prev.map(j =>
      j.id === jobId ? { ...j, escrowStatus: "refunded" as const } : j
    ));
    if (deductFee) {
      setWalletBalance(prev => prev + 20_000);
      setWalletTransactions(prev => [{
        id: Date.now(), type: "credit" as const,
        amount: 20_000, label: "Kompensasi Pembatalan Kontrak (<1 Jam)",
        jobTitle: customJobs.find(j => j.id === jobId)?.posisi ?? "",
        timestamp: new Date(),
        note: "Dibayarkan oleh Pemberi Kerja sesuai aturan Rekhastha",
      }, ...prev]);
    }
    setEscrowEvents(prev => [{
      id: Date.now(), jobId,
      jobTitle: customJobs.find(j => j.id === jobId)?.posisi ?? "",
      fromStatus: "locked", toStatus: "refunded",
      actor: "company", timestamp: new Date(),
      note: deductFee ? "Dibatalkan dalam 1 jam — kompensasi Rp20.000 dibayarkan ke pekerja" : "Dibatalkan — escrow dikembalikan penuh",
    }, ...prev]);
  }, [customJobs]);

  const handleLockEscrow = useCallback((jobId: number, escrowAmount: number) => {
    const job = customJobs.find(j => j.id === jobId);
    // Re-geofence within the strict 5km radius when a scheduled job goes live.
    const coords = randomGeofenceCoords(5);
    setCustomJobs(prev => prev.map(j =>
      j.id === jobId ? { ...j, escrowStatus: "locked" as const, escrowAmount, ...coords } : j
    ));
    if (job) {
      // Locking a scheduled job also broadcasts it live to the worker radar.
      triggerGlobalEscrowBroadcast({ ...job, ...coords, escrowStatus: "locked", escrowAmount, broadcastActive: true });
      setEscrowEvents(prev => [...prev, {
        id: Date.now(), jobId,
        jobTitle: job.posisi,
        fromStatus: "pending" as const,
        toStatus: "locked" as const,
        actor: "company" as const,
        amount: escrowAmount,
        timestamp: new Date(),
        note: `Dana dikunci setelah seleksi kandidat (Posting Reguler — biaya platform ${Math.round((job.feeRate ?? DEFAULT_FEE_RATE) * 100)}% (${job.jobCategory ?? "terampil"})).`,
      }]);
    }
  }, [customJobs]);

  const handleJobDispute = useCallback((jobId: number) => {
    const job = customJobs.find(j => j.id === jobId);
    if (disputeJob && jobId === disputeJob.id) { setDisputeDeadline(null); setDisputeJob(null); }
    setCustomJobs(prev => prev.map(j =>
      j.id === jobId ? { ...j, escrowStatus: "disputed" as const } : j
    ));
    if (job) {
      setEscrowEvents(prev => [...prev, {
        id: Date.now(),
        jobId,
        jobTitle: job.posisi,
        fromStatus: "locked",
        toStatus: "disputed",
        actor: "company",
        timestamp: new Date(),
        note: `Perusahaan mengajukan sengketa dari panel profil. Dana dibekukan otomatis.`,
      }]);
    }
  }, [customJobs, disputeJob]);

  const handleWorkerDispute = useCallback(() => {
    if (!activeJob) return;
    setDisputeDeadline(null);
    setDisputeJob(null);
    setCustomJobs(prev => prev.map(j =>
      j.id === activeJob.id ? { ...j, escrowStatus: "disputed" as const } : j
    ));
    setActiveJob(prev => prev ? { ...prev, escrowStatus: "disputed" } : prev);
    setEscrowEvents(prev => [...prev, {
      id: Date.now(),
      jobId: activeJob.id,
      jobTitle: activeJob.posisi,
      fromStatus: "locked",
      toStatus: "disputed",
      actor: "worker",
      timestamp: new Date(),
      note: `Pekerja mengajukan sengketa saat sedang Clock-In. Dana dibekukan otomatis oleh sistem.`,
    }]);
  }, [activeJob]);

  const handleAdminResolve = useCallback((jobId: number, winner: "worker" | "company") => {
    const job = customJobs.find(j => j.id === jobId);
    if (!job || !job.escrowAmount) return;
    if (winner === "worker") {
      warnIfFeeRateMissing(job, "handleAdminResolve");
      const jobFeeRate = job.feeRate ?? DEFAULT_FEE_RATE;
      const { platformCut, workerNet } = calcSplit(job.escrowAmount, jobFeeRate);
      setWalletBalance(prev => prev + workerNet);
      setWalletTransactions(prev => [...prev, {
        id: Date.now(),
        type: "credit" as const,
        amount: workerNet,
        label: "Keputusan Admin — Pekerja Menang",
        jobTitle: job.posisi,
        timestamp: new Date(),
        note: `Upah dicairkan 100% utuh. Biaya platform 15% (Rp ${platformCut.toLocaleString("id-ID")}) ditanggung perusahaan.`,
      }]);
      setPlatformBalance(prev => prev + platformCut);
    } else {
      const adminFee = Math.round(job.escrowAmount * ADMIN_DISPUTE_FEE);
      setPlatformBalance(prev => prev + adminFee);
    }
    const finalStatus = winner === "worker" ? "released" as const : "refunded" as const;
    setCustomJobs(prev => prev.map(j =>
      j.id === jobId ? { ...j, escrowStatus: finalStatus } : j
    ));
    setEscrowEvents(prev => [...prev, {
      id: Date.now(),
      jobId,
      jobTitle: job.posisi,
      fromStatus: "disputed",
      toStatus: finalStatus,
      actor: "admin",
      amount: winner === "worker"
        ? calcSplit(job.escrowAmount!, job.feeRate ?? DEFAULT_FEE_RATE).workerNet
        : Math.round((job.escrowAmount ?? 0) * (1 - ADMIN_DISPUTE_FEE)),
      timestamp: new Date(),
      note: winner === "worker"
        ? `Admin memutuskan pekerja menang. Dana dilepas ke e-wallet pekerja setelah potongan.`
        : `Admin memutuskan perusahaan menang. Escrow direfund (dipotong biaya admin 5%).`,
    }]);
  }, [customJobs, workerProfile]);

  const handleWithdraw = useCallback((method: string, account: string) => {
    if (walletBalance <= 0) return;
    const masked = account.length > 4 ? `••••${account.slice(-4)}` : account;
    setWalletTransactions(prev => [...prev, {
      id: Date.now(),
      type: "debit" as const,
      amount: walletBalance,
      label: `Pencairan via ${method}`,
      jobTitle: method,
      timestamp: new Date(),
      note: `Nomor tujuan: ${masked} · Net 100% bebas potongan`,
    }]);
    setWalletBalance(0);
  }, [walletBalance]);

  // ── Demo inject ─────────────────────────────────────────────────
  const handleDemoInject = useCallback(() => {
    if (!currentUser) return;
    if (currentUser.role === "pekerja") {
      const demoProfile = makeDemoWorkerProfile();
      setWorkerProfile(demoProfile);
      setReputationPoints(87);
      setTotalEarned(4_200_000);
      // Inject demo wallet data
      const demoTx1: WalletTransaction = {
        id: 1, type: "credit", amount: 2_835_000,
        label: "Upah penuh — pekerjaan selesai", jobTitle: "Event Staff Runner",
        timestamp: new Date(Date.now() - 2 * 86_400_000),
        note: "Upah dicairkan 100% utuh tanpa potongan; biaya platform 15% ditanggung perusahaan.",
      };
      const demoTx2: WalletTransaction = {
        id: 2, type: "credit", amount: 936_000,
        label: "Upah penuh — pekerjaan selesai", jobTitle: "Barista Part-Time",
        timestamp: new Date(Date.now() - 5 * 86_400_000),
        note: "Upah dicairkan 100% utuh tanpa potongan; biaya platform 15% ditanggung perusahaan.",
      };
      setWalletBalance(3_771_000);
      setWalletTransactions([demoTx2, demoTx1]);
      const fakeJob: CustomJob = {
        id: nextJobId++, type: "custom_job",
        posisi: "Barista Event Besar", deskripsi: "Demo job",
        pembayaran: "per_shift", nominal: 350_000, dresscode: "Hitam formal", kuota: 1,
        namaPerusahaan: "PT Kopi Kenangan", tipeAkun: "perusahaan",
        ...randomJakartaCoords(), postedAt: new Date(),
      };
      const demoCompleted: ApplicationNotification[] = Array.from({ length: 5 }, (_, i) => ({
        id: nextNotifId++, jobId: fakeJob.id, jobTitle: fakeJob.posisi,
        workerId: "",
        applicantName: maskName(demoProfile.namaLengkap),
        applicantNikMasked: maskNik(demoProfile.nik),
        applicantNpwpMasked: maskNpwp(demoProfile.npwp),
        hasNpwp: true,
        bank: demoProfile.namaBank, rekening: maskRekening(demoProfile.nomorRekening),
        timestamp: new Date(Date.now() - i * 86_400_000),
        status: "diterima" as ApplicationStatus,
      }));
      setCompletedNotifs(demoCompleted);
      // Inject matching escrow audit trail for wallet transactions
      setEscrowEvents([
        {
          id: Date.now() + 100,
          jobId: fakeJob.id,
          jobTitle: "Event Staff Runner",
          fromStatus: "locked",
          toStatus: "released",
          actor: "company",
          amount: 2_835_000,
          timestamp: new Date(Date.now() - 2 * 86_400_000),
          note: `Perusahaan menyetujui pembayaran. Upah dicairkan 100% utuh; biaya platform 15% ditanggung perusahaan.`,
        },
        {
          id: Date.now() + 101,
          jobId: fakeJob.id,
          jobTitle: "Barista Part-Time",
          fromStatus: "locked",
          toStatus: "released",
          actor: "company",
          amount: 936_000,
          timestamp: new Date(Date.now() - 5 * 86_400_000),
          note: `Perusahaan menyetujui pembayaran. Upah dicairkan 100% utuh; biaya platform 15% ditanggung perusahaan.`,
        },
      ]);
      setRatings([
        { stars: 5, comment: "Pekerja sangat disiplin!", raterType: "company", targetName: "PT Kopi Kenangan" },
        { stars: 4, comment: "Bagus, datang tepat waktu.", raterType: "company", targetName: "EO Spekta" },
        { stars: 5, comment: "Profesional sekali.", raterType: "company", targetName: "Resto Solo" },
      ]);
    } else {
      const demoJobs = makeDemoJobs();
      setCustomJobs(demoJobs);
      const demoNotifs = makeDemoNotifs(demoJobs);
      setNotifications(demoNotifs);
      setRatings(makeDemoRatings());
      // Inject demo escrow audit log for company
      const now = Date.now();
      const demoEvents: EscrowEvent[] = [
        ...demoJobs.map((j, i) => ({
          id: now + i,
          jobId: j.id,
          jobTitle: j.posisi,
          toStatus: "locked" as const,
          actor: "system" as const,
          amount: j.escrowAmount,
          timestamp: new Date(now - (5 - i) * 3_600_000),
          note: `Dana dikunci otomatis oleh sistem. Lowongan aktif di peta.`,
        })),
        // One disputed event for drama — job index 3 (Admin & Kasir)
        {
          id: now + 10,
          jobId: demoJobs[3].id,
          jobTitle: demoJobs[3].posisi,
          fromStatus: "locked",
          toStatus: "disputed",
          actor: "worker",
          timestamp: new Date(now - 1_800_000),
          note: `Pekerja mengajukan sengketa: upah tidak sesuai kesepakatan. Dana dibekukan.`,
        },
      ];
      setEscrowEvents(demoEvents);
    }
  }, [currentUser]);

  // ── Search ──────────────────────────────────────────────────────
  const suggestedTags = ["Barista", "Waiter / Waitress", "Event Crew / Runner", "Latte Art", "POS/Kasir", "Crowd Control"];
  const visibleTags = searchQuery
    ? suggestedTags.filter((t) => t.toLowerCase().includes(searchQuery.toLowerCase()) && !activeTags.includes(t))
    : suggestedTags.filter((t) => !activeTags.includes(t));

  const addTag = useCallback((tag: string) => { setActiveTags((p) => p.includes(tag) ? p : [...p, tag]); setSearchQuery(""); }, []);
  const removeTag = useCallback((tag: string) => setActiveTags((p) => p.filter((t) => t !== tag)), []);

  // Unified, de-duplicated pool of every gig this device knows about — local
  // postings (customJobs) plus everything from the live server (centralGigs).
  const allJobs = useMemo(() => {
    const seen = new Set<CustomJob["id"]>();
    const out: CustomJob[] = [];
    for (const j of [...centralGigs, ...customJobs]) {
      if (seen.has(j.id)) continue;
      seen.add(j.id);
      // Worker viewport: hide every gig from an employer that blacklisted me.
      if (j.employerId && blockedEmployerIds.has(j.employerId)) continue;
      out.push(j);
    }
    return out;
  }, [centralGigs, customJobs, blockedEmployerIds]);

  // Instant broadcasts → pulsing GREEN radar pins. Regular scheduled jobs → the
  // "Cari Kerja Terjadwal" feed. Purple pins = anything non-instant on the map.
  const instantGigs = useMemo(() => allJobs.filter(isInstantGig), [allJobs]);
  const scheduledGigs = useMemo(
    () => allJobs.filter((j) => j.hiringMode === "lama"),
    [allJobs],
  );
  const mapPurpleJobs = useMemo(() => allJobs.filter((j) => !isInstantGig(j)), [allJobs]);

  // Radar on/off toggle: flips the state, silences any live alarm when turned
  // off, and surfaces the required transient status toast.
  const handleToggleRadar = useCallback((next: boolean) => {
    setRadarOn(next);
    radarOnRef.current = next;
    if (!next) setAlarmGig(null);
    if (radarToastTimer.current) clearTimeout(radarToastTimer.current);
    setRadarStatusToast(
      next
        ? "🟢 Radar Aktif: Anda siap menerima lowongan instan terdekat!"
        : "⚪ Radar Mati: Anda tidak akan menerima panggilan kerja instan harian sementara waktu",
    );
    radarToastTimer.current = setTimeout(() => setRadarStatusToast(null), 4000);
  }, []);

  const filteredWorkers = useMemo(() => {
    if (!activeTags.length && !searchQuery.trim()) return workers;
    return workers.filter((w) => {
      const q = searchQuery.toLowerCase().trim();
      const matchQ = !q || w.name.toLowerCase().includes(q) || w.category.toLowerCase().includes(q) || w.skills.some((s) => s.toLowerCase().includes(q));
      const matchT = !activeTags.length || activeTags.some((tag) => w.category === tag || w.skills.some((s) => s.toLowerCase() === tag.toLowerCase()));
      return matchQ && matchT;
    });
  }, [searchQuery, activeTags]);

  // ── Employer toast: detect new applicants ───────────────────────
  useEffect(() => {
    if (mode !== "perusahaan") return;
    const newest = notifications.find(n => !seenNotifIds.current.has(n.id));
    if (newest && !applicantToast) {
      seenNotifIds.current.add(newest.id);
      setApplicantToast(newest);
    }
  }, [notifications, mode, applicantToast]);

  // ── Worker ping: detect new Cepat broadcast jobs ─────────────────
  useEffect(() => {
    if (mode !== "pekerja" || activePing) return;
    const newCepat = customJobs.find(
      j => j.hiringMode === "cepat" && j.broadcastActive && !seenPingJobIds.current.has(j.id)
    );
    if (newCepat) {
      seenPingJobIds.current.add(newCepat.id);
      setActivePing(newCepat);
    }
  }, [customJobs, mode, activePing]);

  // ── Job posting ─────────────────────────────────────────────────
  const [workerMapFlyTarget, setWorkerMapFlyTarget] = useState<[number, number] | null>(null);

  const handleJobPosted = useCallback((data: Omit<CustomJob, "id" | "type" | "lat" | "lng" | "postedAt"> & { lat?: number; lng?: number }) => {
    // Instant broadcasts (Butuh Cepat / escrow locked) are geofenced within 5 km of Jakarta centre.
    const isBroadcast = data.hiringMode === "cepat" || data.broadcastActive === true || data.escrowStatus === "locked";
    const coords = (data.lat && data.lng)
      ? { lat: data.lat, lng: data.lng }
      : isBroadcast ? randomGeofenceCoords(5) : randomJakartaCoords();
    const newId = nextJobId++;
    const now = new Date();
    const newJob: CustomJob = {
      id: newId, type: "custom_job", ...data, ...coords, postedAt: now,
      // Stamp the poster's identity so a blacklisted worker can be filtered out
      // of this employer's feed on the worker's device.
      employerId: data.employerId ?? currentUser?.id,
      employerName: data.employerName ?? currentUser?.namaPerusahaan ?? currentUser?.name,
    };
    setCustomJobs(p => [...p, newJob]);
    // Publish EVERY posting to the live server so it fans out to worker devices:
    // instant (cepat) jobs raise the persistent radar alarm on receivers, while
    // regular (lama) jobs push silently into the "Cari Kerja Terjadwal" feed.
    triggerGlobalEscrowBroadcast(newJob);
    if (data.escrowStatus === "locked" && data.escrowAmount) {
      setEscrowEvents(prev => [...prev, {
        id: Date.now(),
        jobId: newId,
        jobTitle: data.posisi,
        toStatus: "locked",
        actor: "system",
        amount: data.escrowAmount,
        timestamp: now,
        note: `Dana dikunci otomatis oleh sistem. Lowongan aktif di peta setelah verifikasi.`,
      }]);
    }
  }, [currentUser]);

  // ── Apply ───────────────────────────────────────────────────────
  const handleApply = useCallback((job: CustomJob, profile: WorkerProfile) => {
    const workerName   = maskName(profile.namaLengkap);
    const workerNik    = maskNik(profile.nik);
    const workerNpwp   = profile.belumPunyaNpwp ? "Belum ada NPWP" : maskNpwp(profile.npwp);
    const hasNpwp      = !profile.belumPunyaNpwp;
    const bank         = profile.namaBank || "—";
    const rekening     = maskRekening(profile.nomorRekening);

    const notif: ApplicationNotification = {
      id: nextNotifId++, jobId: job.id, jobTitle: job.posisi,
      workerId: currentUser?.id ?? "",
      applicantName: workerName,
      applicantNikMasked: workerNik,
      applicantNpwpMasked: workerNpwp,
      hasNpwp,
      bank,
      rekening: rekening,
      timestamp: new Date(), status: "baru",
    };
    setNotifications((p) => [notif, ...p]);
    // Persist to server — employer receives it via WebSocket; on success, back-fill
    // the server-assigned `serverId` so handleStatusChange can call PATCH.
    const localId = notif.id;
    postApplication({
      jobId: job.id,
      jobTitle: job.posisi,
      workerName,
      workerNikMasked: workerNik,
      workerNpwpMasked: workerNpwp,
      hasNpwp,
      bank,
      rekening,
    }).then((result) => {
      if (result) {
        setNotifications((prev) =>
          prev.map((n) => n.id === localId ? { ...n, serverId: result.id } : n),
        );
      }
    }).catch(() => {/* best effort */});
    setActiveJob(job);
    // Status starts at "applied" — clock-in and the 15-min grace timer only
    // activate once the employer explicitly clicks "Terima" (status → "diterima"),
    // which arrives here via the WS `application_status` event handler below.
    setJobStatus("applied");
    setContractClosed(false);
    setDisputeDeadline(null);
    setDisputeJob(null);
    setStandbyReroute(null);
  }, []);

  const handleStatusChange = useCallback((id: number, status: ApplicationStatus) => {
    const n = notifications.find((x) => x.id === id);
    // Persist status to server when the notification has a server-assigned id.
    if (n?.serverId) {
      void fetch(`/api/applications/${n.serverId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    }
    setNotifications((p) => p.map((x) => x.id === id ? { ...x, status } : x));
    if (status === "diterima") {
      if (n) {
        const job = customJobs.find((j) => j.id === n.jobId);
        if (job) setPendingRating({ raterType: "company", targetName: n.applicantName, job });
      }
    }
  }, [notifications, customJobs]);

  // ── Chat ────────────────────────────────────────────────────────
  const handleOpenChatFromJob = useCallback((job: CustomJob) => {
    setChatContext({ jobTitle: job.posisi, nominal: job.nominal, companyName: job.namaPerusahaan || "Perusahaan", workerName: workerProfile?.namaLengkap || "Pekerja", currentRole: "worker", hiringMode: job.hiringMode, jobId: job.id, workerId: currentUser?.id ?? "", feeRate: job.feeRate });
  }, [workerProfile, currentUser]);

  const handleOpenChatFromNotif = useCallback((notif: ApplicationNotification) => {
    const job = customJobs.find((j) => j.id === notif.jobId);
    if (!job) return;
    setChatContext({ jobTitle: notif.jobTitle, nominal: job.nominal, companyName: job.namaPerusahaan || "Perusahaan Anda", workerName: notif.applicantName, currentRole: "company", hiringMode: job.hiringMode, jobId: job.id, workerId: notif.workerId, feeRate: job.feeRate });
  }, [customJobs]);

  const handleNominalUpdate = useCallback((newNominal: number) => {
    if (!chatContext?.jobId) return;
    const jid = chatContext.jobId;
    setCustomJobs(prev => prev.map(j => j.id === jid
      ? { ...j, nominal: newNominal, escrowAmount: calcEmployerDeposit(calcEscrowAmount(newNominal, j.pembayaran, j.jumlahHari ?? 1, j.kuota), j.feeRate ?? DEFAULT_FEE_RATE) }
      : j
    ));
    setChatContext(prev => prev ? { ...prev, nominal: newNominal } : null);
  }, [chatContext]);

  const handleReportSuspect = useCallback((jobId: number) => {
    setCustomJobs((p) => p.map((j) => j.id === jobId ? { ...j, flaggedSuspect: true } : j));
  }, []);

  // ── Worker discipline: 15-min late Clock-In penalty ─────────────
  const handleLateClockInPenalty = useCallback(() => {
    if (!graceJob) return;
    setWalletBalance(prev => prev - LATE_CLOCKIN_PENALTY);
    setWalletTransactions(prev => [{
      id: Date.now(), type: "debit" as const,
      amount: LATE_CLOCKIN_PENALTY,
      label: "Denda Gagal Clock-In Tepat Waktu (15 Menit)",
      jobTitle: graceJob.posisi,
      timestamp: new Date(),
      note: "Dikreditkan ke Pemberi Kerja sebagai kompensasi kehilangan waktu (lost-time).",
    }, ...prev]);
    setReputationPoints(p => Math.max(0, p - 15));
    setEscrowEvents(prev => [...prev, {
      id: Date.now(), jobId: graceJob.id, jobTitle: graceJob.posisi,
      toStatus: "locked" as const, actor: "system" as const,
      amount: LATE_CLOCKIN_PENALTY, timestamp: new Date(),
      note: "Pekerja gagal Clock-In dalam 15 menit sejak shift dimulai. Denda Rp15.000 dipotong otomatis & dikreditkan ke Pemberi Kerja.",
    }]);
  }, [graceJob]);

  // ── Butuh Cepat: re-route to next standby worker on 15-min no-show ─
  // Only fires for Mode Butuh Cepat (cepat) jobs; scheduled (lama) jobs only incur the penalty.
  const handleStandbyReroute = useCallback(() => {
    if (!graceJob || graceJob.hiringMode !== "cepat") return;
    const standbyName = STANDBY_WORKERS[Math.floor(Math.random() * STANDBY_WORKERS.length)] ?? "Ahmad";
    setStandbyReroute({ workerName: standbyName, jobTitle: graceJob.posisi });
    setEscrowEvents(prev => [...prev, {
      id: Date.now() + 1, jobId: graceJob.id, jobTitle: graceJob.posisi,
      toStatus: "locked" as const, actor: "system" as const,
      timestamp: new Date(),
      note: `Mode Butuh Cepat: lowongan dialihkan otomatis ke pekerja standby berikutnya (${standbyName}). Dana escrow tetap terkunci untuk pekerja pengganti.`,
    }]);
    setNotifications(prev => [{
      id: nextNotifId++, jobId: graceJob.id, jobTitle: graceJob.posisi,
      workerId: "",
      applicantName: standbyName,
      applicantNikMasked: "3175••••••••0001",
      applicantNpwpMasked: "••••••0001",
      hasNpwp: true,
      bank: "BCA", rekening: "123••••789",
      timestamp: new Date(), status: "baru" as ApplicationStatus,
    }, ...prev]);
  }, [graceJob]);

  // ── Dispute window: auto-release escrow after 24h ───────────────
  // Uses the captured `disputeJob` snapshot (not `activeJob`) so it still fires
  // even if the worker closed the completed-job card before the window expired.
  const handleAutoRelease = useCallback(() => {
    const job = disputeJob;
    if (!job) return;
    // Guard: never auto-release a job that was already disputed or released.
    const live = customJobs.find(j => j.id === job.id);
    if (live && (live.escrowStatus === "disputed" || live.escrowStatus === "released")) return;
    warnIfFeeRateMissing(job, "handleAutoRelease");
    const gross = job.escrowAmount ?? calcTotal(job.nominal, job.pembayaran);
    const { platformCut, workerNet } = calcSplit(gross, job.feeRate ?? DEFAULT_FEE_RATE);
    setWalletBalance(prev => prev + workerNet);
    setWalletTransactions(prev => [{
      id: Date.now(), type: "credit" as const,
      amount: workerNet,
      label: "Escrow Cair Otomatis — Kontrak Ditutup (24 Jam)",
      jobTitle: job.posisi,
      timestamp: new Date(),
      note: `Jendela sengketa 24 jam berakhir tanpa keberatan. Upah dicairkan 100% utuh; biaya platform 15% (Rp ${platformCut.toLocaleString("id-ID")}) ditanggung perusahaan.`,
    }, ...prev]);
    setPlatformBalance(prev => prev + platformCut);
    setCustomJobs(prev => prev.map(j =>
      j.id === job.id ? { ...j, escrowStatus: "released" as const } : j
    ));
    setEscrowEvents(prev => [...prev, {
      id: Date.now(), jobId: job.id, jobTitle: job.posisi,
      fromStatus: "locked" as const, toStatus: "released" as const, actor: "system" as const,
      amount: workerNet, timestamp: new Date(),
      note: "Jendela validasi 24 jam berakhir tanpa sengketa. Escrow otomatis cair ke pekerja. Status: CLOSED & UNAPPEALABLE.",
    }]);
    setContractClosed(true);
  }, [disputeJob, customJobs, workerProfile]);

  // ── Countdown ticker (drives both engines) ──────────────────────
  useEffect(() => {
    if (graceDeadline == null && disputeDeadline == null) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [graceDeadline, disputeDeadline]);

  // ── Grace-timer expiry ──────────────────────────────────────────
  useEffect(() => {
    if (graceDeadline == null || jobStatus !== "accepted") return;
    if (nowTick >= graceDeadline) {
      handleLateClockInPenalty();
      handleStandbyReroute(); // no-ops unless the snapshot job is Mode Butuh Cepat
      setGraceDeadline(null);
      setGraceJob(null);
    }
  }, [nowTick, graceDeadline, jobStatus, handleLateClockInPenalty, handleStandbyReroute]);

  // ── Dispute-window expiry ───────────────────────────────────────
  useEffect(() => {
    if (disputeDeadline == null) return;
    if (nowTick >= disputeDeadline) {
      handleAutoRelease();
      setDisputeDeadline(null);
      setDisputeJob(null);
    }
  }, [nowTick, disputeDeadline, handleAutoRelease]);

  // ── Clock-in/out ────────────────────────────────────────────────
  const handleClockIn = useCallback(() => {
    setClockedInAt(new Date());
    setJobStatus("clocked_in");
    setGraceDeadline(null); // Clock-In succeeded within grace window
    setGraceJob(null);
  }, []);

  const handleClockOut = useCallback(() => {
    const now = new Date();
    setClockedOutAt(now);
    setJobStatus("completed");
    setGraceDeadline(null);
    setGraceJob(null);
    setContractClosed(false);
    setDisputeJob(activeJob); // snapshot job so auto-release survives closing the card
    setDisputeDeadline(now.getTime() + DISPUTE_WINDOW_MS); // start 24h employer validation window
    if (activeJob) {
      setTotalEarned((p) => p + calcTotal(activeJob.nominal, activeJob.pembayaran));
      setCompletedNotifs((p) => [...p, {
        id: nextNotifId++, jobId: activeJob.id, jobTitle: activeJob.posisi,
        workerId: currentUser?.id ?? "",
        applicantName: workerProfile?.namaLengkap ?? "Pekerja",
        applicantNikMasked: "", applicantNpwpMasked: "",
        hasNpwp: !(workerProfile?.belumPunyaNpwp ?? true),
        bank: workerProfile?.namaBank ?? "", rekening: workerProfile?.nomorRekening ?? "",
        timestamp: now, status: "diterima",
        nominal: activeJob.nominal,
        jumlahHari: activeJob.jumlahHari,
        hiringMode: activeJob.hiringMode,
      }]);
      setPendingRating({ raterType: "worker", targetName: activeJob.namaPerusahaan || "Perusahaan Pengiklan", job: activeJob });
    }
  }, [activeJob, workerProfile]);

  const handleWorkerCancelJob = useCallback(() => {
    setActiveJob(null); setJobStatus(null); setClockedInAt(null); setClockedOutAt(null);
    setGraceDeadline(null); setGraceJob(null); setDisputeDeadline(null); setDisputeJob(null); setContractClosed(false);
    setReputationPoints((p) => Math.max(0, p - 20));
  }, []);

  const handleRatingSubmit = useCallback((payload: RatingPayload) => {
    setRatings((p) => [...p, payload]);
    // Persist the rating so the admin control plane's negative-rating counts are real.
    void submitRating({
      targetName: payload.targetName,
      stars: payload.stars,
      comment: payload.comment,
      raterType: payload.raterType,
      jobId: pendingRating?.job.id ?? null,
    });
    // Employer opted to blacklist the worker from the rating modal → persist it.
    if (payload.blacklist && payload.raterType === "company" && currentUser) {
      void createBlacklist({
        employerId: currentUser.id,
        employerName: currentUser.namaPerusahaan || currentUser.name,
        workerName: payload.targetName,
        jobId: pendingRating?.job.id ?? null,
      });
    }
    setPendingRating(null);
  }, [currentUser, pendingRating]);

  const verified = workerProfile ? isVerified(workerProfile) : false;
  const workerPhone = workerProfile?.whatsapp || currentUser?.whatsapp || "";

  // ── Auth gate ───────────────────────────────────────────────────
  if (authChecking) {
    return (
      <div
        className="flex flex-col items-center justify-center h-[100dvh] w-full gap-4"
        style={{ background: "linear-gradient(160deg, #065F46 0%, #059669 55%, #10B981 100%)" }}
      >
        <RekhasthaLogo size={48} variant="light" showSubtitle wordmarkClassName="text-2xl" />
        <span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return <AuthPage onComplete={handleAuthComplete} />;
  }

  // ── Profile pages ───────────────────────────────────────────────
  const isProfileTab = activeTab === "profile";

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-gray-50 relative overflow-hidden">

      {/* ── JOB PING MODAL (worker ride-hailing style) ──── */}
      {activePing && (
        <JobPingModal
          job={activePing}
          userLat={userLocation.lat}
          userLng={userLocation.lng}
          onAccept={(job) => {
            if (workerProfile) {
              handleApply(job, workerProfile);
            }
            setActivePing(null);
          }}
          onDecline={() => setActivePing(null)}
        />
      )}

      {/* ── APPLICANT TOAST (employer incoming applicant) ─ */}
      {applicantToast && (
        <ApplicantToast
          notification={applicantToast}
          job={customJobs.find(j => j.id === applicantToast.jobId)}
          onAccept={() => handleStatusChange(applicantToast.id, "diterima")}
          onDecline={() => handleStatusChange(applicantToast.id, "ditolak")}
          onDismiss={() => setApplicantToast(null)}
        />
      )}

      {/* ── INSTANT-GIG PERSISTENT ALARM (radar ON only) ─ */}
      {alarmGig && (
        <InstantGigAlarm
          gig={alarmGig}
          onAccept={() => {
            setSelectedJob(alarmGig);
            setRadarOn(true);
            radarOnRef.current = true;
            setWorkerView("map");
            setAlarmGig(null);
          }}
          onSkip={() => setAlarmGig(null)}
        />
      )}

      {/* ── RADAR STATUS TOAST (On/Off feedback) ─ */}
      {radarStatusToast && (
        <div className="fixed top-3 left-3 right-3 z-[210] mx-auto max-w-md">
          <div className="rounded-2xl bg-gray-900 text-white text-xs font-semibold px-4 py-3 shadow-2xl border border-white/10 text-center leading-snug">
            {radarStatusToast}
          </div>
        </div>
      )}

      {/* ── LIVE GIG DETAILS (opens from toast while in employer view) ─ */}
      {mode === "perusahaan" && selectedJob && (
        <JobSheet job={selectedJob} onClose={() => setSelectedJob(null)} workerProfile={workerProfile} />
      )}

      {/* ── GLOBAL MODALS ───────────────────────────────── */}
      {showOnboarding && (
        <WorkerOnboarding onComplete={(p) => { setWorkerProfile(p); setShowOnboarding(false); }} onDismiss={() => setShowOnboarding(false)} />
      )}
      {showClockIn && activeJob && (
        <ClockInModal job={activeJob} userLat={userLocation.lat} userLng={userLocation.lng}
          locationAccuracy={locationAccuracy}
          isClockedIn={jobStatus === "clocked_in"} clockedInAt={clockedInAt}
          workerName={workerProfile?.namaLengkap || currentUser.name}
          onClockIn={handleClockIn} onClockOut={handleClockOut} onClose={() => setShowClockIn(false)} />
      )}
      {attendanceQrJob && (
        <AttendanceQrModal jobId={attendanceQrJob.id} jobTitle={attendanceQrJob.posisi}
          onClose={() => setAttendanceQrJob(null)} />
      )}
      {pendingRating && (
        <RatingModal raterType={pendingRating.raterType} targetName={pendingRating.targetName}
          jobTitle={pendingRating.job.posisi} onSubmit={handleRatingSubmit} onClose={() => setPendingRating(null)} />
      )}
      {showPaySlip && activeJob && workerProfile && (
        <PaySlipModal job={activeJob} workerProfile={workerProfile} clockedInAt={clockedInAt} clockedOutAt={clockedOutAt} onClose={() => setShowPaySlip(false)} />
      )}
      {showEarnings && workerProfile && (
        <EarningsDashboard workerProfile={workerProfile} reputationPoints={reputationPoints}
          completedJobs={completedNotifs} totalEarned={totalEarned}
          onDownloadSlip={() => { setShowEarnings(false); setShowPaySlip(true); }} onClose={() => setShowEarnings(false)} />
      )}
      {chatContext && (
        <ChatModal jobTitle={chatContext.jobTitle} nominal={chatContext.nominal}
          companyName={chatContext.companyName} workerName={chatContext.workerName}
          currentRole={chatContext.currentRole} hiringMode={chatContext.hiringMode}
          feeRate={chatContext.feeRate}
          jobId={chatContext.jobId} workerId={chatContext.workerId}
          onNominalUpdate={handleNominalUpdate}
          onClose={() => setChatContext(null)} />
      )}

      {/* ── CHAT TAB ─────────────────────────────────────── */}
      {activeTab === "chat" && (
        <div className="flex-1 overflow-y-auto bg-gray-50 flex flex-col">
          <div className="bg-white border-b border-gray-100 px-5 py-4 shrink-0">
            <h2 className="font-bold text-gray-900 text-base">Pesan & Chat</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {currentUser.role === "pekerja" ? "Chat dengan perusahaan yang menerima lamaran Anda" : "Chat dengan pelamar yang Anda terima"}
            </p>
          </div>

          {currentUser.role === "pekerja" ? (
            /* ── WORKER CHAT LIST ── */
            customJobs.length === 0 && !activeJob ? (
              <ChatEmptyState label="Belum ada percakapan aktif" sub="Lamar pekerjaan terlebih dahulu untuk mulai chat dengan perusahaan." />
            ) : (
              <div className="p-4 space-y-3">
                {/* Active job banner */}
                {activeJob && (() => {
                  const isAccepted = notifications.some(
                    n => n.jobId === activeJob.id && n.status === "diterima",
                  );
                  return (
                    <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
                          <Briefcase className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{activeJob.posisi}</p>
                          <p className="text-xs text-primary font-medium">{activeJob.namaPerusahaan || "Perusahaan"}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            {jobStatus === "clocked_in" ? "🟢 Sedang bekerja" : jobStatus === "completed" ? "✅ Selesai" : isAccepted ? "⏳ Menunggu Clock-In" : "⌛ Menunggu persetujuan perusahaan"}
                          </p>
                        </div>
                      </div>
                      {isAccepted ? (
                        <button
                          onClick={() => setChatContext({ jobTitle: activeJob.posisi, nominal: activeJob.nominal, companyName: activeJob.namaPerusahaan || "Perusahaan", workerName: workerProfile?.namaLengkap || currentUser.name, currentRole: "worker", hiringMode: activeJob.hiringMode, jobId: activeJob.id, workerId: currentUser?.id ?? "", feeRate: activeJob.feeRate })}
                          className="flex items-center gap-1.5 bg-primary text-white text-xs font-bold px-3 py-2 rounded-xl shrink-0">
                          <MessageSquare className="w-3.5 h-3.5" /> Chat
                        </button>
                      ) : (
                        <div className="flex items-center gap-1 text-[10px] text-gray-400 font-semibold shrink-0">
                          <Lock className="w-3 h-3" /> Menunggu
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* Other jobs from the list */}
                {customJobs.filter(j => j.id !== activeJob?.id).map((job) => {
                  const isAccepted = notifications.some(
                    n => n.jobId === job.id && n.status === "diterima",
                  );
                  return (
                    <div key={job.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center font-black text-sm text-white ${job.isAgency ? "bg-gradient-to-br from-blue-600 to-violet-600" : "bg-violet-600"}`}>
                          {job.isAgency ? "AG" : "+"}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{job.posisi}</p>
                          <p className="text-xs text-gray-500 truncate">{job.namaPerusahaan || "Perusahaan"}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">Rp {job.nominal.toLocaleString("id-ID")} / {paymentUnits[job.pembayaran]}</p>
                        </div>
                      </div>
                      {isAccepted ? (
                        <button
                          onClick={() => setChatContext({ jobTitle: job.posisi, nominal: job.nominal, companyName: job.namaPerusahaan || "Perusahaan", workerName: workerProfile?.namaLengkap || currentUser.name, currentRole: "worker", hiringMode: job.hiringMode, jobId: job.id, workerId: currentUser?.id ?? "", feeRate: job.feeRate })}
                          className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs font-bold px-3 py-2 rounded-xl shrink-0 hover:bg-primary/10 hover:text-primary transition-colors">
                          <MessageSquare className="w-3.5 h-3.5" /> Chat
                        </button>
                      ) : (
                        <div className="flex items-center gap-1 text-[10px] text-gray-400 font-semibold shrink-0 px-2">
                          <Lock className="w-3 h-3" /> Menunggu persetujuan
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* ── COMPANY CHAT LIST ── */
            notifications.filter(n => n.status === "diterima").length === 0 ? (
              <ChatEmptyState label="Belum ada percakapan aktif" sub="Terima lamaran pekerja terlebih dahulu untuk mulai berkomunikasi." />
            ) : (
              <div className="p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">Pelamar Diterima</p>
                {notifications
                  .filter(n => n.status === "diterima")
                  .map((n) => {
                    const job = customJobs.find(j => j.id === n.jobId);
                    const isAccepted = n.status === "diterima";
                    return (
                      <div key={n.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-sm">
                            {n.applicantName.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-bold text-gray-900">{n.applicantName}</p>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isAccepted ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-700"}`}>
                                {isAccepted ? "Diterima" : "Ditinjau"}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 truncate">{n.jobTitle}</p>
                            {n.hasNpwp && <p className="text-[10px] text-primary font-medium mt-0.5">✓ NPWP Terverifikasi</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {job && (
                            <button
                              onClick={() => setAttendanceQrJob(job)}
                              data-testid={`button-presensi-qr-${n.id}`}
                              className="flex items-center gap-1.5 bg-emerald-50 text-primary border border-primary/20 text-xs font-bold px-3 py-2 rounded-xl hover:bg-primary/10 transition-colors">
                              <QrCode className="w-3.5 h-3.5" /> Presensi QR
                            </button>
                          )}
                          {job && (
                            <button
                              onClick={() => setChatContext({ jobTitle: n.jobTitle, nominal: job.nominal, companyName: job.namaPerusahaan || "Perusahaan Anda", workerName: n.applicantName, currentRole: "company", hiringMode: job.hiringMode, jobId: job.id, workerId: n.workerId, feeRate: job.feeRate })}
                              className="flex items-center gap-1.5 bg-primary text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-primary/90 transition-colors">
                              <MessageSquare className="w-3.5 h-3.5" /> Chat
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )
          )}
        </div>
      )}

      {/* ── PROFILE PAGES (full-screen when tab=profile) ── */}
      {isProfileTab && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {currentUser.role === "pekerja" ? (
            <WorkerProfilePage
              currentUser={currentUser}
              workerProfile={workerProfile}
              reputationPoints={reputationPoints}
              ratings={ratings}
              completedJobs={completedNotifs}
              totalEarned={totalEarned}
              clockedInAt={clockedInAt}
              clockedOutAt={clockedOutAt}
              walletBalance={walletBalance}
              walletTransactions={walletTransactions}
              isWithdrawLocked={customJobs.some(j => j.escrowStatus === "disputed")}
              escrowEvents={escrowEvents}
              workerJobIds={completedNotifs.map(n => n.jobId)}
              onLogout={handleLogout}
              onDemoInject={handleDemoInject}
              onEditProfile={() => setShowOnboarding(true)}
              onWithdraw={handleWithdraw}
            />
          ) : (
            <CompanyProfilePage
              currentUser={currentUser}
              customJobs={customJobs}
              ratings={ratings}
              notifications={notifications}
              escrowEvents={escrowEvents}
              onLogout={handleLogout}
              onDemoInject={handleDemoInject}
              onDispute={handleJobDispute}
              onAdminResolve={handleAdminResolve}
              onJobUpdate={(updated) =>
                setCustomJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)))
              }
            />
          )}
        </div>
      )}

      {/* ── HOME TAB CONTENT (hidden when profile tab active) */}
      {!isProfileTab && (
        <>
          {/* ── HEADER ─────────────────────────────────── */}
          <header className="z-10 bg-white border-b border-gray-100 shadow-sm flex flex-col shrink-0">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <RekhasthaLogo size={34} showSubtitle wordmarkClassName="text-lg" />
                {mode === "perusahaan" && (
                  <NotificationPanel notifications={notifications} onStatusChange={handleStatusChange} onOpenChat={handleOpenChatFromNotif} onMarkComplete={handleSplitPayment} onDispute={handleNotifDispute} />
                )}
              </div>
              <span className={`text-xs font-bold px-3 py-1.5 rounded-lg ${mode === "perusahaan" ? "bg-blue-50 text-blue-700" : "bg-primary/10 text-primary"}`}>
                {mode === "perusahaan" ? "🏢 Perusahaan" : "👷 Pekerja"}
              </span>
            </div>

            {/* Company sub-tabs */}
            {mode === "perusahaan" && (
              <div className="px-4 pb-2">
                <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
                  <button onClick={() => setCompanyView("jobs")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${companyView === "jobs" ? "bg-white text-primary shadow-sm" : "text-gray-500"}`}>
                    <Briefcase className="w-3.5 h-3.5" /> Kelola Lowongan
                    {customJobs.length > 0 && <span className="w-4 h-4 rounded-full bg-primary text-white text-[9px] font-black flex items-center justify-center">{customJobs.length}</span>}
                  </button>
                  <button onClick={() => setCompanyView("analytics")} data-testid="button-analytics-tab"
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all ${companyView === "analytics" ? "bg-white text-primary shadow-sm" : "text-gray-500"}`}>
                    <BarChart2 className="w-3.5 h-3.5" /> Analitik
                  </button>
                </div>
              </div>
            )}

            {/* Worker header */}
            {mode === "pekerja" && (
              <div className="px-4 pb-3 space-y-2">
                {/* ── Status Radar Mencari Kerja (On/Off toggle) ── */}
                <div className={`flex items-center justify-between rounded-2xl px-3.5 py-2.5 border transition-colors ${radarOn ? "bg-primary/10 border-primary/30" : "bg-gray-100 border-gray-200"}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
                      {radarOn && <span className="absolute inline-flex h-full w-full rounded-full bg-primary/50 animate-ping" />}
                      <span className={`relative inline-flex rounded-full h-3 w-3 ${radarOn ? "bg-primary" : "bg-gray-400"}`} />
                    </span>
                    <div className="min-w-0">
                      <p className={`text-xs font-black leading-tight ${radarOn ? "text-primary" : "text-gray-500"}`}>Status Radar Mencari Kerja</p>
                      <p className="text-[10px] text-gray-500 leading-tight">{radarOn ? "Aktif — menerima lowongan instan terdekat" : "Mati — tidak menerima panggilan instan"}</p>
                    </div>
                  </div>
                  <button
                    role="switch"
                    aria-checked={radarOn}
                    aria-label="Status Radar Mencari Kerja"
                    onClick={() => handleToggleRadar(!radarOn)}
                    className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${radarOn ? "bg-primary" : "bg-gray-300"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${radarOn ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {verified ? (
                      <button onClick={() => setShowEarnings(true)} className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full">
                        <ShieldCheck className="w-3.5 h-3.5" /> Terverifikasi · Dashboard
                      </button>
                    ) : (
                      <button data-testid="button-complete-profile" onClick={() => setShowOnboarding(true)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
                        <UserCircle className="w-3.5 h-3.5" />
                        {workerProfile ? "Lengkapi Profil" : "Daftar & Verifikasi"}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${isSuspended ? "bg-red-100 text-red-600" : reputationPoints < 80 ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}>
                      {isSuspended ? "Suspended" : `Rep: ${reputationPoints}`}
                    </span>
                    {/* Demo ping button */}
                    <button
                      onClick={() => {
                        const demo: CustomJob = {
                          id: -(Date.now()),
                          type: "custom_job",
                          posisi: "Event Staff Malam",
                          deskripsi: "Dibutuhkan segera untuk acara malam ini di SCBD.",
                          pembayaran: "per_shift",
                          nominal: 275_000,
                          dresscode: "Hitam rapi",
                          kuota: 2,
                          lat: userLocation.lat + 0.008,
                          lng: userLocation.lng + 0.006,
                          postedAt: new Date(),
                          namaPerusahaan: "PT. Event Jakarta",
                          hiringMode: "cepat",
                          broadcastActive: true,
                          escrowStatus: "locked",
                          escrowAmount: 316_250,
                        };
                        setActivePing(demo);
                      }}
                      className="flex items-center gap-1 text-[10px] font-black px-2 py-1 rounded-full bg-orange-500 text-white animate-pulse hover:animate-none active:scale-95 transition-all"
                      style={{ boxShadow: "0 0 8px rgba(249,115,22,0.5)" }}>
                      ⚡ Ping Demo
                    </button>
                    <div className="flex bg-gray-100 p-0.5 rounded-lg">
                      <button onClick={() => setWorkerView("list")} className={`px-2 py-1 text-xs font-semibold rounded-md transition-colors ${workerView === "list" ? "bg-white text-primary shadow-sm" : "text-gray-500"}`}>Daftar</button>
                      <button onClick={() => setWorkerView("map")} className={`px-2 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${workerView === "map" ? "bg-white text-primary shadow-sm" : "text-gray-500"}`}>
                        <MapIcon className="w-3 h-3" /> Radar
                      </button>
                      <button onClick={() => setWorkerView("scheduled")} className={`px-2 py-1 text-xs font-semibold rounded-md transition-colors ${workerView === "scheduled" ? "bg-white text-primary shadow-sm" : "text-gray-500"}`}>📅 Jadwal</button>
                    </div>
                  </div>
                </div>

                {activeJob && jobStatus === "accepted" && graceDeadline != null && (
                  <div className="rounded-xl px-3 py-2 border border-red-200 bg-red-50 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                      <p className="text-[10px] font-semibold text-red-700 leading-tight">
                        Masa tenggang Clock-In. Denda Rp15.000 bila lewat.
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm font-black text-red-600 tabular-nums">{fmtCountdown(graceDeadline - nowTick)}</p>
                      <p className="text-[8px] font-bold uppercase tracking-wide text-red-400">Sisa Waktu</p>
                    </div>
                  </div>
                )}

                {standbyReroute && (
                  <div className="rounded-xl px-3 py-2 border border-orange-200 bg-orange-50 flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <Users className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                      <p className="text-[10px] font-semibold text-orange-700 leading-tight">
                        Mode Butuh Cepat: Anda melewati masa tenggang. Lowongan "{standbyReroute.jobTitle}" dialihkan otomatis ke pekerja standby berikutnya (<span className="font-black">{standbyReroute.workerName}</span>).
                      </p>
                    </div>
                    <button onClick={() => setStandbyReroute(null)} className="text-orange-400 p-0.5 shrink-0">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {activeJob && jobStatus === "completed" && disputeDeadline != null && (
                  <div className="rounded-xl px-3 py-2 border border-amber-200 bg-amber-50 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" />
                      <p className="text-[10px] font-semibold text-amber-700 leading-tight">
                        Jendela sengketa Pemberi Kerja. Escrow cair otomatis bila lewat.
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm font-black text-amber-600 tabular-nums">{fmtCountdown(disputeDeadline - nowTick)}</p>
                      <p className="text-[8px] font-bold uppercase tracking-wide text-amber-400">Sisa 24 Jam</p>
                    </div>
                  </div>
                )}

                {activeJob && jobStatus === "completed" && contractClosed && (
                  <div className="rounded-xl px-3 py-2 border border-emerald-200 bg-emerald-50 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <p className="text-[10px] font-bold text-emerald-700 leading-tight">
                      Kontrak DITUTUP & FINAL (CLOSED & UNAPPEALABLE) — escrow telah cair otomatis.
                    </p>
                  </div>
                )}

                {activeJob && (
                  <div className={`rounded-xl px-3 py-2.5 border flex items-center justify-between gap-2 ${jobStatus === "clocked_in" ? "bg-primary text-white border-primary" : jobStatus === "completed" ? "bg-gray-50 border-gray-200" : jobStatus === "accepted" ? "bg-amber-50 border-amber-200" : "bg-gray-100 border-gray-200"}`}>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Briefcase className={`w-4 h-4 shrink-0 ${jobStatus === "clocked_in" ? "text-white" : jobStatus === "completed" ? "text-gray-400" : jobStatus === "accepted" ? "text-amber-600" : "text-gray-400"}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold truncate ${jobStatus === "clocked_in" ? "text-white" : "text-gray-900"}`}>{activeJob.posisi}</p>
                        <p className={`text-[10px] ${jobStatus === "clocked_in" ? "text-white/70" : "text-gray-500"}`}>
                          {jobStatus === "applied" ? "⌛ Menunggu persetujuan perusahaan" : jobStatus === "accepted" ? "Diterima — belum Clock-In" : jobStatus === "clocked_in" ? "Sedang bekerja..." : "Selesai"}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {jobStatus === "completed" ? (
                        <>
                          <button onClick={() => setShowPaySlip(true)} className="text-[10px] font-bold bg-primary text-white px-2.5 py-1.5 rounded-lg">Slip Gaji</button>
                          <button onClick={() => setChatContext({ jobTitle: activeJob.posisi, nominal: activeJob.nominal, companyName: activeJob.namaPerusahaan || "Perusahaan", workerName: workerProfile?.namaLengkap || "Pekerja", currentRole: "worker", hiringMode: activeJob.hiringMode, jobId: activeJob.id, workerId: currentUser?.id ?? "", feeRate: activeJob.feeRate })}
                            className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-1.5 rounded-lg flex items-center">
                            <MessageSquare className="w-3 h-3" />
                          </button>
                          <button onClick={() => { setActiveJob(null); setJobStatus(null); }} className="text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-1.5 rounded-lg">Tutup</button>
                        </>
                      ) : jobStatus === "applied" ? (
                        /* Pending acceptance — show only a cancel option */
                        <>
                          <div className="flex items-center gap-1 text-[10px] text-gray-400 font-semibold">
                            <Lock className="w-3 h-3" /> Menunggu
                          </div>
                          <button data-testid="button-cancel-job" onClick={handleWorkerCancelJob} className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-1.5 rounded-lg">Batal</button>
                        </>
                      ) : (
                        <>
                          <button data-testid="button-open-clock-in" onClick={() => setShowClockIn(true)}
                            className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg ${jobStatus === "clocked_in" ? "bg-white/20 text-white" : "bg-primary text-white"}`}>
                            {jobStatus === "clocked_in" ? "Clock-Out" : "Clock-In"}
                          </button>
                          {jobStatus === "clocked_in" && (
                            <button onClick={handleWorkerDispute} className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-1.5 rounded-lg">⚠️ Sengketa</button>
                          )}
                          {jobStatus !== "clocked_in" && (
                            <button data-testid="button-cancel-job" onClick={handleWorkerCancelJob} className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-1.5 rounded-lg">Batal</button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {activeJob && jobStatus !== "completed" && (
                  <div className="space-y-2.5 pt-1">
                    {activeJob.boronganType && (
                      <BoronganWorkerPanel
                        activeJob={activeJob}
                        onJobUpdate={(job) => setActiveJob(job)}
                      />
                    )}
                    <EmergencySOS activeJob={activeJob} workerPhone={workerPhone} />
                  </div>
                )}
              </div>
            )}
          </header>

          {/* ── MAIN ───────────────────────────────────── */}
          <main className="flex-1 relative overflow-hidden flex flex-col">
            {mode === "perusahaan" ? (
              companyView === "analytics" ? (
                <AnalyticsDashboard customJobs={customJobs} ratings={ratings} totalApplicants={notifications.length} />
              ) : (
                <HiringModePanel
                  currentUser={currentUser}
                  customJobs={customJobs}
                  notifications={notifications}
                  onJobPosted={handleJobPosted}
                  onLockEscrow={handleLockEscrow}
                  onDispute={handleJobDispute}
                  onStatusChange={handleStatusChange}
                  onCancelJob={handleCancelJob}
                />
              )

            ) : workerView === "map" ? (
              <div className="flex-1 relative">
                <WorkerMap userLat={userLocation.lat} userLng={userLocation.lng} customJobs={mapPurpleJobs} broadcastGigs={radarOn ? instantGigs : []} radarActive={radarOn} selectedJob={selectedJob} onJobClick={(j) => setSelectedJob(j)} flyTarget={workerMapFlyTarget} />
                <button
                  type="button"
                  title="Kembali ke lokasi saya"
                  onClick={() => {
                    if (!navigator.geolocation) return;
                    navigator.geolocation.getCurrentPosition(
                      (p) => {
                        const t: [number, number] = [p.coords.latitude, p.coords.longitude];
                        setUserLocation({ lat: t[0], lng: t[1] });
                        setWorkerMapFlyTarget(t);
                        setTimeout(() => setWorkerMapFlyTarget(null), 1500);
                      },
                      () => {
                        const t: [number, number] = [userLocation.lat, userLocation.lng];
                        setWorkerMapFlyTarget(t);
                        setTimeout(() => setWorkerMapFlyTarget(null), 1500);
                      },
                      { enableHighAccuracy: true, timeout: 6000 },
                    );
                  }}
                  className="absolute bottom-6 right-4 z-[10] w-12 h-12 rounded-full bg-primary text-white shadow-xl flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all"
                  style={{ boxShadow: "0 4px 16px rgba(6,95,70,0.5)" }}
                >
                  <MapPin className="w-5 h-5" />
                </button>
                {!radarOn && (
                  <div className="absolute inset-0 z-[5] bg-gray-900/45 backdrop-grayscale flex items-start justify-center pt-16 pointer-events-none">
                    <span className="bg-gray-900/85 text-white text-[11px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5">
                      ⚪ Radar Mati — panggilan instan dinonaktifkan
                    </span>
                  </div>
                )}
                <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow border border-gray-100 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-3 w-3 shrink-0 items-center justify-center">
                      {radarOn && <span className="absolute inline-flex h-full w-full rounded-full bg-primary/50 animate-ping" />}
                      <span className={`relative w-3 h-3 rounded-full border-2 border-white shadow-sm ${radarOn ? "bg-primary" : "bg-gray-400"}`} />
                    </span>
                    <span className="text-[10px] font-medium text-gray-600">Lokasi Saya{radarOn ? "" : " (Radar Mati)"}</span>
                  </div>
                  {radarOn && instantGigs.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white shadow-sm shrink-0 flex items-center justify-center text-white text-[8px]">⚡</span>
                      <span className="text-[10px] font-medium text-gray-600">{instantGigs.length} Broadcast Live</span>
                    </div>
                  )}
                  {mapPurpleJobs.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-[3px] bg-violet-600 border-2 border-white shadow-sm shrink-0 flex items-center justify-center text-white text-[8px] font-black">+</span>
                      <span className="text-[10px] font-medium text-gray-600">{mapPurpleJobs.length} Lowongan</span>
                    </div>
                  ) : (!radarOn || instantGigs.length === 0) ? <p className="text-[10px] text-gray-400">Belum ada lowongan</p> : null}
                </div>
                {selectedJob && (
                  <div className="absolute bottom-4 left-4 right-4 z-10 bg-white rounded-xl shadow-lg border border-gray-100 p-3 flex justify-between items-center">
                    <div>
                      <p className="text-xs font-bold text-gray-900 truncate">{selectedJob.posisi}</p>
                      <p className="text-[10px] text-violet-600 font-medium">Klik pin untuk detail</p>
                    </div>
                    <button onClick={() => setSelectedJob(null)} className="text-gray-400 p-1"><X className="w-4 h-4" /></button>
                  </div>
                )}
                <JobSheet job={selectedJob} onClose={() => setSelectedJob(null)} workerProfile={workerProfile}
                  onApply={isSuspended ? undefined : handleApply} onOpenChat={handleOpenChatFromJob} onReportSuspect={handleReportSuspect} />
              </div>

            ) : workerView === "scheduled" ? (
              <>
                <ScheduledJobsFeed
                  jobs={scheduledGigs}
                  suspended={isSuspended}
                  onSelect={(job) => setSelectedJob(job)}
                  onChat={(job) => setChatContext({ jobTitle: job.posisi, nominal: job.nominal, companyName: job.namaPerusahaan || "Perusahaan", workerName: workerProfile?.namaLengkap || "Pekerja", currentRole: "worker", hiringMode: job.hiringMode, jobId: job.id, workerId: currentUser?.id ?? "", feeRate: job.feeRate })}
                />
                <JobSheet job={selectedJob} onClose={() => setSelectedJob(null)} workerProfile={workerProfile}
                  onApply={isSuspended ? undefined : handleApply} onOpenChat={handleOpenChatFromJob} onReportSuspect={handleReportSuspect} />
              </>

            ) : (
              <div className="flex-1 overflow-y-auto bg-gray-50">
                <div className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">Pekerjaan Tersedia</h2>
                      <p className="text-sm text-gray-500">{customJobs.length > 0 ? `${customJobs.length} lowongan · ${jobs.length} tetap` : "Berdasarkan lokasi Anda"}</p>
                    </div>
                    {workerProfile && (
                      <button onClick={() => setShowEarnings(true)} className="flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full">
                        <TrendingUp className="w-3.5 h-3.5" /> Dashboard
                      </button>
                    )}
                  </div>

                  {isSuspended && (
                    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                      <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-red-700">Akun Ditangguhkan (Suspended)</p>
                        <p className="text-xs text-red-600 mt-0.5">Poin reputasi di bawah 50. Hubungi admin.</p>
                      </div>
                    </div>
                  )}

                  {customJobs.length > 0 && (
                    <button onClick={() => setWorkerView("map")} className="w-full flex items-center justify-center gap-2 bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold py-2.5 rounded-xl hover:bg-violet-100 transition-colors">
                      <MapIcon className="w-4 h-4" /> Lihat {customJobs.length} lowongan di Peta Radar
                    </button>
                  )}

                  {customJobs.map((job) => (
                    <div key={job.id} data-testid={`card-custom-job-${job.id}`}
                      className={`bg-white p-4 rounded-xl border shadow-sm flex flex-col gap-3 ${job.flaggedSuspect ? "border-yellow-300 bg-yellow-50/50" : "border-violet-100"}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-gray-900 truncate">{job.posisi}</h3>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {job.isAgency ? <span className="text-[10px] font-black px-2 py-0.5 rounded bg-gradient-to-r from-blue-100 to-violet-100 text-violet-700">[AGENCY JOB]</span>
                              : <span className="text-xs text-violet-600 font-medium">Lowongan Kustom</span>}
                            {job.namaPerusahaan && <span className="text-[10px] text-gray-400">· {job.namaPerusahaan}</span>}
                            {job.flaggedSuspect && <span className="text-[10px] font-bold text-yellow-600 bg-yellow-100 px-1.5 py-0.5 rounded">⚠️ Ditinjau</span>}
                          </div>
                        </div>
                        <span className="text-xs font-semibold bg-violet-100 text-violet-700 px-2 py-1 rounded ml-2 shrink-0">Baru</span>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">{job.deskripsi}</p>
                      {job.hiringMode === "lama" && (job.jobDate || job.jamKerja || job.alamat) && (
                        <div className="flex flex-col gap-1 bg-emerald-50/60 border border-emerald-100 rounded-lg px-2.5 py-2 text-[11px] text-gray-600">
                          {job.jobDate && (
                            <span className="flex items-center gap-1.5">
                              <CalendarDays className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              Mulai {new Date(job.jobDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                            </span>
                          )}
                          {job.jamKerja && (
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> {job.jamKerja}
                            </span>
                          )}
                          {job.alamat && (
                            <span className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="line-clamp-1">{job.alamat}</span>
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Banknote className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-semibold text-gray-900">
                          Rp {job.nominal.toLocaleString("id-ID")} / {paymentUnits[job.pembayaran]}
                        </span>
                        {job.isAgency && <span className="text-[10px] text-blue-600 font-semibold">{job.kuota} orang</span>}
                      </div>
                      <div className="flex gap-2">
                        <Button disabled={isSuspended}
                          className={`flex-1 font-semibold ${isSuspended ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-violet-600 hover:bg-violet-700 text-white"}`}
                          onClick={() => !isSuspended && setSelectedJob(job)}>
                          {isSuspended ? "Ditangguhkan" : "Detail & Lamar"}
                        </Button>
                        <button onClick={() => setChatContext({ jobTitle: job.posisi, nominal: job.nominal, companyName: job.namaPerusahaan || "Perusahaan", workerName: workerProfile?.namaLengkap || "Pekerja", currentRole: "worker", hiringMode: job.hiringMode, jobId: job.id, workerId: currentUser?.id ?? "", feeRate: job.feeRate })}
                          className="px-3 py-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors flex items-center justify-center">
                          <MessageSquare className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {jobs.map((job) => (
                    <div key={job.id} data-testid={`card-job-${job.id}`} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div><h3 className="font-bold text-gray-900">{job.category}</h3><p className="text-sm text-primary font-medium">{job.company}</p></div>
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
                <JobSheet job={selectedJob} onClose={() => setSelectedJob(null)} workerProfile={workerProfile}
                  onApply={isSuspended ? undefined : handleApply} onOpenChat={handleOpenChatFromJob} onReportSuspect={handleReportSuspect} />
              </div>
            )}
          </main>
        </>
      )}

      {/* ── BOTTOM NAVIGATION (3 tabs) ─────────────────── */}
      <nav className="shrink-0 bg-white border-t border-gray-100 flex shadow-[0_-2px_12px_rgba(0,0,0,0.06)] z-20">
        <NavBtn
          icon={<HomeIcon className="w-5 h-5" />}
          label={mode === "pekerja" ? "Radar" : "Beranda"}
          active={activeTab === "home"}
          onClick={() => setActiveTab("home")}
        />
        <NavBtn
          icon={
            <div className="relative">
              <MessageSquare className="w-5 h-5" />
              {/* Unread chat badge */}
              {mode === "perusahaan" && notifications.filter(n => n.status === "diterima" || n.status === "ditinjau").length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center">
                  {notifications.filter(n => n.status === "diterima" || n.status === "ditinjau").length > 9 ? "9+" : notifications.filter(n => n.status === "diterima" || n.status === "ditinjau").length}
                </span>
              )}
              {mode === "pekerja" && (customJobs.length > 0 || activeJob) && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full border border-white" />
              )}
            </div>
          }
          label="Chat"
          active={activeTab === "chat"}
          onClick={() => setActiveTab("chat")}
        />
        <NavBtn
          icon={
            <div className="relative">
              <User className="w-5 h-5" />
              {currentUser.linkedWithGoogle && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-500 border border-white" />
              )}
            </div>
          }
          label={currentUser.name.split(" ")[0]}
          active={activeTab === "profile"}
          onClick={() => setActiveTab("profile")}
        />
      </nav>
    </div>
  );
}

function ChatEmptyState({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-16 gap-3">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-1">
        <MessageSquare className="w-8 h-8 text-gray-300" />
      </div>
      <p className="font-bold text-gray-700 text-sm">{label}</p>
      <p className="text-xs text-gray-400 leading-relaxed">{sub}</p>
    </div>
  );
}

function NavBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors ${active ? "text-primary" : "text-gray-400 hover:text-gray-600"}`}>
      {icon}
      <span className="text-[10px] font-semibold">{label}</span>
      {active && <span className="w-1 h-1 rounded-full bg-primary" />}
    </button>
  );
}
