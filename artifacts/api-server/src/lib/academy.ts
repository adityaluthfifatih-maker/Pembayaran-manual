/**
 * Rekhastha operator-onboarding academy. The question bank is a server-side
 * seed so the correct answers never leave the backend: the client receives
 * questions with their options only, submits its picks, and the server scores
 * them. Completions are persisted per admin id (see `academyCompletionsTable`).
 */
export interface AcademyQuestion {
  id: string;
  category: string;
  prompt: string;
  options: string[];
  /** Index into `options` of the correct answer. Never sent to the client. */
  correctIndex: number;
  explanation: string;
}

/** Percentage of correct answers required to pass the assessment. */
export const PASSING_SCORE = 80;

export const ACADEMY_QUESTIONS: AcademyQuestion[] = [
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

export interface ClientAcademyQuestion {
  id: string;
  category: string;
  prompt: string;
  options: string[];
}

/** Strip correct answers/explanations before sending questions to the client. */
export function toClientQuestions(): ClientAcademyQuestion[] {
  return ACADEMY_QUESTIONS.map(({ id, category, prompt, options }) => ({
    id,
    category,
    prompt,
    options,
  }));
}

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
  score: number; // percentage, rounded
  passed: boolean;
  answers: ScoredAnswer[];
}

/** Score a set of submitted answers against the seed bank. */
export function scoreQuiz(
  submitted: { questionId: string; selectedIndex: number }[],
): ScoreResult {
  const picks = new Map(submitted.map((a) => [a.questionId, a.selectedIndex]));
  const answers: ScoredAnswer[] = ACADEMY_QUESTIONS.map((q) => {
    const selectedIndex = picks.get(q.id) ?? -1;
    return {
      questionId: q.id,
      selectedIndex,
      correctIndex: q.correctIndex,
      correct: selectedIndex === q.correctIndex,
      explanation: q.explanation,
    };
  });
  const correct = answers.filter((a) => a.correct).length;
  const total = ACADEMY_QUESTIONS.length;
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, total, score, passed: score >= PASSING_SCORE, answers };
}
