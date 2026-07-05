import { AuthUser, UserRole } from "@/types/auth";

/**
 * Real authentication client. Talks to the api-server auth endpoints and relies
 * on an httpOnly session cookie (set by the server) — so `credentials: "include"`
 * is required on every call for the cookie to be sent/stored.
 *
 * The web app is served at `/`, so a root-relative `/api` base is correct (this
 * mirrors `central-server.ts`).
 */
const API_BASE = "/api";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AuthError(
      (data as { error?: string }).error ?? "Terjadi kesalahan.",
      res.status,
    );
  }
  return data as T;
}

export type RegisterPayload = Omit<AuthUser, "id" | "linkedWithGoogle"> & {
  password: string;
};

export function register(payload: RegisterPayload): Promise<AuthUser> {
  return request<AuthUser>("/auth/register", payload);
}

export function login(email: string, password: string): Promise<AuthUser> {
  return request<AuthUser>("/auth/login", { email, password });
}

/**
 * Demo Google login. First-ever call has no account yet and the server responds
 * 422 `role_required`; the caller then re-invokes with a chosen role.
 */
export function loginWithGoogle(role?: UserRole): Promise<AuthUser> {
  return request<AuthUser>("/auth/google", role ? { role } : {});
}

/**
 * Best-effort logout. The UI clears local state optimistically, so this must not
 * throw; it retries once (with `keepalive` so it survives teardown) to minimise
 * the chance of an orphaned server session that `/me` would later restore.
 */
export async function logout(): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
        keepalive: true,
      });
      if (res.ok) return;
    } catch {
      // retry
    }
  }
}

export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
  if (!res.ok) return null;
  return (await res.json()) as AuthUser;
}

/**
 * Submit KYC documents (KTP photo and/or selfie-with-KTP). Either or both
 * files may be provided; the server resets verificationStatus to "pending".
 */
export async function submitKyc(files: {
  ktpPhoto?: File;
  selfieWithKtp?: File;
}): Promise<AuthUser> {
  const form = new FormData();
  if (files.ktpPhoto) form.append("ktpPhoto", files.ktpPhoto);
  if (files.selfieWithKtp) form.append("selfieWithKtp", files.selfieWithKtp);

  const res = await fetch(`${API_BASE}/auth/kyc`, {
    method: "POST",
    credentials: "include",
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AuthError((data as { error?: string }).error ?? "Gagal mengunggah dokumen.", res.status);
  }
  return data as AuthUser;
}

/**
 * Upload the worker's master CV/Portfolio to their profile (.pdf, max 10MB).
 * These become the default files auto-attached to Regular applications.
 */
export async function submitDocuments(files: {
  cv?: File;
  portfolio?: File;
}): Promise<AuthUser> {
  const form = new FormData();
  if (files.cv) form.append("cv", files.cv);
  if (files.portfolio) form.append("portfolio", files.portfolio);

  const res = await fetch(`${API_BASE}/auth/documents`, {
    method: "POST",
    credentials: "include",
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AuthError((data as { error?: string }).error ?? "Gagal mengunggah berkas.", res.status);
  }
  return data as AuthUser;
}

/**
 * Upload a CV/Portfolio for one specific application (Regular apply-modal
 * "unggah berkas baru khusus untuk lowongan ini" choice). Returns the stored
 * URLs to pass into `postApplication` as `submittedCvUrl`/`submittedPortfolioUrl`.
 */
export async function uploadApplicationDocuments(files: {
  cv?: File;
  portfolio?: File;
}): Promise<{ cvUrl?: string; portfolioUrl?: string }> {
  const form = new FormData();
  if (files.cv) form.append("cv", files.cv);
  if (files.portfolio) form.append("portfolio", files.portfolio);

  const res = await fetch(`${API_BASE}/applications/documents/upload`, {
    method: "POST",
    credentials: "include",
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AuthError((data as { error?: string }).error ?? "Gagal mengunggah berkas.", res.status);
  }
  return data as { cvUrl?: string; portfolioUrl?: string };
}
