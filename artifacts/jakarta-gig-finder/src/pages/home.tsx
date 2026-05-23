import { useState, useMemo } from "react";
import Map from "@/components/map";
import WorkerSheet from "@/components/bottom-sheet";
import { workers, Worker } from "@/data/workers";
import { jobs } from "@/data/jobs";
import { Button } from "@/components/ui/button";
import { MapPin, Clock, Banknote } from "lucide-react";

export default function Home() {
  const [mode, setMode] = useState<"perusahaan" | "pekerja">("perusahaan");
  const [activeFilter, setActiveFilter] = useState("Semua Kategori");
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);

  const filters = ["Semua Kategori", "Barista", "Waiter / Waitress", "Event Crew / Runner"];

  const filteredWorkers = useMemo(() => {
    if (activeFilter === "Semua Kategori") return workers;
    return workers.filter((w) => w.category === activeFilter);
  }, [activeFilter]);

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-gray-50 relative overflow-hidden">
      {/* HEADER & SWITCHER */}
      <header className="z-10 bg-white border-b border-gray-100 shadow-sm flex flex-col shrink-0">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="font-bold text-lg text-primary tracking-tight">GigFinder</h1>
          
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
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

        {/* FILTER CHIPS (Only in Perusahaan mode) */}
        {mode === "perusahaan" && (
          <div className="px-4 pb-3 overflow-x-auto whitespace-nowrap flex gap-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {filters.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border shrink-0 ${
                  activeFilter === filter
                    ? "bg-primary text-white border-primary"
                    : "bg-white text-gray-600 border-gray-200 hover:border-primary/50"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {mode === "perusahaan" ? (
          <div className="flex-1 relative">
            <Map workers={filteredWorkers} onWorkerClick={setSelectedWorker} />
            <WorkerSheet worker={selectedWorker} onClose={() => setSelectedWorker(null)} />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-gray-900">Pekerjaan Tersedia</h2>
              <p className="text-sm text-gray-500">Berdasarkan lokasi dan keahlian Anda</p>
            </div>

            {jobs.map((job) => (
              <div key={job.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-gray-900">{job.category}</h3>
                    <p className="text-sm text-primary font-medium">{job.company}</p>
                  </div>
                  <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-1 rounded">
                    Baru
                  </span>
                </div>
                
                <div className="flex flex-col gap-2 text-sm text-gray-600 mt-1">
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

                <Button className="w-full mt-3 bg-primary hover:bg-primary/90 text-white font-semibold">
                  Lamar Sekarang
                </Button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
