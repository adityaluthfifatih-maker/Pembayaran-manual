import { Worker } from "../data/workers";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, ShieldCheck } from "lucide-react";

interface WorkerSheetProps {
  worker: Worker | null;
  onClose: () => void;
}

export default function WorkerSheet({ worker, onClose }: WorkerSheetProps) {
  if (!worker) return null;

  const costText =
    worker.rateType === "per_hour"
      ? `Rp ${(worker.ratePerHour * 8).toLocaleString("id-ID")} / 8 Jam Shift`
      : `Rp ${(worker.flatRate || 0).toLocaleString("id-ID")} / Event (Flat Rate)`;

  const handleHire = () => {
    const text = `Halo ${worker.name}, perusahaan kami tertarik menggunakan jasa Anda sebagai ${worker.category} melalui Jakarta Gig Finder. Apakah Anda tersedia?`;
    window.open(`https://wa.me/${worker.phone}?text=${encodeURIComponent(text)}`);
  };

  return (
    <Sheet open={!!worker} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl p-6 h-[85vh] sm:h-auto overflow-y-auto">
        <div className="flex flex-col gap-6 pt-4">
          <div className="flex items-center gap-4">
            <img
              src={worker.photo}
              alt={worker.name}
              className="w-16 h-16 rounded-full object-cover border-2 border-primary/10"
            />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900">{worker.name}</h2>
                {worker.rating >= 4.5 && (
                  <span className="flex items-center gap-1 text-[11px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                    <ShieldCheck className="w-3 h-3" /> Verified Mitra
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="flex items-center gap-1 text-sm font-medium bg-primary/10 text-primary px-2 py-0.5 rounded">
                  {worker.rating} <Star className="w-3 h-3 fill-current" />
                </span>
                <span className="text-sm text-gray-500">
                  {worker.completedJobs} Pekerjaan Selesai
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Kategori</h3>
            <p className="text-gray-600">{worker.category}</p>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Spesifikasi Keahlian</h3>
            <div className="flex flex-wrap gap-2">
              {worker.skills.map((skill) => (
                <Badge key={skill} variant="secondary" className="bg-gray-100 text-gray-700 hover:bg-gray-200">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Sertifikasi</h3>
            <div className="flex flex-wrap gap-2">
              {worker.certifications.map((cert) => (
                <Badge key={cert} variant="outline" className="border-gray-200 text-gray-700">
                  {cert}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Persyaratan Pakaian</h3>
            <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">
              {worker.dresscode}
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Ketersediaan & Biaya</h3>
            <div className="bg-primary/5 border border-primary/10 p-4 rounded-lg flex flex-col gap-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Jadwal</span>
                <span className="font-medium text-gray-900">{worker.shift}</span>
              </div>
              <div className="flex justify-between items-center text-sm pt-2 border-t border-primary/10">
                <span className="text-gray-600">Total Biaya Estimasi</span>
                <span className="font-bold text-primary text-base">{costText}</span>
              </div>
            </div>
          </div>

          <div className="pt-2 pb-6">
            <Button
              className="w-full bg-primary hover:bg-primary/90 text-white h-12 text-base font-semibold rounded-xl"
              onClick={handleHire}
            >
              Pesan Tenaga Kerja
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
