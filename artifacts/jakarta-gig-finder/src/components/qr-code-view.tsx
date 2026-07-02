import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface QrCodeViewProps {
  value: string;
  size?: number;
}

/**
 * Renders a REAL, scannable QR code (via the `qrcode` library) — replacing the
 * old hand-drawn placeholder matrix. Emerald foreground keeps it on-brand while
 * staying within contrast limits scanners need.
 */
export default function QrCodeView({ value, size = 220 }: QrCodeViewProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#064e3b", light: "#ffffff" },
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="animate-pulse rounded-2xl bg-gray-100"
      />
    );
  }

  return (
    <img
      src={dataUrl}
      width={size}
      height={size}
      alt="QR Presensi Rekhastha"
      data-testid="img-attendance-qr"
      className="rounded-2xl border-4 border-emerald-900/10 bg-white p-2 shadow-lg"
    />
  );
}
