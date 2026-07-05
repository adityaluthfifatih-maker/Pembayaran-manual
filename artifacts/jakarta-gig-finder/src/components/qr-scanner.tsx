import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { AlertTriangle } from "lucide-react";

interface QrScannerProps {
  onScan: (text: string) => void;
  onError?: (message: string) => void;
}

let scannerSeq = 0;

/**
 * Live-camera QR scanner (html5-qrcode). Opens the rear camera, decodes a QR in
 * real time and fires `onScan` exactly once. Gracefully surfaces a message if
 * the browser blocks camera access (permission denied / no device / insecure
 * context) instead of failing silently.
 */
export default function QrScanner({ onScan, onError }: QrScannerProps) {
  const [elementId] = useState(() => `qr-scanner-${++scannerSeq}`);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannedRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [camError, setCamError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(elementId, { verbose: false });
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText: string) => {
          if (scannedRef.current) return;
          scannedRef.current = true;
          onScanRef.current(decodedText);
        },
        () => {
          /* per-frame decode miss — expected, ignore */
        },
      )
      .catch(() => {
        if (cancelled) return;
        const msg =
          "Kamera tidak dapat diakses. Pastikan Anda mengizinkan akses kamera di browser, lalu coba lagi.";
        setCamError(msg);
        onErrorRef.current?.(msg);
      });

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {
            /* already stopped */
          });
      }
    };
  }, [elementId]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <div
          id={elementId}
          data-testid="qr-scanner-viewport"
          className="w-full overflow-hidden rounded-2xl bg-black [&_video]:rounded-2xl [&_video]:[transform:scaleX(-1)]"
          style={{ minHeight: 220 }}
        />
        {/* Emerald corner brackets overlay */}
        {!camError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-56 w-56 max-w-[80%]">
              <div className="absolute -top-1 -left-1 h-7 w-7 rounded-tl-lg border-t-4 border-l-4 border-emerald-400" />
              <div className="absolute -top-1 -right-1 h-7 w-7 rounded-tr-lg border-t-4 border-r-4 border-emerald-400" />
              <div className="absolute -bottom-1 -left-1 h-7 w-7 rounded-bl-lg border-b-4 border-l-4 border-emerald-400" />
              <div className="absolute -bottom-1 -right-1 h-7 w-7 rounded-br-lg border-b-4 border-r-4 border-emerald-400" />
            </div>
          </div>
        )}
      </div>
      {camError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p className="text-xs leading-relaxed text-red-700">{camError}</p>
        </div>
      )}
    </div>
  );
}
