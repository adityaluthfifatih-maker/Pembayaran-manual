import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, usersTable } from "@workspace/db";
import {
  SESSION_COOKIE,
  createSession,
  deleteSession,
  getSessionUser,
  sessionCookieOptions,
  toAuthUser,
} from "../lib/auth";
import { kycUpload } from "../lib/upload";

const router: IRouter = Router();

const roleSchema = z.enum(["pekerja", "perusahaan"]);

// Optional employer/worker sub-fields kept in the `profile` JSON blob.
const profileSchema = z
  .object({
    googleAvatar: z.string(),
    namaPerusahaan: z.string(),
    nibPerusahaan: z.string(),
    tipeAkun: z.enum(["perusahaan", "agensi"]),
    employerCategory: z.enum(["corporate", "household", "political"]),
    npwpPerusahaan: z.string(),
    namaKtp: z.string(),
    alamat: z.string(),
    namaOrganisasi: z.string(),
    kodeWilayah: z.string(),
    nik: z.string(),
    npwp: z.string(),
    hasNpwp: z.boolean(),
  })
  .partial();

const registerBody = z
  .object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(1),
    role: roleSchema,
    whatsapp: z.string().optional(),
    linkedWithGoogle: z.boolean().optional(),
  })
  .and(profileSchema);

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// A stable demo Google identity so the "Lanjutkan dengan Google" button creates
// a real, persistent account without wiring full OAuth.
const googleBody = z.object({
  role: roleSchema.optional(),
});
const DEMO_GOOGLE_EMAIL = "demo.google@rekhastha.app";
const DEMO_GOOGLE_NAME = "Pengguna Google";

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = registerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password, name, role, whatsapp, linkedWithGoogle, ...profile } =
    parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail));
  if (existing) {
    res.status(409).json({ error: "Email sudah terdaftar." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db
    .insert(usersTable)
    .values({
      id: `user-${randomUUID()}`,
      email: normalizedEmail,
      passwordHash,
      name: name.trim(),
      role,
      whatsapp: whatsapp?.trim() || null,
      linkedWithGoogle: linkedWithGoogle ?? false,
      profile,
    })
    .returning();

  const token = await createSession(user.id);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  res.status(201).json(toAuthUser(user));
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = loginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail));

  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: "Email atau password salah." });
    return;
  }

  if (user.suspended) {
    res.status(403).json({
      error: "Akun Anda telah ditangguhkan oleh Admin Rekhastha. Hubungi dukungan.",
    });
    return;
  }

  const token = await createSession(user.id);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  res.json(toAuthUser(user));
});

router.post("/auth/google", async (req, res): Promise<void> => {
  const parsed = googleBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, DEMO_GOOGLE_EMAIL));

  if (existing) {
    if (existing.suspended) {
      res.status(403).json({
        error: "Akun Anda telah ditangguhkan oleh Admin Rekhastha. Hubungi dukungan.",
      });
      return;
    }
    const token = await createSession(existing.id);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    res.json(toAuthUser(existing));
    return;
  }

  // First-time Google login needs a role; the client shows the role modal.
  if (!parsed.data.role) {
    res.status(422).json({ error: "role_required" });
    return;
  }

  const passwordHash = await bcrypt.hash(randomUUID(), 10);
  const [user] = await db
    .insert(usersTable)
    .values({
      id: `google-${randomUUID()}`,
      email: DEMO_GOOGLE_EMAIL,
      passwordHash,
      name: DEMO_GOOGLE_NAME,
      role: parsed.data.role,
      linkedWithGoogle: true,
      profile: {
        googleAvatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(
          DEMO_GOOGLE_NAME,
        )}&background=4285F4&color=fff&size=64`,
      },
    })
    .returning();

  const token = await createSession(user.id);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  res.status(201).json(toAuthUser(user));
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  await deleteSession(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.status(204).end();
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (user.suspended) {
    await deleteSession(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(403).json({
      error: "Akun Anda telah ditangguhkan oleh Admin Rekhastha. Hubungi dukungan.",
    });
    return;
  }
  res.json(toAuthUser(user));
});

/**
 * KYC Identity Upload — worker submits a KTP photo and a selfie-holding-KTP
 * photo. Any resubmission (e.g. after a rejection) resets verificationStatus
 * back to "pending" so it re-enters the admin moderation queue.
 */
router.post(
  "/auth/kyc",
  kycUpload.fields([
    { name: "ktpPhoto", maxCount: 1 },
    { name: "selfieWithKtp", maxCount: 1 },
  ]),
  async (req, res): Promise<void> => {
    const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
    if (!user) {
      res.status(401).json({ error: "Tidak terautentikasi." });
      return;
    }

    const files = req.files as
      | Record<string, Express.Multer.File[] | undefined>
      | undefined;
    const ktpFile = files?.["ktpPhoto"]?.[0];
    const selfieFile = files?.["selfieWithKtp"]?.[0];

    if (!ktpFile && !selfieFile) {
      res.status(400).json({
        error: "Unggah minimal satu dokumen (Foto KTP atau Selfie dengan KTP). Format JPG/PNG, maks 5MB.",
      });
      return;
    }

    const updates: Partial<typeof usersTable.$inferInsert> = {
      verificationStatus: "pending",
    };
    if (ktpFile) updates.ktpPhotoUrl = `/api/uploads/kyc/${ktpFile.filename}`;
    if (selfieFile) updates.selfieWithKtpUrl = `/api/uploads/kyc/${selfieFile.filename}`;

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, user.id))
      .returning();

    req.log.info({ userId: user.id }, "Worker submitted KYC documents");
    res.json(toAuthUser(updated));
  },
);

export default router;
