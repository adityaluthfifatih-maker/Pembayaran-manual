import { useState, useMemo, useCallback } from "react";
import Map from "@/components/map";
import WorkerSheet from "@/components/bottom-sheet";
import JobSheet from "@/components/job-sheet";
import JobPostingModal from "@/components/job-posting-modal";
import { workers, Worker } from "@/data/workers";
import { jobs } from "@/data/jobs";
import { CustomJob } from "@/types/custom-job";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, Banknote, Search, X } from "lucide-react";

let nextJobId = 100;

function randomJakartaCoords(): { lat: number; lng: number } {
  return {
    lat: -6.2088 + (Math.random() - 0.5) * 0.14,
    lng: 106.8456 + (Math.random() - 0.5) * 0.14,
  };
}

export default function Home() {
  const [mode, setMode] = useState<"perusahaan" | "pekerja">("perusahaan");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [selectedJob, setSelectedJob] = useState<CustomJob | null>(null);
  const [customJobs, setCustomJobs] = useState<CustomJob[]>([]);

  const suggestedTags = ["Barista", "Waiter / Waitress", "Event Crew / Runner", "Latte Art", "POS/Kasir", "Crowd Control"];

  const visibleTags = searchQuery
    ? suggestedTags.filter(
        (t) =>
          t.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !activeTags.includes(t)
      )
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
          (tag) =>
            w.category === tag || w.skills.some((s) => s.toLowerCase() === tag.toLowerCase())
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

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-gray-50 relative overflow-hidden">
      {/* HEADER */}
      <header className="z-10 bg-white border-b border-gray-100 shadow-sm flex flex-col shrink-0">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="font-bold text-lg text-primary tracking-tight">GigFinder</h1>

          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              data-testid="button-mode-perusahaan"
              onClick={() => setMode("perusahaan")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                mode === "perusahaan"
                  ? "bg-white text-primary shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Mode Perusahaan
            </button>
            <button
              data-testid="button-mode-pekerja"
              onClick={() => setMode("pekerja")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                mode === "pekerja"
                  ? "bg-white text-primary shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Mode Pekerja
            </button>
          </div>
        </div>

        {/* SMART SEARCH BAR (Company mode only) */}
        {mode === "perusahaan" && (
          <div className="px-4 pb-3 space-y-2">
            {/* Search input */}
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

            {/* Active tags */}
            {activeTags.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {activeTags.map((tag) => (
                  <button
                    key={tag}
                    data-testid={`tag-active-${tag}`}
                    onClick={() => removeTag(tag)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-primary text-white text-xs font-semibold rounded-full"
                  >
                    {tag}
                    <X className="w-3 h-3" />
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

            {/* Suggested tags (shown when search has results or no active tags) */}
            {(visibleTags.length > 0 && (searchQuery || activeTags.length === 0)) && (
              <div className="overflow-x-auto whitespace-nowrap flex gap-2 pb-0.5" style={{ scrollbarWidth: "none" }}>
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
                  <span className="w-3.5 h-3.5 rounded-[3px] bg-violet-600 border-2 border-white shadow-sm shrink-0 flex items-center justify-center text-white text-[8px] font-black">+</span>
                  <span className="text-[10px] font-medium text-gray-600">Lowongan Baru ({customJobs.length})</span>
                </div>
              )}
            </div>

            <WorkerSheet worker={selectedWorker} onClose={() => setSelectedWorker(null)} />
            <JobSheet job={selectedJob} onClose={() => setSelectedJob(null)} />

            {/* FAB */}
            <JobPostingModal onSubmit={handleJobPosted} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto bg-gray-50">
            {/* Map in pekerja mode showing custom job pins */}
            {customJobs.length > 0 && (
              <div className="relative" style={{ height: "240px" }}>
                <Map
                  workers={[]}
                  onWorkerClick={() => {}}
                  customJobs={customJobs}
                  onJobClick={handleJobClick}
                />
                <div className="absolute top-3 left-3 z-10 bg-violet-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow">
                  {customJobs.length} Lowongan Tersedia di Peta
                </div>
              </div>
            )}

            <div className="p-4 space-y-4">
              <div className="mb-2">
                <h2 className="text-xl font-bold text-gray-900">Pekerjaan Tersedia</h2>
                <p className="text-sm text-gray-500">Berdasarkan lokasi dan keahlian Anda</p>
              </div>

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
                      <span>Jakarta (lihat peta)</span>
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
                        {job.pembayaran === "per_jam" ? " / Jam" : job.pembayaran === "per_shift" ? " / Shift" : " / Projek"}
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
          </div>
        )}

        {/* Job sheet accessible from both modes */}
        {mode === "pekerja" && (
          <JobSheet job={selectedJob} onClose={() => setSelectedJob(null)} />
        )}
      </main>
    </div>
  );
}
