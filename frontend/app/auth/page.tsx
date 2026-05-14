"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function EyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-7-10-7a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  visible: boolean;
  onToggle: () => void;
}

function PasswordField({ id, label, value, onChange, autoComplete, visible, onToggle }: PasswordFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="text-xs uppercase tracking-wide text-cube-text/40">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          minLength={6}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg px-3 py-2.5 pr-9 text-sm text-cube-text outline-none transition-colors"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(50,93,167,0.60)"; }}
          onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; }}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={visible ? "Parolayı gizle" : "Parolayı göster"}
          className="absolute inset-y-0 right-0 flex items-center px-2.5 text-cube-text/40 transition hover:text-cube-text"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}

function toTurkishError(err: unknown): string {
  if (!(err instanceof Error)) return "Kimlik doğrulama hatası.";
  const msg = err.message.toLowerCase();
  if (msg.includes("already registered") || msg.includes("user already") || msg.includes("already exists")) {
    return "Bu e-posta adresi zaten kayıtlı.";
  }
  if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
    return "Hatalı e-posta veya şifre.";
  }
  if (msg.includes("password") && (msg.includes("at least") || msg.includes("weak"))) {
    return "Şifre en az 6 karakter olmalıdır.";
  }
  if (msg.includes("email") && (msg.includes("invalid") || msg.includes("valid"))) {
    return "Geçerli bir e-posta adresi girin.";
  }
  return err.message;
}

function validateInputs(email: string, password: string, confirmPassword: string, mode: "signin" | "signup"): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Geçerli bir e-posta adresi girin.";
  if (password.length < 6) return "Şifre en az 6 karakter olmalıdır.";
  if (mode === "signup" && password !== confirmPassword) return "Parolalar eşleşmiyor.";
  return null;
}

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "signup") {
      setMode("signup");
    }
  }, []);

  const [email, setEmail]                   = useState("");
  const [password, setPassword]             = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword]     = useState(false);
  const [showConfirm, setShowConfirm]       = useState(false);
  const [rememberMe, setRememberMe]         = useState(true);
  const [message, setMessage]               = useState<string | null>(null);
  const [isError, setIsError]               = useState(false);
  const [loading, setLoading]               = useState(false);

  function switchMode(next: "signin" | "signup") {
    setMode(next);
    setMessage(null);
    setIsError(false);
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setIsError(false);

    const validationError = validateInputs(email, password, confirmPassword, mode);
    if (validationError) {
      setMessage(validationError);
      setIsError(true);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    setLoading(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Hesabınız oluşturuldu.");
        await new Promise((r) => setTimeout(r, 700));
        router.push("/dashboard");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/dashboard");
      }
    } catch (err: unknown) {
      setMessage(toTurkishError(err));
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 py-16">

      {/* Blue ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 55% at 50% 42%, rgba(50,93,167,0.12) 0%, transparent 68%)",
        }}
      />

      {/* Back link — "Cube" orange, "Zero" white */}
      <Link
        href="/"
        className="relative z-10 mb-8 text-xs uppercase tracking-widest text-cube-text/50 transition hover:text-cube-text/80"
      >
        ←{" "}
        <span
          style={{
            color: "#f68c06",
            textShadow:
              "0 0 12px rgba(246,140,6,0.80), 0 0 28px rgba(246,140,6,0.45), 0 0 52px rgba(246,140,6,0.20)",
          }}
        >
          Cube
        </span>
        <span
          style={{
            color: "#ffffff",
            textShadow: "0 0 18px rgba(255,255,255,0.35)",
          }}
        >
          Zero
        </span>
      </Link>

      {/* Glassmorphism card */}
      <div
        className="relative w-full max-w-sm p-8"
        style={{
          background: "rgba(255,255,255,0.06)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "16px",
        }}
      >
        <header className="mb-10 text-center">
          <h1 className="text-xl font-semibold leading-snug tracking-tight text-white sm:text-[1.3125rem]">
            Hoş Geldiniz
          </h1>
          <p className="mx-auto mt-2.5 max-w-[19rem] text-xs leading-relaxed text-white/60">
            Hesabınıza güvenle erişin.
          </p>
        </header>

        {/* Mode tabs */}
        <div
          className="flex gap-2 pb-2 text-sm"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          <button
            type="button"
            onClick={() => switchMode("signin")}
            className={`flex-1 py-2 transition-colors ${
              mode === "signin"
                ? "font-medium text-white"
                : "text-cube-text/45 hover:text-cube-text/70"
            }`}
            style={
              mode === "signin"
                ? { borderBottom: "2px solid #325da7" }
                : {}
            }
          >
            Giriş
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={`flex-1 py-2 transition-colors ${
              mode === "signup"
                ? "font-medium text-white"
                : "text-cube-text/45 hover:text-cube-text/70"
            }`}
            style={
              mode === "signup"
                ? { borderBottom: "2px solid #325da7" }
                : {}
            }
          >
            Kayıt
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="email" className="text-xs uppercase tracking-wide text-cube-text/40">
              E-posta
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg px-3 py-2.5 text-sm text-cube-text outline-none transition-colors"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(50,93,167,0.60)"; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; }}
            />
          </div>

          <PasswordField
            id="password"
            label="Parola"
            value={password}
            onChange={setPassword}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            visible={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
          />

          {mode === "signup" && (
            <PasswordField
              id="confirm-password"
              label="Parolayı onayla"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              visible={showConfirm}
              onToggle={() => setShowConfirm((v) => !v)}
            />
          )}

          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-3.5 w-3.5"
              style={{ accentColor: "#325da7" }}
            />
            <span className="text-xs text-cube-text/55">Beni hatırla</span>
          </label>

          {/* Submit — blue */}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
            style={{ background: loading ? "#2a4f96" : "#325da7" }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "#2a4f96"; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = "#325da7"; }}
          >
            {loading ? "İşleniyor…" : mode === "signup" ? "Kayıt ol" : "Giriş yap"}
          </button>
        </form>

        {message && (
          <p className={`mt-4 text-xs leading-relaxed ${isError ? "text-red-400" : "text-cube-text/60"}`}>
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
