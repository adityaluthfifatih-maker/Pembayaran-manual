import { useEffect, useState } from "react";
import { MapPin, Navigation, Plus } from "lucide-react";
import {
  createCompanyBranch,
  listCompanyBranches,
  type CompanyBranch,
} from "@/lib/company-branches-client";

export default function CompanyBranchPicker({
  onChange,
}: {
  onChange: (branch: CompanyBranch | null) => void;
}) {
  const [branches, setBranches] = useState<CompanyBranch[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radiusMeters, setRadiusMeters] = useState("150");

  useEffect(() => {
    let cancelled = false;
    void listCompanyBranches()
      .then((rows) => {
        if (cancelled) return;
        setBranches(rows);
        setSelectedId(rows[0]?.id ?? null);
        onChange(rows[0] ?? null);
        setAdding(rows.length === 0);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Gagal memuat cabang.");
          setAdding(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [onChange]);

  const selectBranch = (id: number) => {
    setSelectedId(id);
    onChange(branches.find((branch) => branch.id === id) ?? null);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Perangkat ini tidak mendukung lokasi GPS.");
      return;
    }
    setGpsLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatitude(coords.latitude.toFixed(6));
        setLongitude(coords.longitude.toFixed(6));
        setGpsLoading(false);
      },
      () => {
        setError("Lokasi tidak bisa diambil. Izinkan akses lokasi atau isi koordinat manual.");
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const saveBranch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const branch = await createCompanyBranch({
        name: name.trim(),
        address: address.trim(),
        latitude: Number(latitude),
        longitude: Number(longitude),
        radiusMeters: Number(radiusMeters),
      });
      const next = [...branches, branch].sort((a, b) => a.name.localeCompare(b.name));
      setBranches(next);
      setSelectedId(branch.id);
      onChange(branch);
      setAdding(false);
      setName("");
      setAddress("");
      setLatitude("");
      setLongitude("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menambahkan cabang.");
    } finally {
      setSaving(false);
    }
  };

  const selected = branches.find((branch) => branch.id === selectedId);

  return (
    <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
            <MapPin className="h-4 w-4 text-primary" /> Cabang lokasi kerja
          </h3>
          <p className="mt-0.5 text-[11px] text-gray-500">
            QR dan catatan presensi terikat pada cabang yang dipilih.
          </p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => { setError(null); setAdding(true); }}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-primary/20 px-2.5 py-1.5 text-xs font-bold text-primary"
          >
            <Plus className="h-3.5 w-3.5" /> Cabang
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-gray-500">Memuat cabang…</p>
      ) : branches.length ? (
        <select
          value={selectedId ?? ""}
          onChange={(event) => selectBranch(Number(event.target.value))}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
          aria-label="Pilih cabang untuk QR presensi"
        >
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </select>
      ) : (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Tambahkan cabang terlebih dahulu sebelum membuat QR presensi.
        </p>
      )}

      {selected && !adding && (
        <p className="text-[11px] leading-relaxed text-gray-600">
          {selected.address} · Radius presensi {selected.radiusMeters} m
        </p>
      )}

      {adding && (
        <form onSubmit={(event) => void saveBranch(event)} className="space-y-2.5 rounded-xl bg-gray-50 p-3">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nama cabang, mis. Gudang Selatan"
            maxLength={100}
            required
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs"
          />
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Alamat lengkap cabang"
            maxLength={500}
            required
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs"
          />
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={gpsLoading}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-white px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50"
          >
            <Navigation className="h-3.5 w-3.5" />
            {gpsLoading ? "Mengambil GPS…" : "Gunakan lokasi perangkat"}
          </button>
          <div className="grid grid-cols-3 gap-2">
            <input
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
              placeholder="Latitude"
              type="number"
              step="any"
              required
              className="min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs"
            />
            <input
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
              placeholder="Longitude"
              type="number"
              step="any"
              required
              className="min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs"
            />
            <input
              value={radiusMeters}
              onChange={(event) => setRadiusMeters(event.target.value)}
              placeholder="Radius (m)"
              type="number"
              min={25}
              max={1000}
              required
              className="min-w-0 rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              {saving ? "Menyimpan…" : "Simpan cabang"}
            </button>
            {branches.length > 0 && (
              <button
                type="button"
                onClick={() => { setAdding(false); setError(null); }}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600"
              >
                Batal
              </button>
            )}
          </div>
        </form>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </section>
  );
}