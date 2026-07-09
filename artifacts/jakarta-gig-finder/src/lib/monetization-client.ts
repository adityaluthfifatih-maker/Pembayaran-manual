/**
 * Browser client for the flat-rate + freemium monetization endpoints:
 * Instan Kilat pay-per-post orders, the payment webhook (simulated gateway
 * callback), and the applicant-contact subscription paywall. Mirrors the
 * `credentials: "include"` + `/api` base pattern from auth-client.ts.
 */
const API_BASE = "/api";

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Terjadi kesalahan.");
  }
  return data as T;
}

export interface InstantOrder {
  id: number;
  jobId: number;
  companyId: string;
  amount: number;
  status: string;
  orderIdGateway: string | null;
}

export function createInstantOrder(jobId: number, category: string): Promise<InstantOrder> {
  return request<InstantOrder>("/instant-orders", "POST", { jobId, category });
}

/** Simulates the Midtrans/Xendit gateway calling back after payment succeeds. */
export function confirmInstantPayment(orderId: number): Promise<InstantOrder> {
  return request<InstantOrder>("/webhook/payment", "POST", { orderId, status: "success" });
}

export interface SubscriptionInfo {
  isPremium: boolean;
  expiresAt: string | null;
  price: number;
}

export function fetchSubscription(): Promise<SubscriptionInfo> {
  return request<SubscriptionInfo>("/subscriptions/me", "GET");
}

export function subscribePremium(): Promise<unknown> {
  return request("/subscriptions/subscribe", "POST");
}

// ── Rekhastha Bisnis (new tiered subscription system) ──────────────

export interface SubscriptionPlan {
  id: number;
  label: string;
  durationMonths: number;
  durationDays: number;
  originalPrice: number;
  promoPrice: number;
}

export interface BisnisStatus {
  isPremium: boolean;
  expiredAt: string | null;
}

export interface SubscriptionOrder {
  id: number;
  companyId: string;
  planId: number;
  amount: number;
  status: string;
  orderIdGateway: string | null;
}

export function fetchSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  return request<SubscriptionPlan[]>("/subscription-plans", "GET");
}

export function fetchBisnisStatus(): Promise<BisnisStatus> {
  return request<BisnisStatus>("/subscriptions/status", "GET");
}

export function createSubscriptionOrder(planId: number): Promise<{ order: SubscriptionOrder; plan: SubscriptionPlan }> {
  return request("/subscriptions/orders", "POST", { planId });
}

export function confirmSubscriptionPayment(orderId: number): Promise<unknown> {
  return request("/webhook/subscription-payment", "POST", { orderId, status: "success" });
}
