import Link from "next/link";
import dynamic from "next/dynamic";

const NeuralCubeScene = dynamic(
  () => import("@/components/NeuralCubeScene"),
  { ssr: false },
);

export default function HomePage() {
  return (
    /*
      No bg-cube-bg here — the body carries #261f38.
      Removing it from <main> lets the transparent Three.js canvas expose
      the page background directly, erasing the "container box" effect.
    */
    <main className="relative min-h-screen overflow-hidden">

      {/* ── Ambient glow layer (right-side radial) ──────────────────────── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            "radial-gradient(ellipse 55% 70% at 78% 50%, rgba(188,87,39,0.15) 0%, rgba(188,87,39,0.04) 52%, transparent 72%)",
            "radial-gradient(ellipse 25% 40% at 78% 50%, rgba(188,87,39,0.12) 0%, transparent 55%)",
          ].join(", "),
        }}
      />

      {/* ── Three.js canvas — absolutely fills the right 50 % ───────────────
           • alpha:true on the Canvas clears to rgba(0,0,0,0)
           • The page body background (#261f38) shows through all empty areas
           • z-index: 1 so glow effects sit above the CSS radial glow but
             below the text content (z-10)
      ─────────────────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-y-0 right-0 hidden lg:block"
        style={{
          width: "50vw",
          zIndex: 1,
          pointerEvents: "none",
          background: "transparent",
        }}
      >
        <NeuralCubeScene />
      </div>

      {/* ── Page content — above the canvas ─────────────────────────────── */}
      <div className="relative z-10 mx-auto grid min-h-screen max-w-[1440px] grid-cols-1 lg:grid-cols-2">

        {/* LEFT: floating content — no bounding box, text sits on the gradient */}
        <div className="flex flex-col justify-center px-8 py-24 lg:px-16 lg:py-0 xl:px-24">

          <span className="mb-5 inline-block text-[10px] font-medium uppercase tracking-[0.42em] text-cube-accent">
            CubeZero · Finansal Kalkan
          </span>

          <h1 className="text-3xl font-bold leading-[1.12] tracking-tight text-cube-text md:text-4xl xl:text-[2.75rem]">
            CubeZero:{" "}
            <span
              className="text-cube-accent"
              style={{ textShadow: "0 0 48px rgba(188,87,39,0.50)" }}
            >
              Otonom
            </span>{" "}
            Finansal
            <br />
            Kalkanınız
          </h1>

          <p className="mt-5 text-[15px] leading-relaxed text-cube-text/55">
            Harcamalarınızı AI Agent ile milisaniyeler içinde analiz edin,
            otonom kararlarla bütçenizi koruyun.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            {/* Primary CTA — glassmorphism button */}
            <Link
              href="/auth"
              className="inline-flex items-center border border-cube-accent/70 bg-white/[0.06] px-7 py-3 text-sm font-medium text-cube-text backdrop-blur-sm transition-all duration-200 hover:bg-cube-accent hover:border-cube-accent hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cube-accent"
            >
              Kalkanı Etkinleştir
            </Link>
            {/* Secondary CTA — link to signup flow */}
            <Link
              href="/auth?mode=signup"
              className="inline-flex items-center border border-white/[0.12] bg-white/[0.04] px-5 py-3 text-sm font-medium text-cube-text/60 backdrop-blur-sm transition-all duration-200 hover:border-white/25 hover:text-cube-text hover:bg-white/[0.07]"
            >
              Kayıt Ol →
            </Link>
          </div>

          {/* Stats bar */}
          <div className="mt-8 flex items-center gap-6 border-t border-cube-accent/15 pt-6 md:gap-10">
            <div>
              <p className="text-lg font-bold text-cube-accent">0</p>
              <p className="mt-0.5 text-[9px] uppercase tracking-[0.22em] text-cube-text/40">
                Kart verisi
              </p>
            </div>
            <div className="h-6 w-px bg-cube-accent/20" />
            <div>
              <p className="text-lg font-bold text-cube-text">Gemini</p>
              <p className="mt-0.5 text-[9px] uppercase tracking-[0.22em] text-cube-text/40">
                AI analiz
              </p>
            </div>
            <div className="h-6 w-px bg-cube-accent/20" />
            <div>
              <p className="text-lg font-bold text-cube-text">AL/ALMA</p>
              <p className="mt-0.5 text-[9px] uppercase tracking-[0.22em] text-cube-text/40">
                Anlık karar
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT: invisible spacer that reserves the grid column on desktop */}
        <div className="hidden lg:block" aria-hidden="true" />
      </div>

      {/* ── Mobile fallback: canvas below the text ───────────────────────── */}
      <div className="relative h-[420px] lg:hidden">
        <NeuralCubeScene />
      </div>
    </main>
  );
}
