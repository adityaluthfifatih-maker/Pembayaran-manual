import { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Navigation, Loader2, X } from "lucide-react";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const JAKARTA_CENTER: [number, number] = [-6.2088, 106.8456];
const NOMINATIM_HEADERS = { "User-Agent": "Rekhastha/1.0 (rekhastha.tilu.co.id)" };

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

async function nominatimSearch(query: string): Promise<NominatimResult[]> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=id&accept-language=id`;
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    return res.ok ? (await res.json() as NominatimResult[]) : [];
  } catch {
    return [];
  }
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=id`;
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return "";
    const data = await res.json() as { display_name?: string };
    return data.display_name ?? "";
  } catch {
    return "";
  }
}

function MapFlyController({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 15, { duration: 1 });
  }, [target, map]);
  return null;
}

function DraggableMarker({
  lat, lng, onDragEnd,
}: { lat: number; lng: number; onDragEnd: (lat: number, lng: number) => void }) {
  return (
    <Marker
      position={[lat, lng]}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const pos = (e.target as L.Marker).getLatLng();
          onDragEnd(pos.lat, pos.lng);
        },
      }}
    />
  );
}

interface LocationPickerSectionProps {
  inputCls: string;
  labelCls: string;
  onLocationChange: (lat: number, lng: number, address: string) => void;
}

export default function LocationPickerSection({
  inputCls, labelCls, onLocationChange,
}: LocationPickerSectionProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [markerPos, setMarkerPos] = useState<[number, number]>(JAKARTA_CENTER);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback(
    (lat: number, lng: number, addr: string) => {
      setMarkerPos([lat, lng]);
      setQuery(addr);
      onLocationChange(lat, lng, addr);
    },
    [onLocationChange],
  );

  const handleQueryChange = (val: string) => {
    setQuery(val);
    onLocationChange(markerPos[0], markerPos[1], val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const results = await nominatimSearch(val);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    }, 450);
  };

  const handleSelect = (result: NominatimResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setSuggestions([]);
    setShowSuggestions(false);
    setFlyTarget([lat, lng]);
    commit(lat, lng, result.display_name);
  };

  const handleDragEnd = async (lat: number, lng: number) => {
    const addr = await reverseGeocode(lat, lng);
    setFlyTarget(null);
    commit(lat, lng, addr || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
  };

  const handleGps = () => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const addr = await reverseGeocode(lat, lng);
        setFlyTarget([lat, lng]);
        commit(lat, lng, addr || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div className="space-y-2">
      <label className={labelCls}>
        <MapPin className="w-3 h-3 text-primary inline mr-1 -mt-0.5" />
        Alamat Penempatan Spesifik *
      </label>

      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 z-10 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder="Ketik nama tempat atau alamat (cth: UNJ, Jl. Sudirman)"
          className={`${inputCls} pl-9 pr-8`}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSuggestions([]);
              onLocationChange(markerPos[0], markerPos[1], "");
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-[9999] max-h-44 overflow-y-auto">
            {suggestions.map((r) => (
              <button
                key={r.place_id}
                type="button"
                onMouseDown={() => handleSelect(r)}
                className="w-full text-left px-3 py-2.5 text-xs text-gray-700 hover:bg-primary/5 hover:text-primary border-b border-gray-50 last:border-0 flex items-start gap-2"
              >
                <MapPin className="w-3 h-3 text-primary shrink-0 mt-0.5" />
                <span className="line-clamp-2">{r.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={handleGps}
        disabled={gpsLoading}
        className="flex items-center gap-2 text-xs font-semibold text-primary border border-primary/30 rounded-xl px-3 py-2 hover:bg-primary/5 disabled:opacity-50 transition-all"
      >
        {gpsLoading
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Navigation className="w-3.5 h-3.5" />}
        {gpsLoading ? "Mendapatkan lokasi GPS..." : "Gunakan Lokasi Saya Saat Ini"}
      </button>

      <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: 190 }}>
        <MapContainer
          center={JAKARTA_CENTER}
          zoom={12}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          />
          <DraggableMarker lat={markerPos[0]} lng={markerPos[1]} onDragEnd={handleDragEnd} />
          <MapFlyController target={flyTarget} />
        </MapContainer>
      </div>
      <p className="text-[10px] text-gray-400">
        Seret pin untuk menyesuaikan · Powered by OpenStreetMap
      </p>
    </div>
  );
}
