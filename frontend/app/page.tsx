"use client";

import Link from "next/link";
import dynamic from "next/dynamic";

const NeuralCubeScene = dynamic(
  () => import("@/components/NeuralCubeScene"),
  { ssr: false },
);

const INTELLIGENCE_STACK_SPECS = [
  "Groq LPU (Ultra-Low Latency Inference)",
  "Llama 3.3 · 70B (State-of-the-Art LLM)",
  "4-Phase Deterministic Agentic Workflow",
];

/* ── Bottom unified bar: 3-step process ─────────────────────────────────── */
const STEPS = [
  {
    num:     "01",
    action:  "Linki Yapıştır",
    feature: "Ürün URL'sini dashboard'a bırak",
  },
  {
    num:     "02",
    action:  "Ajan Analiz Etsin",
    feature: "Piyasa taranır, fiyat doğrulanır",
  },
  {
    num:     "03",
    action:  "Kararı Al",
    feature: "AL · STRATEJİK BEKLE · ALMA",
  },
];

export default function HomePage() {
  return (
    <main className="relative flex h-screen flex-col overflow-hidden">

      {/* ══════════════════════════════════════════════════════════
          HERO — takes all vertical space except the bottom bar
      ══════════════════════════════════════════════════════════ */}
      <section className="relative flex min-h-0 flex-1 overflow-hidden">

        {/* Multi-layer ambient glow — blue dominant, orange accent */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              "radial-gradient(ellipse 70% 90% at 80% 50%, rgba(50,93,167,0.22) 0%, rgba(50,93,167,0.05) 50%, transparent 70%)",
              "radial-gradient(ellipse 35% 60% at 78% 52%, rgba(50,93,167,0.16) 0%, transparent 55%)",
              "radial-gradient(ellipse 50% 40% at 8%  90%, rgba(246,140,6,0.06) 0%, transparent 60%)",
            ].join(", "),
          }}
        />

        {/* 3D Cube — right half, desktop — blue CSS neon breathe */}
        <div
          aria-hidden="true"
          className="cube-neon-glow absolute inset-y-0 right-0 hidden lg:block"
          style={{ width: "50vw", zIndex: 1, pointerEvents: "none" }}
        >
          <NeuralCubeScene />
        </div>

        {/* Mobile: faded background cube */}
        <div
          aria-hidden="true"
          className="cube-neon-glow absolute inset-0 opacity-20 lg:hidden"
          style={{ zIndex: 0, pointerEvents: "none" }}
        >
          <NeuralCubeScene />
        </div>

        {/* Main content grid */}
        <div className="relative z-10 mx-auto grid h-full w-full max-w-[1440px] grid-cols-1 lg:grid-cols-2">

          {/* LEFT: hero copy — vertically centered column, content left-aligned */}
          <div className="flex min-h-0 flex-col items-start justify-center px-8 py-10 text-start lg:px-16 xl:px-24">

            {/* Main headline: "Cube" = orange, "Zero" = white with glow */}
            <h1 className="text-[2rem] font-bold leading-[1.08] tracking-tight sm:text-[2.4rem] xl:text-[2.85rem]">
              <span
                style={{
                  color:      "#f68c06",
                  textShadow: "0 0 20px rgba(246,140,6,0.8), 0 0 40px rgba(246,140,6,0.4)",
                }}
              >
                Cube
              </span>
              <span style={{ color: "#ffffff" }}>Zero</span>
              {" "}
              <br className="hidden sm:block" />
              {"Finansal Kararlarınızın"}{" "}
              <span
                style={{
                  color: "#f68c06",
                  textShadow: "0 0 52px rgba(246,140,6,0.70)",
                }}
              >
                Otonom
              </span>
              <br />
              <span className="text-cube-text">Koruyucusu</span>
            </h1>

            {/* Sub-copy — preserved */}
            <p className="mt-5 max-w-[360px] text-[13.5px] leading-relaxed text-cube-text/50">
            Ürün bağlantısını analiz motoruna bırakın; CubeZero anlık piyasa verilerini tarasın, bütçe optimizasyonunuzu hesaplasın ve rasyonel karar mekanizmasını saniyeler içinde çalıştırsın. 
            </p>

            {/* CTA buttons */}
            <div className="mt-8 flex flex-wrap items-center gap-4">

              {/* PRIMARY: deep-red Kayıt Ol with strong glow */}
              <Link
                href="/auth?mode=signup"
                className="inline-flex items-center gap-2 rounded-lg px-7 py-[11px] text-sm text-white transition-[background,box-shadow,transform] duration-200 active:scale-[0.97]"
                style={{
                  background: "#cc0000",
                  fontWeight: 700,
                  boxShadow:
                    "0 0 24px rgba(204,0,0,0.7), 0 0 48px rgba(204,0,0,0.4)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#ff0000";
                  e.currentTarget.style.boxShadow  =
                    "0 0 32px rgba(255,0,0,0.9), 0 0 64px rgba(255,0,0,0.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#cc0000";
                  e.currentTarget.style.boxShadow  =
                    "0 0 24px rgba(204,0,0,0.7), 0 0 48px rgba(204,0,0,0.4)";
                }}
              >
                Kayıt Ol
              </Link>

              {/* SECONDARY: glass reflection button */}
              <Link
                href="/auth"
                className="inline-flex items-center gap-1 rounded-lg px-5 py-[11px] text-sm font-medium transition-[background,box-shadow] duration-300"
                style={{
                  background:          "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)",
                  backdropFilter:      "blur(8px)",
                  WebkitBackdropFilter:"blur(8px)",
                  border:              "1px solid rgba(255,255,255,0.15)",
                  boxShadow:           "inset 0 1px 0 rgba(255,255,255,0.15)",
                  color:               "#f7f7f7",
                }}
              >
                Giriş Yap →
              </Link>
            </div>

            {/* Intelligence stack — spec row beneath CTAs */}
            <div className="mt-5 w-full max-w-xl">
              <p className="mb-2 font-mono text-xs text-white/40">
                Powering CubeZero&apos;s Intelligence Stack
              </p>
              <div className="flex flex-wrap items-start justify-start gap-2">
                {INTELLIGENCE_STACK_SPECS.map((spec) => (
                  <span
                    key={spec}
                    className="rounded-md border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60"
                  >
                    {spec}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: cube fills via absolute */}
          <div className="hidden lg:block" aria-hidden="true" />
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          BOTTOM UNIFIED BAR — glassmorphism stats card
      ══════════════════════════════════════════════════════════ */}
      <div className="relative shrink-0">

        {/* accent top-edge line — blue */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(to right, transparent 0%, rgba(50,93,167,0.55) 30%, rgba(50,93,167,0.55) 70%, transparent 100%)",
          }}
        />

        {/* glassmorphism surface */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          }}
        />

        <div className="relative z-10 mx-auto max-w-[1440px] px-8 py-5 lg:px-16 xl:px-24">
          <div className="flex items-center overflow-x-auto scrollbar-none">
            {STEPS.map((step, i) => (
              <div key={step.num} className="flex items-center">

                {i > 0 && (
                  <div className="mx-6 h-8 w-px shrink-0 bg-white/[0.08] md:mx-8" />
                )}

                {/* Interactive step block */}
                <div className="step-block group/step relative shrink-0 cursor-default">

                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono text-[10px] font-bold transition-all duration-300 group-hover/step:[text-shadow:0_0_14px_rgba(50,93,167,0.90)]"
                      style={{ color: "rgba(50,93,167,0.85)" }}
                    >
                      {step.num}
                    </span>
                    <span className="text-[12px] font-medium text-cube-text/60 transition-colors duration-300 group-hover/step:text-cube-text">
                      {step.action}
                    </span>
                  </div>

                  <p className="mt-0.5 text-[9px] uppercase tracking-[0.20em] text-cube-text/30 transition-colors duration-300 group-hover/step:text-cube-text/55">
                    {step.feature}
                  </p>

                  {/* animated bottom border — blue */}
                  <div
                    className="absolute bottom-0 left-0 h-[1.5px] w-0 transition-[width] duration-300 ease-out group-hover/step:w-full"
                    style={{
                      background: "#325da7",
                      boxShadow: "0 0 10px rgba(50,93,167,0.80)",
                    }}
                  />
                </div>
              </div>
            ))}

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
