"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Decision = "shield" | "caution" | "allow" | null;

const LIMIT_KEY   = "cubezero_monthly_limit_try";
const HISTORY_KEY = "cubezero_history";
const SAVINGS_KEY = "cubezero_savings";

const STATUS_MESSAGES = [
  "Piyasa taranıyor...",
  "Enflasyon hesaplanıyor...",
  "Bütçe kontrol ediliyor...",
];

interface HistoryItem {
  id:        string;
  url:       string;
  decision:  Decision;
  timestamp: number;
}

interface Props {
  email: string;
}

function InfoIcon() {
  return (
    <svg
      width="11" height="11" viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="inline"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

/* ── Glassmorphism card style object (reused) ──────────────────────────── */
const glassCard: React.CSSProperties = {
  background:              "rgba(255,255,255,0.06)",
  backdropFilter:          "blur(16px)",
  WebkitBackdropFilter:    "blur(16px)",
  border:                  "1px solid rgba(255,255,255,0.08)",
  borderRadius:            "16px",
};

const glassCardHover: React.CSSProperties = {
  background:   "rgba(255,255,255,0.10)",
  borderColor:  "rgba(255,255,255,0.15)",
};

export function DashboardClient({ email }: Props) {
  const [limit, setLimit]             = useState("");
  const [url, setUrl]                 = useState("");
  const [decision, setDecision]       = useState<Decision>(null);
  const [rationale, setRationale]     = useState<string | null>(null);
  const [savingsTip, setSavingsTip]   = useState<string | null>(null);
  const [confidence, setConfidence]   = useState<number | null>(null);
  const [discountPct, setDiscountPct] = useState<number | null>(null);
  const [priceBand, setPriceBand]     = useState<{ cur: number; orig: number } | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [history, setHistory]         = useState<HistoryItem[]>([]);
  const [savings, setSavings]         = useState(0);
  const [statusIndex, setStatusIndex] = useState(0);

  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const savedLimit   = window.localStorage.getItem(LIMIT_KEY);
    if (savedLimit) setLimit(savedLimit);
    const savedHistory = window.localStorage.getItem(HISTORY_KEY);
    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory)); } catch {}
    }
    const savedSavings = window.localStorage.getItem(SAVINGS_KEY);
    if (savedSavings) setSavings(Number(savedSavings));
  }, []);

  useEffect(() => {
    if (loading) {
      setStatusIndex(0);
      statusIntervalRef.current = setInterval(() => {
        setStatusIndex((i) => (i + 1) % STATUS_MESSAGES.length);
      }, 1400);
    } else {
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    }
    return () => {
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, [loading]);

  function persistLimit(next: string) {
    setLimit(next);
    window.localStorage.setItem(LIMIT_KEY, next);
  }

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  async function runAnalysis() {
    setError(null);
    setDecision(null);
    setRationale(null);
    setSavingsTip(null);
    setConfidence(null);
    setDiscountPct(null);
    setPriceBand(null);
    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

      const res = await fetch(`${apiBase}/analyze`, {
        method: "POST",
        headers,
        body: JSON.stringify({ url: url.trim(), monthly_limit_try: limit.trim() || null }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d   = (data as { detail?: unknown }).detail;
        const msg =
          typeof d === "string"
            ? d
            : Array.isArray(d)
              ? (d as { msg?: string }[]).map((x) => x.msg).filter(Boolean).join(", ")
              : "Analiz başarısız.";
        throw new Error(msg || "Analiz başarısız.");
      }

      const typed = data as {
        decision:              Decision;
        rationale:             string;
        savings_tip:           string;
        confidence:            number;
        discount_percentage?: number;
        current_price?:       number;
        original_price?:      number;
      };
      setDecision(typed.decision);
      setRationale(typed.rationale ?? null);
      setSavingsTip(typed.savings_tip ?? null);
      setConfidence(typeof typed.confidence === "number" ? typed.confidence : null);
      const dp = typed.discount_percentage;
      const cur = typed.current_price;
      const orig = typed.original_price;
      if (
        typeof dp === "number" &&
        dp >= 0.5 &&
        typeof cur === "number" &&
        typeof orig === "number" &&
        orig > cur * 1.005
      ) {
        setDiscountPct(dp);
        setPriceBand({ cur, orig });
      } else {
        setDiscountPct(null);
        setPriceBand(null);
      }

      const newItem: HistoryItem = {
        id:        Date.now().toString(),
        url:       url.trim(),
        decision:  typed.decision,
        timestamp: Date.now(),
      };
      const nextHistory = [newItem, ...history].slice(0, 20);
      setHistory(nextHistory);
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));

      if (typed.decision === "caution" || typed.decision === "shield") {
        const nextSavings = savings + 1;
        setSavings(nextSavings);
        window.localStorage.setItem(SAVINGS_KEY, String(nextSavings));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  const verdictLabel = useMemo(() => {
    if (decision === "allow")   return "AL";
    if (decision === "caution") return "STRATEJİK BEKLEME";
    if (decision === "shield")  return "ALMA";
    return null;
  }, [decision]);

  /* Verdict colors per spec:
     AL (allow)   → #f7f7f7  white
     ALMA (shield)→ #f68c06  orange
     BEKLE(caution)→ rgba(247,247,247,0.45) muted  */
  const verdictStyle = useMemo((): React.CSSProperties => {
    if (decision === "allow")   return { color: "#f7f7f7" };
    if (decision === "caution") return { color: "rgba(247,247,247,0.45)" };
    if (decision === "shield")  return { color: "#f68c06" };
    return {};
  }, [decision]);

  function historyDecisionLabel(d: Decision): string {
    if (d === "allow")   return "AL";
    if (d === "caution") return "BEKLE";
    if (d === "shield")  return "ALMA";
    return "?";
  }

  function deleteHistoryItem(id: string) {
    const next = history.filter((item) => item.id !== id);
    setHistory(next);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  }

  function truncateUrl(raw: string): string {
    try {
      const { hostname, pathname } = new URL(raw);
      const slug = pathname.replace(/^\//, "").slice(0, 22);
      const short = hostname + (slug ? "/" + slug : "");
      return short.length > 40 ? short.slice(0, 40) + "…" : short + (pathname.length > 23 ? "…" : "");
    } catch {
      return raw.length > 40 ? raw.slice(0, 40) + "…" : raw;
    }
  }

  function historyDecisionStyle(d: Decision): React.CSSProperties {
    if (d === "allow")   return { color: "#f7f7f7" };
    if (d === "caution") return { color: "rgba(247,247,247,0.45)" };
    if (d === "shield")  return { color: "#f68c06" };
    return { color: "rgba(247,247,247,0.40)" };
  }

  const cubeSpeed  = loading ? "1s" : "8s";
  const cubePaused = !loading && decision !== null;

  return (
    <>
      {/* CSS cube animation — edges now blue (#325da7) */}
      <style>{`
        @keyframes rotateCube {
          from { transform: rotateX(-18deg) rotateY(0deg); }
          to   { transform: rotateX(-18deg) rotateY(360deg); }
        }
        .cube-inner {
          width: 120px;
          height: 120px;
          position: relative;
          transform-style: preserve-3d;
          animation: rotateCube var(--cube-speed) linear infinite;
          animation-play-state: var(--cube-play-state);
        }
        .cube-face {
          position: absolute;
          width: 120px;
          height: 120px;
          border: 1.5px solid #325da7;
          background: rgba(50, 93, 167, 0.025);
        }
        .cube-face.front  { transform: translateZ(60px); }
        .cube-face.back   { transform: rotateY(180deg) translateZ(60px); }
        .cube-face.left   { transform: rotateY(-90deg) translateZ(60px); }
        .cube-face.right  { transform: rotateY(90deg) translateZ(60px); }
        .cube-face.top    { transform: rotateX(90deg) translateZ(60px); }
        .cube-face.bottom { transform: rotateX(-90deg) translateZ(60px); }
      `}</style>

      {/* Transparent main — global bg (#15181c + dot grid) shows through */}
      <main className="dashboard-root min-h-screen w-full overflow-x-hidden text-cube-text">

        {/* Header */}
        <header
          className="relative z-10 flex items-center justify-between px-8 py-4"
          style={{
            background:     "rgba(255,255,255,0.04)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderBottom:   "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <h1 className="font-mono text-xs uppercase tracking-[0.35em] text-cube-text/50">
            CubeZ · Fintech AI
          </h1>
          <div className="flex items-center gap-6">
            <span className="font-mono text-xs text-cube-text/40">{email}</span>
            <button
              type="button"
              onClick={handleSignOut}
              className="text-xs uppercase tracking-widest text-cube-text/35 transition hover:text-cube-text"
            >
              Çıkış →
            </button>
          </div>
        </header>

        {/* 3-column cockpit */}
        <div className="relative z-10 grid grid-cols-[25%_50%_25%] items-start gap-4 p-4 pb-14">

          {/* ── Column 1: Z-ARŞİV — glass card ── */}
          <aside className="flex flex-col gap-5 p-6" style={glassCard}>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.35em] text-cube-text/50">
              Z-ARŞİV
            </h2>

            {/* Monthly budget */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] uppercase tracking-widest text-cube-text/40">
                  Aylık Bütçe
                </span>
                <span className="font-mono text-[10px] text-cube-text/55">
                  {limit ? `${limit} TRY` : "—"}
                </span>
              </div>

              {/* Progress bar: blue → orange gradient */}
              <div
                className="h-1.5 w-full overflow-hidden rounded-full"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: "0%",
                    background: "linear-gradient(90deg, #325da7, #f68c06)",
                  }}
                />
              </div>

              <input
                value={limit}
                onChange={(e) => persistLimit(e.target.value)}
                placeholder="Limit gir (TRY)"
                className="w-full rounded-lg px-3 py-2 text-xs text-cube-text outline-none placeholder:text-cube-text/25 transition-colors"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border:     "1px solid rgba(255,255,255,0.10)",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(50,93,167,0.60)"; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; }}
              />
            </div>

            {/* Past decisions */}
            <div className="flex flex-col gap-2">
              <p className="text-[9px] uppercase tracking-widest text-cube-text/40">
                Geçmiş Analizler
              </p>
              {history.length === 0 ? (
                <p className="text-xs italic text-cube-text/25">Henüz analiz yok</p>
              ) : (
                <ul className="space-y-1.5">
                  {history.map((item) => (
                    <li
                      key={item.id}
                      className="relative rounded-xl px-3 py-2 transition-colors"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border:     "1px solid rgba(255,255,255,0.08)",
                      }}
                      onMouseEnter={(e) => Object.assign(e.currentTarget.style, glassCardHover)}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background  = "rgba(255,255,255,0.04)";
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                      }}
                    >
                      {/* Delete button */}
                      <button
                        type="button"
                        onClick={() => deleteHistoryItem(item.id)}
                        aria-label="Sil"
                        className="absolute right-2 top-2 text-sm leading-none text-white/40 transition-colors hover:text-white/80"
                      >
                        ×
                      </button>

                      <div className="flex items-center justify-between pr-4">
                        <span
                          className="font-mono text-[10px] font-semibold"
                          style={historyDecisionStyle(item.decision)}
                        >
                          {historyDecisionLabel(item.decision)}
                        </span>
                        <span className="text-[9px] text-cube-text/25">
                          {new Date(item.timestamp).toLocaleDateString("tr-TR")}
                        </span>
                      </div>

                      <p className="mt-0.5 text-[10px] text-cube-text/30 pr-4">
                        {truncateUrl(item.url)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Savings counter — orange */}
            <div
              className="rounded-xl p-4"
              style={{
                background: "rgba(255,255,255,0.04)",
                border:     "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <p className="text-[9px] uppercase tracking-widest text-cube-text/40">
                Toplam Tasarruf
              </p>
              <p className="mt-1 font-mono text-3xl font-semibold" style={{ color: "#f68c06" }}>
                {savings}
              </p>
              <p className="mt-0.5 text-[9px] text-cube-text/25">iptal / bekle kararı</p>
            </div>
          </aside>

          {/* ── Column 2: Cube + Input — transparent ── */}
          <section className="flex flex-col items-center rounded-2xl p-8 pt-12">

            {/* 3D wireframe cube */}
            <div className="flex flex-col items-center justify-center gap-5 py-6">
              <div style={{ width: 120, height: 120, perspective: "320px" }}>
                <div
                  className="cube-inner"
                  style={
                    {
                      "--cube-speed":      cubeSpeed,
                      "--cube-play-state": cubePaused ? "paused" : "running",
                    } as React.CSSProperties
                  }
                >
                  <div className="cube-face front" />
                  <div className="cube-face back" />
                  <div className="cube-face left" />
                  <div className="cube-face right" />
                  <div className="cube-face top" />
                  <div className="cube-face bottom" />
                </div>
              </div>

              {/* Status / verdict below cube */}
              <div className="mt-6 min-h-[1.5rem] max-w-md px-2 text-center">
                {loading ? (
                  <p
                    className="font-mono text-xs transition-opacity duration-300"
                    style={{ color: "#f68c06" }}
                  >
                    {STATUS_MESSAGES[statusIndex]}
                  </p>
                ) : verdictLabel ? (
                  <p
                    className="font-mono text-sm font-semibold tracking-[0.2em]"
                    style={verdictStyle}
                  >
                    {verdictLabel}
                  </p>
                ) : (
                  <p className="text-xs text-cube-text/20">CubeZ bekliyor…</p>
                )}
              </div>
            </div>

            {/* URL input + send button */}
            <div className="w-full max-w-sm space-y-3 pb-6">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Ürün veya teklif URL'si yapıştır…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading && url.trim()) runAnalysis();
                }}
                className="w-full rounded-lg px-4 py-3 text-sm text-cube-text outline-none placeholder:text-cube-text/25 transition-colors"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border:     "1px solid rgba(255,255,255,0.10)",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(50,93,167,0.60)"; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)"; }}
              />
              <button
                type="button"
                onClick={runAnalysis}
                disabled={loading || !url.trim()}
                className="w-full shrink-0 rounded-lg border border-transparent py-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors disabled:cursor-not-allowed disabled:opacity-100"
                style={{ background: "#325da7" }}
                onMouseEnter={(e) => {
                  if (!loading && url.trim()) e.currentTarget.style.background = "#2a4f96";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#325da7";
                }}
              >
                CubeZ&apos;e Gönder
              </button>
              {error && (
                <p className="text-center text-xs text-red-400">{error}</p>
              )}
            </div>
          </section>

          {/* ── Column 3: CUBEZ KARARI — glass card ── */}
          <aside className="flex flex-col gap-5 p-6" style={glassCard}>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.35em] text-cube-text/50">
              CUBEZ KARARI
            </h2>

            {/* Verdict card */}
            <div
              className="rounded-xl p-5"
              style={{
                background: "rgba(255,255,255,0.04)",
                border:     "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <p className="text-[9px] uppercase tracking-widest text-cube-text/40">Karar</p>
              {verdictLabel ? (
                <p
                  className="mt-3 font-mono text-lg font-bold tracking-wider"
                  style={verdictStyle}
                >
                  {verdictLabel}
                </p>
              ) : (
                <p className="mt-3 text-sm text-cube-text/25">
                  {loading ? "Analiz ediliyor…" : "Bekleniyor"}
                </p>
              )}

              {/* Analiz Güveni with info tooltip */}
              {confidence !== null && (
                <div className="mt-2 flex items-center gap-1.5">
                  <p className="font-mono text-[10px] text-cube-text/35">
                    Analiz Güveni: {(confidence * 100).toFixed(0)}%
                  </p>
                  <div className="group relative cursor-help">
                    <span className="text-cube-text/30 transition hover:text-cube-text/60">
                      <InfoIcon />
                    </span>
                    <div
                      className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-52 -translate-x-1/2 p-2.5 text-[9px] leading-relaxed text-cube-text/60 group-hover:block"
                      style={{
                        background:     "rgba(21,24,28,0.95)",
                        backdropFilter: "blur(12px)",
                        border:         "1px solid rgba(255,255,255,0.08)",
                        borderRadius:   "10px",
                      }}
                    >
                      Bu skor markanın güvenilirliğini değil, yapay zekanın veri analizindeki tutarlılık oranını temsil eder.
                    </div>
                  </div>
                </div>
              )}

              {priceBand !== null && discountPct !== null && discountPct >= 5 && (
                <p className="mt-3 font-mono text-[10px] leading-relaxed text-cube-text/50">
                  <span className="line-through text-cube-text/35">
                    {priceBand.orig.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL
                  </span>
                  <span className="text-cube-text/30"> → </span>
                  <span style={{ color: "rgba(246, 140, 6, 0.92)" }}>
                    {priceBand.cur.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL
                  </span>
                  <span className="text-cube-text/35"> (−%{Math.round(discountPct)})</span>
                </p>
              )}
            </div>

            {/* Reasoning card */}
            <div
              className="flex flex-col gap-4 rounded-xl p-5"
              style={{
                background: "rgba(255,255,255,0.04)",
                border:     "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div>
                <p className="text-[9px] uppercase tracking-widest text-cube-text/40">Gerekçe</p>

                {rationale ? (
                  <div className="mt-3 flex flex-col gap-3">
                    {rationale.split("\n").filter(Boolean).map((line, i) => {
                      const isNumbered = /^\d+\)/.test(line.trim());
                      const numMatch   = line.trim().match(/^(\d+\))\s*(.*)/);
                      return isNumbered && numMatch ? (
                        <div key={i} className="flex gap-2.5">
                          <span
                            className="mt-0.5 shrink-0 font-mono text-[10px] font-semibold leading-relaxed"
                            style={{ color: "rgba(50,93,167,0.80)" }}
                          >
                            {numMatch[1]}
                          </span>
                          <p className="text-[12.5px] leading-loose text-cube-text/80">
                            {numMatch[2]}
                          </p>
                        </div>
                      ) : (
                        <p key={i} className="text-[12.5px] leading-loose text-cube-text/75">
                          {line}
                        </p>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-[13px] italic text-cube-text/25">
                    Ürün URL&apos;si gönderdiğinde yapay zeka burada detaylı analiz yapacak.
                  </p>
                )}
              </div>

              {/* Savings tip */}
              {savingsTip && (
                <div
                  className="pt-3"
                  style={{ borderTop: "1px solid rgba(246,140,6,0.15)" }}
                >
                  <p
                    className="text-[9px] uppercase tracking-widest"
                    style={{ color: "rgba(246,140,6,0.65)" }}
                  >
                    Tasarruf Önerisi
                  </p>
                  <p
                    className="mt-1.5 text-[12px] leading-loose"
                    style={{ color: "rgba(246,140,6,0.85)" }}
                  >
                    {savingsTip}
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
