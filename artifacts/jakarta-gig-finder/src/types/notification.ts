export type ApplicationStatus = "baru" | "ditinjau" | "diterima" | "ditolak";

export interface ApplicationNotification {
  id: number;
  jobId: number;
  jobTitle: string;
  applicantName: string;
  applicantNikMasked: string;
  applicantNpwpMasked: string;
  hasNpwp: boolean;
  bank: string;
  rekening: string;
  timestamp: Date;
  status: ApplicationStatus;
}

export function maskName(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].slice(0, 2) + "***";
  return parts[0] + " " + parts.slice(1).map((p) => p[0] + "***").join(" ");
}

export function maskNik(nik: string): string {
  if (nik.length < 8) return nik;
  return nik.slice(0, 4) + "••••••••" + nik.slice(-4);
}

export function maskNpwp(npwp: string): string {
  if (!npwp || npwp.length < 4) return "—";
  return "••••••" + npwp.slice(-4);
}

export function maskRekening(rek: string): string {
  if (rek.length < 6) return rek;
  return rek.slice(0, 3) + "••••" + rek.slice(-3);
}
