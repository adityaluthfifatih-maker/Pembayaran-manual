export interface CompanyBranch {
  id: number;
  companyId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCompanyBranchInput {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return new Error(body?.error || fallback);
}

export async function listCompanyBranches(): Promise<CompanyBranch[]> {
  const response = await fetch("/api/company/branches", { cache: "no-store" });
  if (!response.ok) {
    throw await readError(response, "Gagal memuat cabang perusahaan.");
  }
  return (await response.json()) as CompanyBranch[];
}

export async function createCompanyBranch(
  input: CreateCompanyBranchInput,
): Promise<CompanyBranch> {
  const response = await fetch("/api/company/branches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await readError(response, "Gagal menambahkan cabang.");
  }
  return (await response.json()) as CompanyBranch;
}

export async function archiveCompanyBranch(id: number): Promise<void> {
  const response = await fetch(`/api/company/branches/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw await readError(response, "Gagal menonaktifkan cabang.");
  }
}