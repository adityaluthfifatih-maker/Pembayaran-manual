/**
 * Rekhastha operator-onboarding academy. Questions are stored in the database
 * so admins can edit them without a redeploy. The correct answers never leave
 * the backend: the client receives questions + options only, submits picks, and
 * the server scores them. On first boot the DB is seeded from the built-in set.
 */
import { asc, eq } from "drizzle-orm";
import { db, academyQuestionsTable, academySettingsTable } from "@workspace/db";

// ── Seed bank (server-only; never exported) ───────────────────────────────
interface SeedQuestion {
  id: string;
  category: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

const SEED_QUESTIONS: SeedQuestion[] = [
  {
    id: "escrow-split",
    category: "Escrow",
    prompt:
      "Berapa persen dana tambahan yang dikunci pemberi kerja di atas upah pekerja sebagai komisi platform?",
    options: ["5%", "10%", "15%", "20%"],
    correctIndex: 2,
    explanation:
      "Total setoran = upah pekerja × 1,15. Pekerja menerima 100% upah, platform mengambil 15% sebagai komisi.",
  },
  {
    id: "escrow-release",
    category: "Escrow",
    prompt: "Kapan dana escrow dilepas ke pekerja?",
    options: [
      "Segera setelah gig diposting",
      "Setelah pekerja presensi pulang (shift selesai)",
      "Setelah pemberi kerja membayar biaya bulanan",
      "Setiap awal bulan secara otomatis",
    ],
    correctIndex: 1,
    explanation:
      "Escrow dilepas ketika shift selesai — dipicu oleh presensi pulang atau force-release oleh admin.",
  },
  {
    id: "broadcast-type",
    category: "Broadcast",
    prompt:
      "Jenis gig manakah yang memicu chime dan notifikasi OS instan pada perangkat pekerja terdekat?",
    options: [
      "Posting Reguler (terjadwal)",
      "Broadcast Instan (cepat)",
      "Kedua-duanya",
      "Tidak ada, semua senyap",
    ],
    correctIndex: 1,
    explanation:
      "Hanya gig cepat (Broadcast Instan) yang berbunyi. Gig terjadwal tampil di feed dengan pin ungu namun tetap senyap.",
  },
  {
    id: "attendance-identity",
    category: "Presensi",
    prompt: "Dari mana sistem mengambil identitas saat memproses presensi QR?",
    options: [
      "Dari data yang dikirim di body permintaan",
      "Dari sesi login pekerja (bukan body)",
      "Dari nomor WhatsApp yang diketik manual",
      "Dari nama perusahaan pemberi kerja",
    ],
    correctIndex: 1,
    explanation:
      "Identitas selalu diturunkan dari sesi login, bukan dari body, agar token presensi tidak bisa dipalsukan.",
  },
  {
    id: "blacklist-effect",
    category: "Blacklist",
    prompt:
      "Apa yang terjadi pada feed pekerja setelah ia di-blacklist oleh seorang pemberi kerja?",
    options: [
      "Akun pekerja langsung disuspend",
      "Semua gig dari pemberi kerja itu disembunyikan dari feed pekerja",
      "Pekerja tidak bisa login lagi",
      "Tidak ada efek, hanya catatan internal",
    ],
    correctIndex: 1,
    explanation:
      "Blacklist menyembunyikan setiap gig (pin + kartu) yang diposting pemberi kerja tersebut dari perangkat pekerja.",
  },
  {
    id: "suspend-effect",
    category: "Moderasi",
    prompt: "Apa fungsi tombol Suspend pada tab Pengguna & Blacklist?",
    options: [
      "Menghapus akun pengguna secara permanen",
      "Mengunci pengguna agar tidak bisa mengakses platform",
      "Mereset kata sandi pengguna",
      "Menaikkan rating pengguna",
    ],
    correctIndex: 1,
    explanation:
      "Suspend mengunci pengguna dari platform tanpa menghapus datanya; bisa dibuka kembali kapan saja.",
  },
  {
    id: "wage-model",
    category: "Upah",
    prompt: "Manakah kategori pembayaran yang TIDAK didukung Rekhastha?",
    options: ["Per hari", "Per proyek", "Per jam", "Per shift"],
    correctIndex: 2,
    explanation:
      "Rekhastha memakai 4 kategori upah dengan model flat; pembayaran per jam tidak digunakan.",
  },
  {
    id: "sync-model",
    category: "Realtime",
    prompt: "Bagaimana gig baru tersinkron ke seluruh perangkat pekerja?",
    options: [
      "Melalui email berkala",
      "Melalui WebSocket fan-out dari server",
      "Pekerja harus refresh halaman manual",
      "Melalui SMS",
    ],
    correctIndex: 1,
    explanation:
      "Gig disimpan di Postgres lalu di-fan-out lewat WebSocket, sehingga feed setiap perangkat langsung terbarui.",
  },
];

// ── Lazy DB seeding ───────────────────────────────────────────────────────
let _seeded = false;

async function ensureSeeded(): Promise<void> {
  if (_seeded) return;
  const existing = await db
    .select({ id: academyQuestionsTable.id })
    .from(academyQuestionsTable)
    .limit(1);
  if (existing.length === 0) {
    await db.insert(academyQuestionsTable).values(
      SEED_QUESTIONS.map((q, i) => ({
        slug: q.id,
        category: q.category,
        prompt: q.prompt,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        sortOrder: i,
      })),
    );
  }
  _seeded = true;
}

// ── Settings ──────────────────────────────────────────────────────────────

export const DEFAULT_PASSING_SCORE = 80;

/** Read passing score from DB settings row (upserts default on first call). */
export async function getPassingScore(): Promise<number> {
  const [row] = await db
    .select()
    .from(academySettingsTable)
    .where(eq(academySettingsTable.id, 1));
  return row?.passingScore ?? DEFAULT_PASSING_SCORE;
}

/** Persist a new passing score (must be 1–100). */
export async function setPassingScore(score: number): Promise<void> {
  await db
    .insert(academySettingsTable)
    .values({ id: 1, passingScore: score })
    .onConflictDoUpdate({
      target: academySettingsTable.id,
      set: { passingScore: score },
    });
}

// ── Client-safe questions ─────────────────────────────────────────────────

export interface ClientAcademyQuestion {
  id: string;
  category: string;
  prompt: string;
  options: string[];
}

/** Questions without correct answers — safe to send to the browser. */
export async function toClientQuestions(): Promise<ClientAcademyQuestion[]> {
  await ensureSeeded();
  const rows = await db
    .select()
    .from(academyQuestionsTable)
    .orderBy(
      asc(academyQuestionsTable.sortOrder),
      asc(academyQuestionsTable.id),
    );
  return rows.map((r) => ({
    id: r.slug,
    category: r.category,
    prompt: r.prompt,
    options: r.options as string[],
  }));
}

/** Full question rows including correct answers — for the admin editor only. */
export async function getAllQuestionsForAdmin() {
  await ensureSeeded();
  return db
    .select()
    .from(academyQuestionsTable)
    .orderBy(
      asc(academyQuestionsTable.sortOrder),
      asc(academyQuestionsTable.id),
    );
}

// ── Scoring ───────────────────────────────────────────────────────────────

export interface ScoredAnswer {
  questionId: string;
  selectedIndex: number;
  correctIndex: number;
  correct: boolean;
  explanation: string;
}

export interface ScoreResult {
  correct: number;
  total: number;
  score: number;
  passed: boolean;
  answers: ScoredAnswer[];
}

/** Score a submitted answer set against the DB-backed question bank. */
export async function scoreQuiz(
  submitted: { questionId: string; selectedIndex: number }[],
): Promise<ScoreResult> {
  await ensureSeeded();
  const [questions, threshold] = await Promise.all([
    db
      .select()
      .from(academyQuestionsTable)
      .orderBy(
        asc(academyQuestionsTable.sortOrder),
        asc(academyQuestionsTable.id),
      ),
    getPassingScore(),
  ]);

  const picks = new Map(submitted.map((a) => [a.questionId, a.selectedIndex]));
  const answers: ScoredAnswer[] = questions.map((q) => {
    const selectedIndex = picks.get(q.slug) ?? -1;
    return {
      questionId: q.slug,
      selectedIndex,
      correctIndex: q.correctIndex,
      correct: selectedIndex === q.correctIndex,
      explanation: q.explanation,
    };
  });
  const correct = answers.filter((a) => a.correct).length;
  const total = questions.length;
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, total, score, passed: score >= threshold, answers };
}
