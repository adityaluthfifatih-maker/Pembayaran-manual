import type { JobCategory } from "./escrow";

/**
 * Flat-rate + freemium pricing model (replaces the old 3%/5%/8% commission).
 * Reguler posting/applying is always free. Instan Kilat postings pay a flat
 * price per category. Mirrors artifacts/api-server/src/lib/pricing.ts — keep
 * both in sync.
 */
export const INSTANT_PRICE_BY_CATEGORY: Record<JobCategory, number> = {
  umum: 35000,
  terampil: 49000,
  profesional: 75000,
};

export const SUBSCRIPTION_PRICE_MONTHLY = 149000;

export const FREE_APPLICANT_LIMIT = 3;

export function getInstantPrice(category: JobCategory): number {
  return INSTANT_PRICE_BY_CATEGORY[category] ?? INSTANT_PRICE_BY_CATEGORY.umum;
}
