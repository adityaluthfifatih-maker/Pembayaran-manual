import { useState, useMemo, useCallback, useEffect } from "react";
import Map from "@/components/map";
import WorkerMap from "@/components/worker-map";
import WorkerSheet from "@/components/bottom-sheet";
import JobSheet from "@/components/job-sheet";
import JobPostingModal from "@/components/job-posting-modal";
import WorkerOnboarding from "@/components/worker-onboarding";
import NotificationPanel from "@/components/notification-panel";
import { workers, Worker } from "@/data/workers";
import { jobs } from "@/data/jobs";
import { CustomJob } from "@/types/custom-job";
import { WorkerProfile, isVerified } from "@/types/worker-profile";
import {
  ApplicationNotification,
  ApplicationStatus,
  maskName,
  maskNik,
  maskNpwp,
  maskRekening,
} from "@/types/notification";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, Banknote, Search, X, ShieldCheck, UserCircle, Map as MapIcon } from "lucide-react";

let nextJobId = 100;
let nextNotifId = 1;

function randomJakartaCoords(): { lat: number; lng: number } {
  return {
    lat: -6.2088 + (Math.random() - 0.5) * 0.14,
    lng: 106.8456 + (Math.random() - 0.5) * 0.14,
  };
}

const JAKARTA_CENTER = { lat: -6.2088, lng: 106.8456 };

export default function Home() {
  const [mode, setMode] = useState<"perusahaan" | "pekerja">("perusahaan");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [selectedJob, setSelectedJob] = useState<CustomJob | null>(null);
  const [customJobs, setCustomJobs] = useState<CustomJob[]>([]);

  // Worker profile & onboarding
  const [workerProfile, setWorkerProfile] = useState<WorkerProfile | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [workerView, setWorkerView] = useState<"list" | "map">("list");

  // Notifications (applications received by companies)
  const [notifications, setNotifications] = useState<ApplicationNotification[]>([]);

  // Geolocation
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>(JAKARTA_CENTER);

  useEffect(() => {
    if (mode === "pekerja" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setUserLocation(JAKARTA_CENTER)
      );
    }
  }, [mode]);

  const handleModeChange = useCallback(
    (newMode: "perusahaan" | "pekerja") => {
      setMode(newMode);
      if (newMode === "pekerja" && !workerProfile) {
        setShowOnboarding(true);
      }
    },
    [workerProfile]
  );

  // When a worker successfully applies to a job, create a notification for the company
  const handleApply = useCallback((job: CustomJob, profile: WorkerProfile) => {
    const notif: ApplicationNotification = {
      id: nextNotifId++,
      jobId: job.id,
      jobTitle: job.posisi,
      applicantName: maskName(profile.namaLengkap),
      applicantNikMasked: maskNik(profile.nik),
      applicantNpwpMasked: profile.belumPunyaNpwp ? "Belum ada NPWP" : maskNpwp(profile.npwp),
      hasNpwp: !profile.belumPunyaNpwp,
      bank: profile.namaBank || "—",
      rekening: maskRekening(profile.nomorRekening),
      timestamp: new Date(),
      status: "baru",
    };
    setNotifications((prev) => [notif, ...prev]);
  }, []);

  const handleStatusChange = useCallback((id: number, status: ApplicationStatus) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, status } : n))
    );
  }, []);

  const suggestedTags = ["Barista", "Waiter / Waitress", "Event Crew / Runner", "Latte Art", "POS/Kasir", "Crowd Control"];
  const visibleTags = searchQuery
    ? suggestedTags.filter((t) => t.toLowerCase().includes(searchQuery.toLowerCase()) && !activeTags.includes(t))
    : suggestedTags.filter((t) => !activeTags.includes(t));

  const addTag = useCallback((tag: string) => {
    setActiveTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setSearchQuery("");
  }, []);

  const removeTag = useCallback((tag: string) => {
    setActiveTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const filteredWorkers = useMemo(() => {
    if (activeTags.length === 0 && !searchQuery.trim()) return workers;
    return workers.filter((w) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        w.name.toLowerCase().includes(q) ||
        w.category.toLowerCase().includes(q) ||
        w.skills.some((s) => s.toLowerCase().includes(q));
      const matchesTags =
        activeTags.length === 0 ||
        activeTags.some(
          (tag) => w.category === tag || w.skills.some((s) => s.toLowerCase() === tag.toLowerCase())
        );
      return matchesQuery && matchesTags;
    });
  }, [searchQuery, activeTags]);

  const handleJobPosted = useCallback(
    (data: Omit<CustomJob, "id" | "type" | "lat" | "lng" | "postedAt">) => {
      const coords = randomJakartaCoords();
      const newJob: CustomJob = {
        id: nextJobId++,
        type: "custom_job",
        ...data,
        ...coords,
        postedAt: new Date(),
      };
      setCustomJobs((prev) => [...prev, newJob]);
    },
    []
  );

  const handleWorkerClick = useCallback((worker: Worker) => {
    setSelectedJob(null);
    setSelectedWorker(worker);
  }, []);

  const handleJobClick = useCallback((job: CustomJob) => {
    setSelectedWorker(null);
    setSelectedJob(job);
  }, []);

  const handleOnboardingComplete = useCallback((profile: WorkerProfile) => {
    setWorkerProfile(profile);
    setShowOnboarding(false);
  }, []);

  const verified = workerProfile ? isVerified(workerProfile) : false;

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-gray-50 relative overflow-hidden">
      {/* ONBOARDING */}
      {showOnboarding && (
        <WorkerOnboarding
          onComplete={handleOnboardingComplete}
          onDismiss={() => setShowOnboarding(false)}
        />
      )}

      {/* HEADER */}
      <header className="z-10 bg-white border-b border-gray-100 shadow-sm flex flex-col shrink-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-lg text-primary tracking-tight">GigFinder</h1>
            {/* Notification bell — only visible in company mode */}
            {mode === "perusahaan" && (
              <NotificationPanel
                notifications={notifications}
                onStatusChange={handleStatusChange}
              />
            )}
          </div>

          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              data-testid="button-mode-perusahaan"
              onClick={() => handleModeChange("perusahaan")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                mode === "perusahaan" ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Mode Perusahaan
            </button>
            <button
              data-testid="button-mode-pekerja"
              onClick={() => handleModeChange("pekerja")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                mode === "pekerja" ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
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
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kategori, keahlian, atau nama pekerja..."
                className="w-full pl-9 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {activeTags.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {activeTags.map((tag) => (
                  <button
                    key={tag}
                    data-testid={`tag-active-${tag}`}
                    onClick={() => removeTag(tag)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-primary text-white text-xs font-semibold rounded-full"
                  >
                    {tag} <X className="w-3 h-3" />
                  </button>
                ))}
                <button
                  onClick={() => setActiveTags([])}
                  className="px-3 py-1 text-xs text-gray-500 border border-gray-200 rounded-full hover:bg-gray-50"
                >
                  Hapus semua
                </button>
              </div>
            )}
            {visibleTags.length > 0 && (searchQuery || activeTags.length === 0) && (
              <div
                className="overflow-x-auto whitespace-nowrap flex gap-2 pb-0.5"
                style={{ scrollbarWidth: "none" }}
              >
                {visibleTags.map((tag) => (
                  <button
                    key={tag}
                    data-testid={`tag-suggest-${tag}`}
                    onClick={() => addTag(tag)}
                    className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:border-primary/50 hover:text-primary transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Worker: Profile bar */}
        {mode === "pekerja" && (
          <div className="px-4 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {verified ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Akun Terverifikasi Pajak
                </span>
              ) : (
                <button
                  data-testid="button-complete-profile"
                  onClick={() => setShowOnboarding(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full hover:bg-amber-100 transition-colors"
                >
                  <UserCircle className="w-3.5 h-3.5" />
                  {workerProfile ? "Lengkapi Profil Legalitas" : "Daftar & Verifikasi Akun"}
                </button>
              )}
            </div>
            <div className="flex bg-gray-100 p-0.5 rounded-lg">
              <button
                onClick={() => setWorkerView("list")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  workerView === "list" ? "bg-white text-primary shadow-sm" : "text-gray-500"
                }`}
              >
                Daftar
              </button>
              <button
                onClick={() => setWorkerView("map")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 ${
                  workerView === "map" ? "bg-white text-primary shadow-sm" : "text-gray-500"
                }`}
              >
                <MapIcon className="w-3 h-3" /> Radar
              </button>
            </div>
          </div>
        )}
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {mode === "perusahaan" ? (
          <div className="flex-1 relative">
            <Map
              workers={filteredWorkers}
              onWorkerClick={handleWorkerClick}
              customJobs={customJobs}
              onJobClick={handleJobClick}
            />

            {/* Legend */}
            <div className="absolute bottom-4 left-3 z-10 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow border border-gray-100 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#065F46] border-2 border-white shadow-sm shrink-0" />
                <span className="text-[10px] font-medium text-gray-600">Barista</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#1D4ED8] border-2 border-white shadow-sm shrink-0" />
                <span className="text-[10px] font-medium text-gray-600">Waiter / Waitress</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#D97706] border-2 border-white shadow-sm shrink-0" />
                <span className="text-[10px] font-medium text-gray-600">Event Crew</span>
              </div>
              {customJobs.length > 0 && (
                <div className="flex items-center gap-2 border-t border-gray-100 pt-1.5">
                  <span className="w-3.5 h-3.5 rounded-[3px] bg-violet-600 border-2 border-white shadow-sm shrink-0 flex items-center justify-center text-white text-[8px] font-black">
                    +
                  </span>
                  <span className="text-[10px] font-medium text-gray-600">
                    Lowongan ({customJobs.length})
                  </span>
                </div>
              )}
            </div>

            <WorkerSheet worker={selectedWorker} onClose={() => setSelectedWorker(null)} />
            <JobSheet
              job={selectedJob}
              onClose={() => setSelectedJob(null)}
              workerProfile={workerProfile}
              onApply={handleApply}
            />
            <JobPostingModal onSubmit={handleJobPosted} />
          </div>
        ) : workerView === "map" ? (
          /* WORKER RADAR MAP */
          <div className="flex-1 relative">
            <WorkerMap
              userLat={userLocation.lat}
              userLng={userLocation.lng}
              customJobs={customJobs}
              selectedJob={selectedJob}
              onJobClick={handleJobClick}
            />

            <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow border border-gray-100 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-primary border-2 border-white shadow-sm shrink-0" />
                <span className="text-[10px] font-medium text-gray-600">Lokasi Saya</span>
              </div>
              {customJobs.length > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-[3px] bg-violet-600 border-2 border-white shadow-sm shrink-0 flex items-center justify-center text-white text-[8px] font-black">
                    +
                  </span>
                  <span className="text-[10px] font-medium text-gray-600">
                    {customJobs.length} Lowongan Aktif
                  </span>
                </div>
              ) : (
                <p className="text-[10px] text-gray-400">Belum ada lowongan di peta</p>
              )}
            </div>

            {selectedJob && (
              <div className="absolute bottom-4 left-4 right-4 z-10 bg-white rounded-xl shadow-lg border border-gray-100 p-3 flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-gray-900 truncate">{selectedJob.posisi}</p>
                  <p className="text-[10px] text-violet-600 font-medium">Klik pin untuk detail</p>
                </div>
                <button
                  onClick={() => setSelectedJob(null)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <JobSheet
              job={selectedJob}
              onClose={() => setSelectedJob(null)}
              workerProfile={workerProfile}
              onApply={handleApply}
            />
          </div>
        ) : (
          /* WORKER LIST */
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <div className="p-4 space-y-4">
              <div className="mb-2">
                <h2 className="text-xl font-bold text-gray-900">Pekerjaan Tersedia</h2>
                <p className="text-sm text-gray-500">
                  {customJobs.length > 0
                    ? `${customJobs.length} lowongan kustom · ${jobs.length} lowongan tetap`
                    : "Berdasarkan lokasi dan keahlian Anda"}
                </p>
              </div>

              {customJobs.length > 0 && (
                <button
                  onClick={() => setWorkerView("map")}
                  className="w-full flex items-center justify-center gap-2 bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold py-2.5 rounded-xl hover:bg-violet-100 transition-colors"
                >
                  <MapIcon className="w-4 h-4" />
                  Lihat {customJobs.length} lowongan di Peta Radar
                </button>
              )}

              {/* Custom posted jobs */}
              {customJobs.map((job) => (
                <div
                  key={job.id}
                  data-testid={`card-custom-job-${job.id}`}
                  className="bg-white p-4 rounded-xl border border-violet-100 shadow-sm flex flex-col gap-3"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 truncate">{job.posisi}</h3>
                      <p className="text-xs text-violet-600 font-medium mt-0.5">Lowongan Kustom</p>
                    </div>
                    <span className="text-xs font-semibold bg-violet-100 text-violet-700 px-2 py-1 rounded ml-2 shrink-0">
                      Baru
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2">{job.deskripsi}</p>
                  <div className="flex flex-col gap-1.5 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                      <span>Jakarta (lihat peta radar)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                      <span>
                        {job.pembayaran === "per_jam"
                          ? "8 Jam / Shift"
                          : job.pembayaran === "per_shift"
                          ? "Per Shift"
                          : "Per Projek"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-semibold text-gray-900">
                        Rp {job.nominal.toLocaleString("id-ID")}
                        {job.pembayaran === "per_jam"
                          ? " / Jam"
                          : job.pembayaran === "per_shift"
                          ? " / Shift"
                          : " / Projek"}
                      </span>
                    </div>
                  </div>
                  <Button
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold"
                    onClick={() => setSelectedJob(job)}
                  >
                    Lihat Detail & Lamar
                  </Button>
                </div>
              ))}

              {/* Static jobs */}
              {jobs.map((job) => (
                <div
                  key={job.id}
                  data-testid={`card-job-${job.id}`}
                  className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-gray-900">{job.category}</h3>
                      <p className="text-sm text-primary font-medium">{job.company}</p>
                    </div>
                    <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded">
                      Baru
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <span>{job.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span>{job.time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-primary" />
                      <span className="font-semibold text-gray-900">{job.pay}</span>
                    </div>
                  </div>
                  <Button className="w-full mt-1 bg-primary hover:bg-primary/90 text-white font-semibold">
                    Lamar Sekarang
                  </Button>
                </div>
              ))}
            </div>

            <JobSheet
              job={selectedJob}
              onClose={() => setSelectedJob(null)}
              workerProfile={workerProfile}
              onApply={handleApply}
            />
          </div>
        )}
      </main>
    </div>
  );
}
