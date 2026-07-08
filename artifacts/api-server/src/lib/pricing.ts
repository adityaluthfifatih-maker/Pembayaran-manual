/**
 * Flat-rate + freemium pricing model.
 *
 * Replaces the old per-gig escrow/fee-tier model. Reguler postings and
 * worker applications are always free. Instan Kilat postings are pay-per-post
 * at a flat Rupiah price per category. The applicant-contact paywall (first
 * 3 applicants visible, rest masked) can be lifted with an active monthly
 * subscription.
 */
export const INSTANT_PRICE_BY_CATEGORY: Record<string, number> = {
  umum: 35000,
  terampil: 49000,
  profesional: 75000,
};

export const SUBSCRIPTION_PRICE_MONTHLY = 149000;

export const FREE_APPLICANT_LIMIT = 3;

export function getInstantPrice(category: string | null | undefined): number {
  return INSTANT_PRICE_BY_CATEGORY[category ?? "umum"] ?? INSTANT_PRICE_BY_CATEGORY.umum;
}

export function maskApplicantName(name: string): string {
  return name && name.trim() ? name : "Pelamar";
}
