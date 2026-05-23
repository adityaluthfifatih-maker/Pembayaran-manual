import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import { Worker } from "../data/workers";
import { CustomJob } from "../types/custom-job";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const createColoredIcon = (color: string) =>
  L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

const createJobIcon = () =>
  L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:6px;background:#7C3AED;border:3px solid white;box-shadow:0 2px 10px rgba(124,58,237,0.5);display:flex;align-items:center;justify-content:center;color:white;font-size:14px;font-weight:900;line-height:1">+</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

const categoryColors: Record<string, string> = {
  Barista: "#065F46",
  "Waiter / Waitress": "#1D4ED8",
  "Event Crew / Runner": "#D97706",
};

interface MapProps {
  workers: Worker[];
  onWorkerClick: (worker: Worker) => void;
  customJobs?: CustomJob[];
  onJobClick?: (job: CustomJob) => void;
}

export default function Map({ workers, onWorkerClick, customJobs = [], onJobClick }: MapProps) {
  return (
    <div style={{ height: "100%", width: "100%", zIndex: 0, position: "absolute", inset: 0 }}>
      <MapContainer
        center={[-6.2088, 106.8456]}
        zoom={12}
        style={{ height: "100%", width: "100%" }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        {workers.map((worker) => {
          const color = categoryColors[worker.category] || "#6B7280";
          return (
            <Marker
              key={`worker-${worker.id}`}
              position={[worker.lat, worker.lng]}
              icon={createColoredIcon(color)}
              eventHandlers={{ click: () => onWorkerClick(worker) }}
            />
          );
        })}
        {customJobs.map((job) => (
          <Marker
            key={`job-${job.id}`}
            position={[job.lat, job.lng]}
            icon={createJobIcon()}
            eventHandlers={{ click: () => onJobClick?.(job) }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
