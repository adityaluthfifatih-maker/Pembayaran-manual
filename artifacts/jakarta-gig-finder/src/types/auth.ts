export type UserRole = "pekerja" | "perusahaan";
export type TipeAkun = "perusahaan" | "agensi";
export type EmployerCategory = "corporate" | "household" | "political";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  whatsapp?: string;
  role: UserRole;
  linkedWithGoogle: boolean;
  googleAvatar?: string;
  // Company extra
  namaPerusahaan?: string;
  nibPerusahaan?: string;
  tipeAkun?: TipeAkun;
  // Employer registration sub-category (Perusahaan)
  employerCategory?: EmployerCategory;
  npwpPerusahaan?: string;
  namaKtp?: string;
  alamat?: string;
  namaOrganisasi?: string;
  kodeWilayah?: string;
  // Worker extra (mirrors WorkerProfile)
  nik?: string;
  npwp?: string;
  hasNpwp?: boolean;
}

export const DEMO_WORKER: AuthUser = {
  id: "demo-worker-001",
  name: "Budi Santoso",
  email: "budi.santoso@gmail.com",
  whatsapp: "08123456789",
  role: "pekerja",
  linkedWithGoogle: true,
  nik: "3175011502900001",
  npwp: "123456789012345",
  hasNpwp: true,
};

export const DEMO_COMPANY: AuthUser = {
  id: "demo-company-001",
  name: "PT Kopi Kenangan",
  email: "hr@kopikenangan.com",
  whatsapp: "02112345678",
  role: "perusahaan",
  linkedWithGoogle: false,
  namaPerusahaan: "PT Kopi Kenangan",
  nibPerusahaan: "1234567890123",
  tipeAkun: "perusahaan",
};
