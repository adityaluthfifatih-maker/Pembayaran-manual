export interface WorkerProfile {
  namaLengkap: string;
  nik: string;
  tempatLahir: string;
  tanggalLahir: string;
  jenisKelamin: "L" | "P";
  whatsapp: string;
  npwp: string;
  belumPunyaNpwp: boolean;
  namaBank: string;
  nomorRekening: string;
  namaRekening: string;
  ktpUploaded: boolean;
  selfieUploaded: boolean;
}

export function isVerified(profile: WorkerProfile): boolean {
  return (
    !!profile.namaLengkap &&
    profile.nik.length === 16 &&
    (profile.belumPunyaNpwp || profile.npwp.length >= 15) &&
    !!profile.nomorRekening &&
    profile.ktpUploaded &&
    profile.selfieUploaded
  );
}

export function pph21Rate(profile: WorkerProfile): number {
  return profile.belumPunyaNpwp ? 0.06 : 0.05;
}

export const bankOptions = [
  "BCA", "BRI", "BNI", "Mandiri", "CIMB Niaga", "Bank Syariah Indonesia",
  "GoPay", "OVO", "Dana", "ShopeePay", "SeaBank",
];
