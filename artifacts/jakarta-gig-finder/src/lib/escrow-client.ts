const API_BASE = "/api";

export class EscrowError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new EscrowError(
      (data as { error?: string }).error ?? "Terjadi kesalahan.",
      res.status
    );
  }
  return data as T;
}

export type EscrowProject = {
  id: number;
  employerId: string;
  workerId: string | null;
  title: string;
  description: string;
  totalAmount: number;
  status: "draft" | "pending_payment" | "funded" | "completed" | "expired";
  xenditInvoiceId: string | null;
  xenditExternalId: string | null;
  xenditInvoiceUrl: string | null;
  fundedAt: string | null;
  createdAt: string;
};

export type EscrowMilestone = {
  id: number;
  projectId: number;
  title: string;
  percentage: number;
  amount: number;
  sortOrder: number;
  status: "pending" | "disbursed" | "failed";
  xenditDisbursementId: string | null;
  disbursedAt: string | null;
  createdAt: string;
};

export type EscrowProjectWithMilestones = EscrowProject & { milestones: EscrowMilestone[] };

export function createEscrowProject(data: {
  title: string;
  description: string;
  totalAmount: number;
  workerId?: string;
  milestones: { title: string; percentage: number }[];
}) {
  return request<EscrowProjectWithMilestones>("/escrow-projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function fetchEscrowProjects() {
  return request<EscrowProject[]>("/escrow-projects");
}

export function fetchEscrowProject(id: number) {
  return request<EscrowProjectWithMilestones>(`/escrow-projects/${id}`);
}

export function lockEscrowProject(id: number) {
  return request<EscrowProject>(`/escrow-projects/${id}/lock`, { method: "POST" });
}

export function simulatePaidEscrowProject(id: number) {
  return request<{ ok: boolean; message: string }>(`/escrow-projects/${id}/simulate-paid`, { method: "POST" });
}

export function approveMilestone(projectId: number, milestoneId: number) {
  return request<{ milestone: EscrowMilestone; projectCompleted: boolean }>(
    `/escrow-projects/${projectId}/milestones/${milestoneId}/approve`,
    { method: "POST" }
  );
}
