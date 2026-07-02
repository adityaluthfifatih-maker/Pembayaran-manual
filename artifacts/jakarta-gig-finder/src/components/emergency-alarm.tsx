import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, PhoneOff, Clipboard, Check } from "lucide-react";
import {
  fetchEmergencies,
  resolveEmergency,
  type EmergencyIncident,
} from "@/lib/admin-client";

const API_BASE = "/api";

/**
 * Full-screen Admin Command Center emergency alarm (spec item 4).
 *
 * Listens for worker silent-SOS incidents over the realtime hub (and hydrates
 * any already-active incident on mount). When an incident is live it renders a
 * blocking full-screen overlay that violently flashes between deep crimson and
 * dark charcoal, loops a sharp Web Audio siren, and can ONLY be silenced by the
 * dispatcher pressing "Matikan Alarm & Hubungi Pihak Berwajib" (which also
 * resolves the incident server-side). The admin can copy a formatted dispatch
 * summary to the clipboard for the operator on the phone.
 */
export function EmergencyAlarm() {
  const [incident, setIncident] = useState<EmergencyIncident | null>(null);
  const [resolving, setResolving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sweepRef = useRef<number | null>(null);

  // ── Web Audio siren (oscillator sweep on a loop) ──────────────────
  const startSiren = useCallback(() => {
    if (audioCtxRef.current) return;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      void ctx.resume().catch(() => {});

      // Continuous rising/falling siren sweep.
      let rising = true;
      const sweep = window.setInterval(() => {
        const now = ctx.currentTime;
        const target = rising ? 1200 : 500;
        osc.frequency.linearRampToValueAtTime(target, now + 0.5);
        rising = !rising;
      }, 500);

      audioCtxRef.current = ctx;
      oscRef.current = osc;
      gainRef.current = gain;
      sweepRef.current = sweep;
    } catch {
      /* audio is best-effort — the visual alarm still fires */
    }
  }, []);

  const stopSiren = useCallback(() => {
    if (sweepRef.current !== null) {
      window.clearInterval(sweepRef.current);
      sweepRef.current = null;
    }
    try {
      oscRef.current?.stop();
    } catch {
      /* already stopped */
    }
    oscRef.current?.disconnect();
    gainRef.current?.disconnect();
    void audioCtxRef.current?.close().catch(() => {});
    oscRef.current = null;
    gainRef.current = null;
    audioCtxRef.current = null;
  }, []);

  // ── Hydrate any active incident + subscribe to realtime ───────────
  useEffect(() => {
    let alive = true;
    fetchEmergencies()
      .then((rows) => {
        if (alive && rows.length > 0) setIncident(rows[0]);
      })
      .catch(() => {
        /* no active incidents / unauthorized — ignore */
      });

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}${API_BASE}/ws`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as {
          type?: string;
          incident?: EmergencyIncident;
          id?: number;
        };
        if (msg.type === "emergency_active" && msg.incident) {
          setIncident(msg.incident);
        } else if (msg.type === "emergency_resolved") {
          setIncident((cur) =>
            cur && cur.id === msg.id ? null : cur,
          );
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    return () => {
      alive = false;
      ws.close();
    };
  }, []);

  // ── Drive siren + flashing while an incident is active ────────────
  useEffect(() => {
    if (!incident) {
      stopSiren();
      setCopied(false);
      return;
    }
    startSiren();
    const t = window.setInterval(() => setFlash((f) => !f), 450);
    return () => window.clearInterval(t);
  }, [incident, startSiren, stopSiren]);

  useEffect(() => stopSiren, [stopSiren]);

  const handleResolve = async () => {
    if (!incident || resolving) return;
    setResolving(true);
    stopSiren();
    try {
      await resolveEmergency(incident.id);
    } catch {
      /* the realtime resolved frame / re-hydrate will reconcile */
    } finally {
      setIncident(null);
      setResolving(false);
    }
  };

  const handleCopy = async () => {
    if (!incident) return;
    const jenis = incident.boronganType === "remote" ? "Remote" : "On-Site";
    const text =
      `[DARURAT REKHASTHA] Jenis Proyek: ${jenis} | ` +
      `Alamat Kejadian: ${incident.projectAddress} | ` +
      `Nama Pekerja: ${incident.workerName} | ` +
      `Kontak: ${incident.workerPhone}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked — operator can read the on-screen details */
    }
  };

  if (!incident) return null;

  return (
    <div
      data-testid="overlay-emergency-alarm"
      className="fixed inset-0 w-full h-full z-[99999] flex items-center justify-center p-4 transition-colors duration-200"
      style={{ background: flash ? "#b91c1c" : "#1a0505" }}
    >
      <div
        className="w-full max-w-lg rounded-3xl border-2 p-6 sm:p-8 shadow-2xl"
        style={{
          background: "#180404",
          borderColor: flash ? "#fca5a5" : "#7f1d1d",
        }}
      >
        <div className="flex flex-col items-center text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: flash ? "#dc2626" : "#7f1d1d" }}
          >
            <AlertTriangle className="w-9 h-9 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white leading-tight">
            🚨 PERINGATAN DARURAT: PEKERJA DALAM BAHAYA!
          </h1>
          <p className="text-sm text-red-200/80 mt-2">
            Insiden SOS diterima dari lapangan. Segera koordinasi dengan pihak berwajib.
          </p>
        </div>

        <div className="mt-6 rounded-2xl bg-black/40 border border-red-900/60 divide-y divide-red-900/40">
          <DetailRow label="Nama Pekerja" value={incident.workerName || "—"} testId="emg-worker-name" />
          <DetailRow label="Kontak (No. HP)" value={incident.workerPhone || "—"} testId="emg-worker-phone" />
          <DetailRow label="Posisi / Pekerjaan" value={incident.jobTitle || "—"} testId="emg-job-title" />
          <DetailRow label="Perusahaan / Employer" value={incident.employerName || "—"} testId="emg-employer" />
          <DetailRow label="Alamat Lokasi Proyek" value={incident.projectAddress || "—"} testId="emg-address" />
        </div>

        <button
          data-testid="button-copy-emergency"
          onClick={() => void handleCopy()}
          className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-200 hover:bg-amber-400/20 transition-colors"
        >
          {copied ? <Check className="w-4 h-4" /> : <Clipboard className="w-4 h-4" />}
          {copied ? "Detail Tersalin!" : "📋 SALIN DETAIL DARURAT UNTUK OPERATOR"}
        </button>

        <button
          data-testid="button-resolve-emergency"
          onClick={() => void handleResolve()}
          disabled={resolving}
          className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-4 text-sm sm:text-base font-black text-white hover:bg-red-500 disabled:opacity-60 active:scale-[0.98] transition-all"
        >
          {resolving ? <Loader2 className="w-5 h-5 animate-spin" /> : <PhoneOff className="w-5 h-5" />}
          🔴 Matikan Alarm &amp; Hubungi Pihak Berwajib
        </button>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-red-300/70">
        {label}
      </span>
      <span data-testid={testId} className="text-sm font-bold text-white text-right">
        {value}
      </span>
    </div>
  );
}
