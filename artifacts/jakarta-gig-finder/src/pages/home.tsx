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
import ChatModal from "@/components/chat-modal";
import AnalyticsDashboard from "@/components/analytics-dashboard";
import HiringModePanel from "@/components/hiring-mode-panel";
import JobPingModal from "@/components/job-ping-modal";
import ApplicantToast from "@/components/applicant-toast";
import AuthPage from "@/pages/auth";
import WorkerProfilePage from "@/components/worker-profile-page";
import CompanyProfilePage from "@/components/company-profile-page";
import { workers, Worker } from "@/data/workers";
import { jobs } from "@/data/jobs";
import { CustomJob, calcTotal } from "@/types/custom-job";
import { WalletTransaction, EscrowEvent, calcSplit, ADMIN_DISPUTE_FEE, calcEscrowAmount, DURATION_DAYS } from "@/types/escrow";
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
type CompanyView = "jobs" | "analytics";
type AppTab = "home" | "chat" | "profile";

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
    const pembayaran: CustomJob["pembayaran"] = i < 2 || i === 4 ? "per_shift" : i === 3 ? "per_projek" : "per_jam";
    const kuota = i === 1 ? 20 : 3;
    const jumlahHari = DURATION_DAYS[durations[i] ?? "harian"] ?? 1;
    const escrowAmount = calcEscrowAmount(t.nominal, pembayaran, jumlahHari, kuota);
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
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [mode, setMode] = useState<"perusahaan" | "pekerja">("perusahaan");
  const [companyView, setCompanyView] = useState<CompanyView>("jobs");
  const [workerView, setWorkerView] = useState<"list" | "map">("list");

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
  } | null>(null);

  // ── Notifications ───────────────────────────────────────────────
  const [notifications, setNotifications] = useState<ApplicationNotification[]>([]);

  // ── Real-time: employer toast & worker ping ──────────────────────
  const [applicantToast, setApplicantToast] = useState<ApplicationNotification | null>(null);
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
  }, []);

  const handleLogout = useCallback(() => {
    setCurrentUser(null);
    setActiveTab("home");
    setMode("perusahaan");
    setCustomJobs([]);
    setNotifications([]);
    setRatings([]);
    setCompletedNotifs([]);
    setTotalEarned(0);
    setWorkerProfile(null);
    setActiveJob(null);
    setJobStatus(null);
    setReputationPoints(100);
    setWalletBalance(0);
    setWalletTransactions([]);
    setPlatformBalance(0);
    setEscrowEvents([]);
  }, []);

  // ── Escrow handlers ─────────────────────────────────────────────
  const handleSplitPayment = useCallback((notifId: number, hasNpwp: boolean) => {
    const notif = notifications.find(n => n.id === notifId);
    if (!notif || notif.status === "selesai") return;
    const job = customJobs.find(j => j.id === notif.jobId);
    const gross = job?.escrowAmount ?? calcTotal(job?.nominal ?? 0, job?.pembayaran ?? "per_shift");
    const { platformCut, pphCut, workerNet } = calcSplit(gross, hasNpwp);

    setCustomJobs(prev => prev.map(j =>
      j.id === notif.jobId ? { ...j, escrowStatus: "released" as const } : j
    ));
    setWalletBalance(prev => prev + workerNet);
    setWalletTransactions(prev => [...prev, {
      id: Date.now(),
      type: "credit" as const,
      amount: workerNet,
      label: "Gaji bersih — pekerjaan selesai",
      jobTitle: notif.jobTitle,
      timestamp: new Date(),
      note: `PPh ${hasNpwp ? "2.5%" : "3%"} Rp ${pphCut.toLocaleString("id-ID")} + Komisi 10% Rp ${platformCut.toLocaleString("id-ID")}`,
    }]);
    setPlatformBalance(prev => prev + platformCut);
    setTotalEarned(prev => prev + gross);
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
      note: `Pekerja: ${notif.applicantName}. PPh ${hasNpwp ? "2.5%" : "3%"} + komisi 10% dipotong. Dana ditransfer ke e-wallet pekerja.`,
    }]);
  }, [notifications, customJobs]);

  const handleNotifDispute = useCallback((notifId: number) => {
    const notif = notifications.find(n => n.id === notifId);
    if (!notif) return;
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
  }, [notifications]);

  const handleLockEscrow = useCallback((jobId: number, escrowAmount: number) => {
    const job = customJobs.find(j => j.id === jobId);
    setCustomJobs(prev => prev.map(j =>
      j.id === jobId ? { ...j, escrowStatus: "locked" as const, escrowAmount } : j
    ));
    if (job) {
      setEscrowEvents(prev => [...prev, {
        id: Date.now(), jobId,
        jobTitle: job.posisi,
        fromStatus: "pending" as const,
        toStatus: "locked" as const,
        actor: "company" as const,
        amount: escrowAmount,
        timestamp: new Date(),
        note: `Dana dikunci setelah seleksi kandidat (Mode Bisa Lama — biaya sistem 7%).`,
      }]);
    }
  }, [customJobs]);

  const handleJobDispute = useCallback((jobId: number) => {
    const job = customJobs.find(j => j.id === jobId);
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
  }, [customJobs]);

  const handleWorkerDispute = useCallback(() => {
    if (!activeJob) return;
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
      const hasNpwp = workerProfile ? !workerProfile.belumPunyaNpwp : true;
      const { platformCut, pphCut, workerNet } = calcSplit(job.escrowAmount, hasNpwp);
      setWalletBalance(prev => prev + workerNet);
      setWalletTransactions(prev => [...prev, {
        id: Date.now(),
        type: "credit" as const,
        amount: workerNet,
        label: "Keputusan Admin — Pekerja Menang",
        jobTitle: job.posisi,
        timestamp: new Date(),
        note: `Dipotong: Rp ${(pphCut + platformCut).toLocaleString("id-ID")}`,
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
      amount: winner === "worker" ? (() => {
        const hasNpwp = workerProfile ? !workerProfile.belumPunyaNpwp : true;
        return calcSplit(job.escrowAmount!, hasNpwp).workerNet;
      })() : Math.round((job.escrowAmount ?? 0) * (1 - ADMIN_DISPUTE_FEE)),
      timestamp: new Date(),
      note: winner === "worker"
        ? `Admin memutuskan pekerja menang. Dana dilepas ke e-wallet pekerja setelah potongan.`
        : `Admin memutuskan perusahaan menang. Escrow direfund (dipotong biaya admin 5%).`,
    }]);
  }, [customJobs, workerProfile]);

  const handleWithdraw = useCallback(() => {
    if (walletBalance <= 0) return;
    setWalletTransactions(prev => [...prev, {
      id: Date.now(),
      type: "debit" as const,
      amount: walletBalance,
      label: "Penarikan ke Rekening Bank",
      jobTitle: workerProfile?.namaBank ?? "Bank",
      timestamp: new Date(),
      note: `Rekening: ••••${workerProfile?.nomorRekening?.slice(-4) ?? "****"}`,
    }]);
    setWalletBalance(0);
  }, [walletBalance, workerProfile]);

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
        label: "Gaji bersih — pekerjaan selesai", jobTitle: "Event Staff Runner",
        timestamp: new Date(Date.now() - 2 * 86_400_000),
        note: "PPh 2.5% Rp 72.000 + Komisi 10% Rp 315.000",
      };
      const demoTx2: WalletTransaction = {
        id: 2, type: "credit", amount: 936_000,
        label: "Gaji bersih — pekerjaan selesai", jobTitle: "Barista Part-Time",
        timestamp: new Date(Date.now() - 5 * 86_400_000),
        note: "PPh 2.5% Rp 24.000 + Komisi 10% Rp 104.000",
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
          note: `Perusahaan menyetujui pembayaran. PPh 2.5% + komisi 10% dipotong otomatis.`,
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
          note: `Perusahaan menyetujui pembayaran. PPh 2.5% + komisi 10% dipotong otomatis.`,
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

  // ── Mode change ─────────────────────────────────────────────────
  const handleModeChange = useCallback((m: "perusahaan" | "pekerja") => {
    setMode(m);
    if (m === "pekerja" && !workerProfile) setShowOnboarding(true);
  }, [workerProfile]);

  // ── Search ──────────────────────────────────────────────────────
  const suggestedTags = ["Barista", "Waiter / Waitress", "Event Crew / Runner", "Latte Art", "POS/Kasir", "Crowd Control"];
  const visibleTags = searchQuery
    ? suggestedTags.filter((t) => t.toLowerCase().includes(searchQuery.toLowerCase()) && !activeTags.includes(t))
    : suggestedTags.filter((t) => !activeTags.includes(t));

  const addTag = useCallback((tag: string) => { setActiveTags((p) => p.includes(tag) ? p : [...p, tag]); setSearchQuery(""); }, []);
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
  const handleJobPosted = useCallback((data: Omit<CustomJob, "id" | "type" | "lat" | "lng" | "postedAt">) => {
    const coords = randomJakartaCoords();
    const newId = nextJobId++;
    const now = new Date();
    setCustomJobs(p => [...p, { id: newId, type: "custom_job", ...data, ...coords, postedAt: now }]);
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
  }, []);

  // ── Apply ───────────────────────────────────────────────────────
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
    setActiveJob(job);
    setJobStatus("accepted");
  }, []);

  const handleStatusChange = useCallback((id: number, status: ApplicationStatus) => {
    setNotifications((p) => p.map((n) => n.id === id ? { ...n, status } : n));
    if (status === "diterima") {
      const n = notifications.find((x) => x.id === id);
      if (n) {
        const job = customJobs.find((j) => j.id === n.jobId);
        if (job) setPendingRating({ raterType: "company", targetName: n.applicantName, job });
      }
    }
  }, [notifications, customJobs]);

  // ── Chat ────────────────────────────────────────────────────────
  const handleOpenChatFromJob = useCallback((job: CustomJob) => {
    setChatContext({ jobTitle: job.posisi, nominal: job.nominal, companyName: job.namaPerusahaan || "Perusahaan", workerName: workerProfile?.namaLengkap || "Pekerja", currentRole: "worker" });
  }, [workerProfile]);

  const handleOpenChatFromNotif = useCallback((notif: ApplicationNotification) => {
    const job = customJobs.find((j) => j.id === notif.jobId);
    setChatContext({ jobTitle: notif.jobTitle, nominal: job?.nominal ?? 0, companyName: job?.namaPerusahaan || "Perusahaan Anda", workerName: notif.applicantName, currentRole: "company" });
  }, [customJobs]);

  const handleReportSuspect = useCallback((jobId: number) => {
    setCustomJobs((p) => p.map((j) => j.id === jobId ? { ...j, flaggedSuspect: true } : j));
  }, []);

  // ── Clock-in/out ────────────────────────────────────────────────
  const handleClockIn = useCallback(() => { setClockedInAt(new Date()); setJobStatus("clocked_in"); }, []);

  const handleClockOut = useCallback(() => {
    const now = new Date();
    setClockedOutAt(now);
    setJobStatus("completed");
    if (activeJob) {
      setTotalEarned((p) => p + calcTotal(activeJob.nominal, activeJob.pembayaran));
      setCompletedNotifs((p) => [...p, {
        id: nextNotifId++, jobId: activeJob.id, jobTitle: activeJob.posisi,
        applicantName: workerProfile?.namaLengkap ?? "Pekerja",
        applicantNikMasked: "", applicantNpwpMasked: "",
        hasNpwp: !(workerProfile?.belumPunyaNpwp ?? true),
        bank: workerProfile?.namaBank ?? "", rekening: workerProfile?.nomorRekening ?? "",
        timestamp: now, status: "diterima",
      }]);
      setPendingRating({ raterType: "worker", targetName: activeJob.namaPerusahaan || "Perusahaan Pengiklan", job: activeJob });
    }
  }, [activeJob, workerProfile]);

  const handleCancelJob = useCallback(() => {
    setActiveJob(null); setJobStatus(null); setClockedInAt(null); setClockedOutAt(null);
    setReputationPoints((p) => Math.max(0, p - 20));
  }, []);

  const handleRatingSubmit = useCallback((payload: RatingPayload) => {
    setRatings((p) => [...p, payload]);
    setPendingRating(null);
  }, []);

  const verified = workerProfile ? isVerified(workerProfile) : false;

  // ── Auth gate ───────────────────────────────────────────────────
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

      {/* ── GLOBAL MODALS ───────────────────────────────── */}
      {showOnboarding && (
        <WorkerOnboarding onComplete={(p) => { setWorkerProfile(p); setShowOnboarding(false); }} onDismiss={() => setShowOnboarding(false)} />
      )}
      {showClockIn && activeJob && (
        <ClockInModal job={activeJob} userLat={userLocation.lat} userLng={userLocation.lng}
          locationAccuracy={locationAccuracy}
          isClockedIn={jobStatus === "clocked_in"} clockedInAt={clockedInAt}
          onClockIn={handleClockIn} onClockOut={handleClockOut} onClose={() => setShowClockIn(false)} />
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
          currentRole={chatContext.currentRole} onClose={() => setChatContext(null)} />
      )}
      {mode === "pekerja" && jobStatus === "clocked_in" && activeJob && (
        <SOSButton jobTitle={activeJob.posisi} />
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
                {activeJob && (
                  <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
                        <Briefcase className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{activeJob.posisi}</p>
                        <p className="text-xs text-primary font-medium">{activeJob.namaPerusahaan || "Perusahaan"}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{jobStatus === "clocked_in" ? "🟢 Sedang bekerja" : jobStatus === "completed" ? "✅ Selesai" : "⏳ Menunggu Clock-In"}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setChatContext({ jobTitle: activeJob.posisi, nominal: activeJob.nominal, companyName: activeJob.namaPerusahaan || "Perusahaan", workerName: workerProfile?.namaLengkap || currentUser.name, currentRole: "worker" })}
                      className="flex items-center gap-1.5 bg-primary text-white text-xs font-bold px-3 py-2 rounded-xl shrink-0">
                      <MessageSquare className="w-3.5 h-3.5" /> Chat
                    </button>
                  </div>
                )}
                {/* Other jobs from the list */}
                {customJobs.filter(j => j.id !== activeJob?.id).map((job) => (
                  <div key={job.id} className="bg-white border border-gray-100 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center font-black text-sm text-white ${job.isAgency ? "bg-gradient-to-br from-blue-600 to-violet-600" : "bg-violet-600"}`}>
                        {job.isAgency ? "AG" : "+"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{job.posisi}</p>
                        <p className="text-xs text-gray-500 truncate">{job.namaPerusahaan || "Perusahaan"}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">Rp {job.nominal.toLocaleString("id-ID")} / {job.pembayaran === "per_jam" ? "Jam" : job.pembayaran === "per_shift" ? "Shift" : "Projek"}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setChatContext({ jobTitle: job.posisi, nominal: job.nominal, companyName: job.namaPerusahaan || "Perusahaan", workerName: workerProfile?.namaLengkap || currentUser.name, currentRole: "worker" })}
                      className="flex items-center gap-1.5 bg-gray-100 text-gray-700 text-xs font-bold px-3 py-2 rounded-xl shrink-0 hover:bg-primary/10 hover:text-primary transition-colors">
                      <MessageSquare className="w-3.5 h-3.5" /> Chat
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* ── COMPANY CHAT LIST ── */
            notifications.filter(n => n.status === "diterima" || n.status === "ditinjau").length === 0 ? (
              <ChatEmptyState label="Belum ada percakapan aktif" sub="Terima lamaran pekerja terlebih dahulu untuk mulai berkomunikasi." />
            ) : (
              <div className="p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">Pelamar Diterima / Ditinjau</p>
                {notifications
                  .filter(n => n.status === "diterima" || n.status === "ditinjau")
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
                        <button
                          onClick={() => setChatContext({ jobTitle: n.jobTitle, nominal: job?.nominal ?? 0, companyName: job?.namaPerusahaan || "Perusahaan Anda", workerName: n.applicantName, currentRole: "company" })}
                          className="flex items-center gap-1.5 bg-primary text-white text-xs font-bold px-3 py-2 rounded-xl shrink-0 hover:bg-primary/90 transition-colors">
                          <MessageSquare className="w-3.5 h-3.5" /> Chat
                        </button>
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
                <h1 className="font-bold text-lg text-primary tracking-tight">GigFinder</h1>
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
                      <button onClick={() => setWorkerView("list")} className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${workerView === "list" ? "bg-white text-primary shadow-sm" : "text-gray-500"}`}>Daftar</button>
                      <button onClick={() => setWorkerView("map")} className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${workerView === "map" ? "bg-white text-primary shadow-sm" : "text-gray-500"}`}>
                        <MapIcon className="w-3 h-3" /> Radar
                      </button>
                    </div>
                  </div>
                </div>

                {activeJob && (
                  <div className={`rounded-xl px-3 py-2.5 border flex items-center justify-between gap-2 ${jobStatus === "clocked_in" ? "bg-primary text-white border-primary" : jobStatus === "completed" ? "bg-gray-50 border-gray-200" : "bg-amber-50 border-amber-200"}`}>
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
                          <button onClick={() => setShowPaySlip(true)} className="text-[10px] font-bold bg-primary text-white px-2.5 py-1.5 rounded-lg">Slip Gaji</button>
                          <button onClick={() => setChatContext({ jobTitle: activeJob.posisi, nominal: activeJob.nominal, companyName: activeJob.namaPerusahaan || "Perusahaan", workerName: workerProfile?.namaLengkap || "Pekerja", currentRole: "worker" })}
                            className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-1.5 rounded-lg flex items-center">
                            <MessageSquare className="w-3 h-3" />
                          </button>
                          <button onClick={() => { setActiveJob(null); setJobStatus(null); }} className="text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-1.5 rounded-lg">Tutup</button>
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
                            <button data-testid="button-cancel-job" onClick={handleCancelJob} className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-1.5 rounded-lg">Batal</button>
                          )}
                        </>
                      )}
                    </div>
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
                />
              )

            ) : workerView === "map" ? (
              <div className="flex-1 relative">
                <WorkerMap userLat={userLocation.lat} userLng={userLocation.lng} customJobs={customJobs} selectedJob={selectedJob} onJobClick={(j) => setSelectedJob(j)} />
                <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow border border-gray-100 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-primary border-2 border-white shadow-sm shrink-0" />
                    <span className="text-[10px] font-medium text-gray-600">Lokasi Saya</span>
                  </div>
                  {customJobs.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 rounded-[3px] bg-violet-600 border-2 border-white shadow-sm shrink-0 flex items-center justify-center text-white text-[8px] font-black">+</span>
                      <span className="text-[10px] font-medium text-gray-600">{customJobs.length} Lowongan</span>
                    </div>
                  ) : <p className="text-[10px] text-gray-400">Belum ada lowongan</p>}
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
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Banknote className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-semibold text-gray-900">
                          Rp {job.nominal.toLocaleString("id-ID")}{job.pembayaran === "per_jam" ? " / Jam" : job.pembayaran === "per_shift" ? " / Shift" : " / Projek"}
                        </span>
                        {job.isAgency && <span className="text-[10px] text-blue-600 font-semibold">{job.kuota} orang</span>}
                      </div>
                      <div className="flex gap-2">
                        <Button disabled={isSuspended}
                          className={`flex-1 font-semibold ${isSuspended ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-violet-600 hover:bg-violet-700 text-white"}`}
                          onClick={() => !isSuspended && setSelectedJob(job)}>
                          {isSuspended ? "Ditangguhkan" : "Detail & Lamar"}
                        </Button>
                        <button onClick={() => setChatContext({ jobTitle: job.posisi, nominal: job.nominal, companyName: job.namaPerusahaan || "Perusahaan", workerName: workerProfile?.namaLengkap || "Pekerja", currentRole: "worker" })}
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
