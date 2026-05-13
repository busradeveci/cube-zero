import Link from "next/link";
import dynamic from "next/dynamic";

const NeuralCubeScene = dynamic(
  () => import("@/components/NeuralCubeScene"),
  { ssr: false },
);

/* ── Badge data ─────────────────────────────────────────────────────────── */
const BADGES = [
  { label: "LPU Powered AI" },
  { label: "Groq Inference" },
  { label: "Llama 3.3 · 70B" },
];

/* ── Bottom unified bar data ────────────────────────────────────────────── */
const STEPS = [
  {
    num: "01",
    action: "Linki Yapıştır",
    feature: "Ürün URL'sini dashboard'a bırak",
  },
  {
    num: "02",
    action: "Ajan Analiz Etsin",
    feature: "Piyasa taranır, fiyat doğrulanır",
  },
  {
    num: "03",
    action: "Kararı Al",
    feature: "AL · STRATEJİK BEKLEME · ALMA",
  },
];

export default function HomePage() {
  return (
    /*
      Single-screen layout: h-screen overflow-hidden so nothing scrolls.
      flex-col splits hero (flex-1) from the bottom process bar (shrink-0).
    */
    <main className="relative flex h-screen flex-col overflow-hidden">

      {/* ══════════════════════════════════════════════════════════
          HERO — fills all remaining vertical space
      ══════════════════════════════════════════════════════════ */}
      <section className="relative flex min-h-0 flex-1 overflow-hidden">

        {/* ── Multi-layer ambient glow ───────────────────────────────── */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              /* right-center main halo */
              "radial-gradient(ellipse 70% 90% at 80% 50%, rgba(188,87,39,0.24) 0%, rgba(188,87,39,0.06) 50%, transparent 70%)",
              /* right bright core */
              "radial-gradient(ellipse 35% 60% at 78% 52%, rgba(188,87,39,0.18) 0%, transparent 55%)",
              /* bottom-left subtle warmth */
              "radial-gradient(ellipse 50% 40% at 8% 90%, rgba(188,87,39,0.08) 0%, transparent 60%)",
            ].join(", "),
          }}
        />

        {/* ── 3D Cube — right half, desktop only ────────────────────── */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 hidden lg:block"
          style={{ width: "50vw", zIndex: 1, pointerEvents: "none" }}
        >
          <NeuralCubeScene />
        </div>

        {/* ── Mobile background cube (subtle, faded) ────────────────── */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-20 lg:hidden"
          style={{ zIndex: 0, pointerEvents: "none" }}
        >
          <NeuralCubeScene />
        </div>

        {/* ── Main content grid ─────────────────────────────────────── */}
        <div className="relative z-10 mx-auto grid h-full w-full max-w-[1440px] grid-cols-1 lg:grid-cols-2">

          {/* LEFT: hero copy — vertically centered */}
          <div className="flex flex-col justify-center px-8 py-10 lg:px-16 xl:px-24">

            {/* ── Tech badge row ─────────────────────────────────────── */}
            <div className="mb-7 flex flex-wrap items-center gap-2">
              {BADGES.map((b) => (
                <span
                  key={b.label}
                  className="rounded-full border border-white/[0.14] bg-white/[0.06] px-3.5 py-1 text-[9.5px] font-medium uppercase tracking-[0.28em] text-cube-text/65 backdrop-blur-sm"
                >
                  {b.label}
                </span>
              ))}
            </div>

            {/* ── Main headline ──────────────────────────────────────── */}
            <h1 className="text-[2rem] font-bold leading-[1.08] tracking-tight text-cube-text sm:text-[2.4rem] xl:text-[2.85rem]">
              CubeZero:{" "}
              <br className="hidden sm:block" />
              Harcamalarınızı{" "}
              <span
                className="text-cube-accent"
                style={{ textShadow: "0 0 72px rgba(188,87,39,0.75)" }}
              >
                Akıllı
              </span>
              <br />
              Yatırımlara Dönüştürün
            </h1>

            {/* ── Sub-copy ───────────────────────────────────────────── */}
            <p className="mt-5 max-w-[360px] text-[13.5px] leading-relaxed text-cube-text/50">
              Ürün URL&apos;sini yapıştır — CubeZero piyasayı tarasın,
              bütçeni korusun ve saniyeler içinde otonom kararını sunsun.
            </p>

            {/* ── CTA buttons ────────────────────────────────────────── */}
            <div className="mt-8 flex flex-wrap items-center gap-3">

              {/* PRIMARY: Kayıt Ol — solid accent + neon glow */}
              <Link
                href="/auth?mode=signup"
                className="inline-flex items-center gap-2 bg-cube-accent px-7 py-[11px] text-sm font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.97]"
                style={{
                  boxShadow:
                    "0 0 0 1px rgba(188,87,39,0.5), 0 0 20px rgba(188,87,39,0.45), 0 0 48px rgba(188,87,39,0.20)",
                }}
              >
                Kayıt Ol
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </Link>

              {/* SECONDARY: Giriş Yap — glass outlined */}
              <Link
                href="/auth"
                className="inline-flex items-center border border-white/[0.18] bg-white/[0.05] px-7 py-[11px] text-sm font-medium text-cube-text/70 backdrop-blur-sm transition-all duration-200 hover:border-white/30 hover:bg-white/[0.09] hover:text-cube-text"
              >
                Giriş Yap
              </Link>
            </div>
          </div>

          {/* RIGHT: cube fills this via absolute */}
          <div className="hidden lg:block" aria-hidden="true" />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          BOTTOM UNIFIED BAR — process steps + feature descriptors
      ══════════════════════════════════════════════════════════ */}
      <div className="relative shrink-0">

        {/* top edge line */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(to right, transparent 0%, rgba(188,87,39,0.30) 30%, rgba(188,87,39,0.30) 70%, transparent 100%)",
          }}
        />

        {/* subtle row glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 120% at 50% 100%, rgba(188,87,39,0.07) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 mx-auto max-w-[1440px] px-8 py-5 lg:px-16 xl:px-24">
          <div className="flex items-center gap-0 overflow-x-auto scrollbar-none md:gap-0">
            {STEPS.map((step, i) => (
              <div key={step.num} className="flex items-center">
                {/* divider — not before first */}
                {i > 0 && (
                  <div className="mx-6 h-8 w-px shrink-0 bg-white/[0.08] md:mx-8" />
                )}

                {/* step block */}
                <div className="shrink-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono text-[10px] font-bold text-cube-accent"
                      style={{ textShadow: "0 0 12px rgba(188,87,39,0.5)" }}
                    >
                      {step.num}
                    </span>
                    <span className="text-[12px] font-medium text-cube-text/75">
                      {step.action}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[9px] uppercase tracking-[0.20em] text-cube-text/30">
                    {step.feature}
                  </p>
                </div>
              </div>
            ))}

            {/* extra right divider + tagline */}
            <div className="ml-6 hidden h-8 w-px shrink-0 bg-white/[0.08] md:ml-8 md:block" />
            <p className="ml-6 hidden shrink-0 text-[9px] uppercase tracking-[0.28em] text-cube-text/20 md:ml-8 md:block">
              CubeZero · Otonom Finansal Kalkan
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
