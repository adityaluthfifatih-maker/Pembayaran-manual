import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "./auth";

/**
 * "Rekhastha Bisnis" premium gate for employee-management tools (GPS
 * attendance QR + daily wage calculator). Never gates job posting.
 *
 * Reads isPremium/expiredAt straight off the users row (companies ARE users
 * with role "perusahaan" in this schema). If the account is flagged premium
 * but its expiry has already passed, this function lazily flips isPremium
 * back to false and persists that before returning — so a single read call
 * is enough to keep the flag honest without a separate cron/sweep job.
 */
export async function checkPremiumStatus(companyId: string): Promise<boolean> {
  const [company] = await db
    .select({ isPremium: usersTable.isPremium, expiredAt: usersTable.expiredAt })
    .from(usersTable)
    .where(eq(usersTable.id, companyId))
    .limit(1);

  if (!company || !company.isPremium) return false;

  const expired = !company.expiredAt || company.expiredAt.getTime() < Date.now();
  if (expired) {
    await db
      .update(usersTable)
      .set({ isPremium: false })
      .where(eq(usersTable.id, companyId));
    return false;
  }

  return true;
}

/**
 * Express middleware wrapper around checkPremiumStatus for routes that back
 * employee-management tools. Requires an authenticated employer session;
 * responds 402 (Payment Required) with a paywall message when the account
 * isn't an active Rekhastha Bisnis subscriber.
 */
export async function requirePremium(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "perusahaan") {
    res.status(403).json({ error: "Hanya pemberi kerja yang dapat mengakses fitur ini." });
    return;
  }

  const isPremium = await checkPremiumStatus(user.id);
  if (!isPremium) {
    res.status(402).json({
      error: "Fitur ini khusus pelanggan Rekhastha Bisnis.",
      code: "PREMIUM_REQUIRED",
      message:
        "Berlangganan Rekhastha Bisnis untuk akses gratis & tanpa batas ke Absensi GPS Digital dan Kalkulator Gaji Harian.",
    });
    return;
  }

  (req as Request & { premiumUser: typeof user }).premiumUser = user;
  next();
}
