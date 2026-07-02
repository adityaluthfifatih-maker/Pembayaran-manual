import { useState } from "react";
import { Eye, EyeOff, Mail, Lock, User, Phone, ArrowRight, ShieldCheck, Building2, Home, Landmark, MapPin, IdCard, FileText } from "lucide-react";
import { AuthUser, UserRole, EmployerCategory } from "@/types/auth";
import RoleSelectModal from "@/components/role-select-modal";
import TermsModal from "@/components/terms-modal";
import { RekhasthaLogo } from "@/components/rekhastha-logo";

interface AuthPageProps {
  onComplete: (user: AuthUser) => void;
}

type AuthTab = "masuk" | "daftar";

let uidCounter = 1;

export default function AuthPage({ onComplete }: AuthPageProps) {
  const [tab, setTab] = useState<AuthTab>("masuk");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Employer registration sub-category state (Daftar as Perusahaan)
  const [isEmployer, setIsEmployer] = useState(false);
  const [employerCategory, setEmployerCategory] = useState<EmployerCategory>("corporate");
  // Corporate
  const [namaPerusahaan, setNamaPerusahaan] = useState("");
  const [npwpPerusahaan, setNpwpPerusahaan] = useState("");
  // Rumah Tangga / Individu
  const [namaKtp, setNamaKtp] = useState("");
  const [alamat, setAlamat] = useState("");
  // Organisasi Politik
  const [namaOrganisasi, setNamaOrganisasi] = useState("");
  const [kodeWilayah, setKodeWilayah] = useState("");

  // Role selection state
  const [pendingUser, setPendingUser] = useState<Omit<AuthUser, "role"> | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const triggerRoleSelect = (partial: Omit<AuthUser, "role">) => {
    setPendingUser(partial);
    setShowRoleModal(true);
  };

  const handleRoleSelected = (role: UserRole) => {
    if (!pendingUser) return;
    setShowRoleModal(false);
    onComplete({ ...pendingUser, role });
  };

  const handleConventional = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.includes("@")) { setError("Email tidak valid."); return; }
    if (password.length < 6) { setError("Password minimal 6 karakter."); return; }
    if (tab === "daftar" && !name.trim()) { setError("Nama akun wajib diisi."); return; }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      const employerFields =
        tab === "daftar" && isEmployer ? buildEmployerFields() : {};
      triggerRoleSelect({
        id: `user-${++uidCounter}`,
        name: tab === "daftar" ? name.trim() : email.split("@")[0],
        email,
        whatsapp: whatsapp || undefined,
        linkedWithGoogle: false,
        ...employerFields,
      });
    }, 900);
  };

  const buildEmployerFields = (): Partial<AuthUser> => {
    switch (employerCategory) {
      case "corporate":
        return {
          employerCategory,
          namaPerusahaan: namaPerusahaan.trim() || undefined,
          npwpPerusahaan: npwpPerusahaan.trim() || undefined,
        };
      case "household":
        return {
          employerCategory,
          namaKtp: namaKtp.trim() || undefined,
          alamat: alamat.trim() || undefined,
        };
      case "political":
        return {
          employerCategory,
          namaOrganisasi: namaOrganisasi.trim() || undefined,
          kodeWilayah: kodeWilayah.trim() || undefined,
        };
    }
  };

  const handleGoogle = () => {
    setLoading(true);
    const googleNames = ["Andi Pratama", "Sari Dewi", "Rizky Firmansyah", "Mega Putri", "Doni Setiawan"];
    const googleName = googleNames[Math.floor(Math.random() * googleNames.length)];
    const googleEmail = googleName.toLowerCase().replace(" ", ".") + "@gmail.com";
    setTimeout(() => {
      setLoading(false);
      triggerRoleSelect({
        id: `google-${++uidCounter}`,
        name: googleName,
        email: googleEmail,
        linkedWithGoogle: true,
        googleAvatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(googleName)}&background=4285F4&color=fff&size=64`,
      });
    }, 1100);
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden" style={{ background: "#F8FAFC" }}>

      {/* ── Top brand strip ──────────────────────────────── */}
      <div
        className="flex-shrink-0 flex flex-col items-center justify-end pb-7 pt-12 px-6"
        style={{
          background: "linear-gradient(160deg, #065F46 0%, #059669 55%, #10B981 100%)",
          borderBottomLeftRadius: "32px",
          borderBottomRightRadius: "32px",
        }}
      >
        <div className="mb-2">
          <RekhasthaLogo size={44} variant="light" showSubtitle wordmarkClassName="text-2xl" />
        </div>
        <p className="text-sm text-emerald-100 text-center leading-relaxed">
          Platform kerja harian terpercaya Jakarta<br />
          <span className="font-semibold text-white">15.000+ Pekerja · 3.000+ Perusahaan</span>
        </p>
      </div>

      {/* ── Form card ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 pt-6 pb-8">

        {/* Tab switcher */}
        <div className="flex bg-gray-100 p-1 rounded-2xl mb-5">
          <button onClick={() => { setTab("masuk"); setError(null); }}
            className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${tab === "masuk" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
            Masuk
          </button>
          <button onClick={() => { setTab("daftar"); setError(null); }}
            className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${tab === "daftar" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
            Daftar Baru
          </button>
        </div>

        {/* Google button */}
        <button
          onClick={handleGoogle} disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 rounded-2xl py-3.5 mb-4 hover:shadow-md active:scale-[0.98] transition-all"
          style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}
        >
          {/* Google G logo */}
          <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
            <path d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" fill="#FFC107"/>
            <path d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" fill="#FF3D00"/>
            <path d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" fill="#4CAF50"/>
            <path d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" fill="#1976D2"/>
          </svg>
          <span className="text-sm font-semibold text-gray-700">Lanjutkan dengan Google</span>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">atau</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Form */}
        <form onSubmit={handleConventional} className="space-y-3">
          {tab === "daftar" && (
            <InputField icon={<User className="w-4 h-4" />} type="text" placeholder="Nama Akun Lengkap"
              value={name} onChange={setName} />
          )}
          <InputField icon={<Mail className="w-4 h-4" />} type="email" placeholder="Alamat Email"
            value={email} onChange={setEmail} />
          {tab === "daftar" && (
            <InputField icon={<Phone className="w-4 h-4" />} type="tel" placeholder="Nomor WhatsApp (opsional)"
              value={whatsapp} onChange={setWhatsapp} />
          )}

          {tab === "daftar" && (
            <div className="rounded-2xl border border-gray-200 bg-white px-3.5 py-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isEmployer}
                  onChange={(e) => setIsEmployer(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600"
                  data-testid="checkbox-employer"
                />
                <span className="text-xs font-semibold text-gray-700">
                  Saya mendaftar sebagai Pemberi Kerja (Perusahaan / Individu / Organisasi)
                </span>
              </label>

              {isEmployer && (
                <div className="mt-3 space-y-3">
                  <p className="text-[11px] font-semibold text-gray-500 px-0.5">Kategori Pemberi Kerja</p>
                  <div className="grid grid-cols-3 gap-2">
                    <CategoryRadio
                      icon={<Building2 className="w-4 h-4" />}
                      label="Corporate"
                      selected={employerCategory === "corporate"}
                      onClick={() => setEmployerCategory("corporate")}
                      testId="radio-corporate"
                    />
                    <CategoryRadio
                      icon={<Home className="w-4 h-4" />}
                      label="Rumah Tangga"
                      selected={employerCategory === "household"}
                      onClick={() => setEmployerCategory("household")}
                      testId="radio-household"
                    />
                    <CategoryRadio
                      icon={<Landmark className="w-4 h-4" />}
                      label="Org. Politik"
                      selected={employerCategory === "political"}
                      onClick={() => setEmployerCategory("political")}
                      testId="radio-political"
                    />
                  </div>

                  {employerCategory === "corporate" && (
                    <div className="space-y-3" data-testid="fields-corporate">
                      <InputField icon={<Building2 className="w-4 h-4" />} type="text" placeholder="Nama PT / CV"
                        value={namaPerusahaan} onChange={setNamaPerusahaan} />
                      <InputField icon={<FileText className="w-4 h-4" />} type="text" placeholder="Nomor NPWP Perusahaan"
                        value={npwpPerusahaan} onChange={setNpwpPerusahaan} />
                    </div>
                  )}

                  {employerCategory === "household" && (
                    <div className="space-y-3" data-testid="fields-household">
                      <InputField icon={<IdCard className="w-4 h-4" />} type="text" placeholder="Nama Lengkap Sesuai KTP"
                        value={namaKtp} onChange={setNamaKtp} />
                      <InputField icon={<MapPin className="w-4 h-4" />} type="text" placeholder="Alamat"
                        value={alamat} onChange={setAlamat} />
                    </div>
                  )}

                  {employerCategory === "political" && (
                    <div className="space-y-3" data-testid="fields-political">
                      <InputField icon={<Landmark className="w-4 h-4" />} type="text" placeholder="Nama Organisasi / Sayap Partai"
                        value={namaOrganisasi} onChange={setNamaOrganisasi} />
                      <InputField icon={<MapPin className="w-4 h-4" />} type="text" placeholder="Kode Wilayah / Dapil"
                        value={kodeWilayah} onChange={setKodeWilayah} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <Lock className="w-4 h-4" />
            </span>
            <input
              type={showPass ? "text" : "password"} value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min. 6 karakter)"
              className="w-full pl-11 pr-11 py-3.5 border border-gray-200 rounded-2xl text-sm text-gray-900 placeholder-gray-400 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition-all"
              required
            />
            <button type="button" onClick={() => setShowPass((p) => !p)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-500 font-medium px-1">{error}</p>
          )}

          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-2xl mt-1 transition-all active:scale-[0.98] disabled:opacity-60"
            style={{ boxShadow: "0 4px 14px rgba(5,150,105,0.35)" }}>
            {loading
              ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <>
                  {tab === "masuk" ? "Masuk ke Rekhastha" : "Buat Akun Baru"}
                  <ArrowRight className="w-4 h-4" />
                </>
            }
          </button>
        </form>

        {/* Trust badges */}
        <div className="mt-6 flex items-center justify-center gap-4">
          {[
            { icon: "🔒", text: "Data Terenkripsi" },
            { icon: "✅", text: "Terverifikasi KTP" },
            { icon: "🛡️", text: "Escrow Terjamin" },
          ].map((b) => (
            <div key={b.text} className="flex items-center gap-1">
              <span className="text-sm">{b.icon}</span>
              <span className="text-[10px] text-gray-500 font-medium">{b.text}</span>
            </div>
          ))}
        </div>

        <p className="text-center text-[10px] text-gray-400 mt-4 leading-relaxed">
          Dengan mendaftar, Anda menyetujui{" "}
          <button
            type="button"
            data-testid="link-terms"
            onClick={() => setShowTerms(true)}
            className="text-emerald-600 font-semibold hover:underline"
          >
            Syarat & Ketentuan
          </button>{" "}
          dan{" "}
          <span className="text-emerald-600 font-semibold">Kebijakan Privasi</span> Rekhastha.
        </p>
      </div>

      {showRoleModal && (
        <RoleSelectModal onSelect={handleRoleSelected} isGoogle={pendingUser?.linkedWithGoogle ?? false} />
      )}

      {showTerms && <TermsModal onClose={() => setShowTerms(false)} />}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.animate-spin{animation:spin 1s linear infinite}`}</style>
    </div>
  );
}

function CategoryRadio({ icon, label, selected, onClick, testId }: {
  icon: React.ReactNode; label: string; selected: boolean; onClick: () => void; testId?: string;
}) {
  return (
    <button type="button" onClick={onClick} data-testid={testId}
      className={`flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-xl border-2 transition-all active:scale-[0.97] ${
        selected
          ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
      }`}>
      <span className={selected ? "text-white" : "text-emerald-500"}>{icon}</span>
      <span className="text-[10px] font-bold leading-tight text-center">{label}</span>
    </button>
  );
}

function InputField({ icon, type, placeholder, value, onChange }: {
  icon: React.ReactNode; type: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">{icon}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full pl-11 pr-4 py-3.5 border border-gray-200 rounded-2xl text-sm text-gray-900 placeholder-gray-400 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition-all"
      />
    </div>
  );
}
