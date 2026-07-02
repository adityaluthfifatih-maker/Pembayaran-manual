import { X, ShieldCheck, Briefcase, UserCheck, Scale } from "lucide-react";

interface TermsModalProps {
  onClose: () => void;
}

interface Clause {
  title: string;
  body: string;
}

const EMPLOYER_CLAUSES: Clause[] = [
  {
    title: "Validasi Data & Profiling",
    body: "Pemberi Kerja menjamin keabsahan mutlak atas seluruh data yang diunggah, mencakup NPWP untuk badan usaha (Korporat), KTP untuk pemberi kerja Rumah Tangga, serta Kode Wilayah resmi untuk Entitas Politik. Data palsu atau menyesatkan mengakibatkan pembekuan akun permanen.",
  },
  {
    title: "Kewajiban Escrow (Dana Jaminan)",
    body: "Sebelum sebuah shift dapat ditayangkan (go-live), Pemberi Kerja wajib mengamankan 100% upah pokok pekerja ditambah biaya layanan platform (7% atau 15%) ke dalam Escrow Ledger. Kontrak tidak akan aktif hingga dana jaminan terkunci penuh.",
  },
  {
    title: "Penalti Pembatalan Mendadak",
    body: "Pembatalan kontrak yang sudah terkunci dalam waktu kurang dari 1 (satu) jam sebelum jadwal mulai akan memicu penalti otomatis sebesar Rp20.000. Denda ini langsung dikreditkan ke saldo dompet (wallet) pekerja yang telah ditugaskan sebagai kompensasi.",
  },
  {
    title: "Kepatuhan Pajak Independen",
    body: "Platform secara tegas dan sepenuhnya membebaskan diri dari pemrosesan otomatis PPh maupun PPN/VAT. Seluruh pelaporan dan kewajiban perpajakan merupakan tanggung jawab hukum individual masing-masing pihak yang bertransaksi, sesuai hukum keuangan Indonesia yang berlaku.",
  },
];

const WORKER_CLAUSES: Clause[] = [
  {
    title: "KYC & Identitas",
    body: "Pekerja wajib lolos proses KYC Auto-Vetting biometrik yang cocok dengan profil KTP terdaftar. Merelokasi atau mendelegasikan tugas kepada pengganti yang tidak terverifikasi — teman atau keluarga (\"Joki Kerja\") — secara tegas dilarang.",
  },
  {
    title: "Geofence & Integrasi QR",
    body: "Shift hanya sah dimulai setelah memindai QR Code fisik di lokasi kerja dalam radius kunci Geofence 5 km yang ditentukan. Kepatuhan yang berhasil akan mengaktifkan lapisan perlindungan BPJS Ketenagakerjaan dan Asuransi Penghasilan.",
  },
  {
    title: "Sanksi Bypass Luar Platform (Zero-Tolerance)",
    body: "Bertukar kartu nama, nomor telepon/WhatsApp, atau mendorong penyelesaian tunai/perbankan langsung di luar platform akan memicu penyamaran teks otomatis (regex masking), hangusnya Jaminan Pembayaran Escrow secara instan, pembatalan asuransi, serta pemblokiran (ban) permanen dari radar platform.",
  },
  {
    title: "Perjanjian Penyelesaian Sengketa",
    body: "Kedua belah pihak setuju bahwa pengajuan keluhan melalui modul \"Ajukan Sengketa\" akan langsung membekukan kolam Escrow Ledger yang terkunci, dan memberikan tim dukungan internal Rekhastha wewenang arbitrase mediasi tunggal yang mengikat.",
  },
];

function Section({
  icon,
  label,
  clauses,
}: {
  icon: React.ReactNode;
  label: string;
  clauses: Clause[];
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <h3 className="text-sm font-bold text-gray-800 leading-tight">{label}</h3>
      </div>
      <ol className="space-y-3">
        {clauses.map((c, i) => (
          <li key={c.title} className="pl-3 border-l-2 border-emerald-100">
            <p className="text-xs font-semibold text-gray-800 mb-1">
              {i + 1}. {c.title}
            </p>
            <p className="text-[11px] text-gray-600 leading-relaxed text-justify">{c.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function TermsModal({ onClose }: TermsModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 px-5 py-4 flex items-start justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base leading-tight">Syarat & Ketentuan</h2>
              <p className="text-emerald-100 text-[11px]">Rekhastha · GigFinder</p>
            </div>
          </div>
          <button
            data-testid="button-close-terms"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 -mr-1"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          <p className="text-[11px] text-gray-500 leading-relaxed text-justify">
            Dokumen ini mengatur hubungan hukum antara seluruh pengguna platform Rekhastha (GigFinder).
            Dengan menekan tombol persetujuan, Anda menyatakan telah membaca, memahami, dan tunduk pada
            seluruh ketentuan di bawah ini.
          </p>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 mb-3">
              Bagian I · Ketentuan Penyedia Pekerjaan (Employer)
            </div>
            <Section
              icon={<Briefcase className="w-4 h-4" />}
              label="Kewajiban Pemberi Kerja"
              clauses={EMPLOYER_CLAUSES}
            />
          </div>

          <div className="border-t border-gray-100 pt-5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 mb-3">
              Bagian II · Ketentuan Mitra Pekerja (Worker)
            </div>
            <Section
              icon={<UserCheck className="w-4 h-4" />}
              label="Kewajiban Mitra Pekerja"
              clauses={WORKER_CLAUSES}
            />
          </div>

          {/* PASAL III — Pelepasan Tanggung Jawab */}
          <div className="border-t-2 border-red-200 pt-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Scale className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-black text-red-700 leading-tight uppercase">
                Pasal III: Pelepasan Tanggung Jawab Kriminal & Perdata
              </h3>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2.5">
              <p className="text-[11px] text-red-900 leading-relaxed text-justify font-semibold">
                Rekhastha bertindak semata-mata sebagai kerangka utilitas teknologi escrow
                (technological escrow utility framework). Platform memiliki imunitas hukum absolut
                dan TIDAK bertanggung jawab atas segala bentuk kelalaian di tempat kerja (workspace
                negligence), pencurian properti, maupun tindak pidana yang dilakukan oleh salah satu
                pihak di lokasi kerja.
              </p>
              <p className="text-[11px] text-red-900 leading-relaxed text-justify">
                Untuk kepentingan penegakan hukum, Rekhastha akan secara langsung menyerahkan seluruh
                profil data latar belakang KTP/NPWP yang telah terverifikasi kepada Kepolisian Negara
                Republik Indonesia (POLRI) guna proses penuntutan pidana secara langsung terhadap
                pihak yang bersangkutan.
              </p>
            </div>
          </div>
        </div>

        {/* Footer action */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          <button
            data-testid="button-agree-terms"
            onClick={onClose}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm py-3 rounded-xl transition-colors"
          >
            Saya Setuju & Paham
          </button>
        </div>
      </div>
    </div>
  );
}
