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

/** AL — yeşil onay (status-only renk) */
function IconVerdictAllow({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 12.5l2.5 2.5L16 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** ALMA — kırmızı X daire */
function IconVerdictShield({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
      <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** BEKLE — turuncu saat */
function IconVerdictCaution({ className }: { className?: string }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 7v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* Deep panels — opaque charcoal, no backdrop-blur (avoids light bleed on scroll) */
const darkPanel: React.CSSProperties = {
  background:   "rgba(10, 10, 10, 0.98)",
  border:       "1px solid rgba(255,255,255,0.06)",
  borderRadius: "16px",
  boxShadow:    "none",
};

const darkPanelHover: React.CSSProperties = {
  background:  "rgba(18, 18, 18, 0.98)",
  borderColor: "rgba(255,255,255,0.09)",
  boxShadow:   "none",
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
      const u = new URL(raw);
      const host = u.hostname.replace(/^www\./, "");
      const dp = u.pathname.match(/\/dp\/([A-Z0-9]{10})/i);
      if (dp && host.includes("amazon")) {
        return `${host}/dp/${dp[1]}`;
      }
      const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
      const shortPath = parts.slice(0, 3).join("/");
      const line = shortPath ? `${host}/${shortPath}` : host;
      return line.length > 44 ? `${line.slice(0, 42)}…` : line;
    } catch {
      return raw.length > 44 ? `${raw.slice(0, 42)}…` : raw;
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

  const savingsMix = useMemo(() => {
    let saved = 0;
    let spent = 0;
    for (const h of history) {
      if (h.decision === "shield" || h.decision === "caution") saved += 1;
      else if (h.decision === "allow") spent += 1;
    }
    const total = saved + spent;
    if (total === 0) return { savedPct: 0, spentPct: 0, saved, spent };
    return {
      savedPct: (saved / total) * 100,
      spentPct: (spent / total) * 100,
      saved,
      spent,
    };
  }, [history]);

  const verdictNeon = useMemo((): React.CSSProperties => {
    if (decision === "allow") {
      return {
        color: "#4ade80",
        textShadow: "0 0 14px rgba(74,222,128,0.55), 0 0 28px rgba(74,222,128,0.2)",
      };
    }
    if (decision === "shield") {
      return {
        color: "#f87171",
        textShadow: "0 0 14px rgba(248,113,113,0.55), 0 0 28px rgba(248,113,113,0.2)",
      };
    }
    if (decision === "caution") {
      return {
        color: "#fb923c",
        textShadow: "0 0 14px rgba(251,146,60,0.55), 0 0 28px rgba(251,146,60,0.22)",
      };
    }
    return {};
  }, [decision]);

  return (
    <>
      <style>{`
        @keyframes rotateCube {
          from { transform: rotateX(-18deg) rotateY(0deg); }
          to   { transform: rotateX(-18deg) rotateY(360deg); }
        }
        @keyframes cubePulseScale {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.06); }
        }
        @keyframes cubeEdgeGlow {
          0%, 100% {
            border-color: #325da7;
            box-shadow: inset 0 0 0 1px rgba(50,93,167,0.35), 0 0 14px rgba(50,93,167,0.28);
          }
          50% {
            border-color: rgba(246, 140, 6, 0.85);
            box-shadow: inset 0 0 0 1px rgba(246,140,6,0.25), 0 0 22px rgba(246,140,6,0.38);
          }
        }
        @keyframes rationaleShimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(280%); }
        }
        @keyframes geminiAuraPulse {
          0%, 100% {
            opacity: 0.42;
            transform: translate(-50%, -50%) scale(1);
            filter: blur(38px) hue-rotate(0deg);
          }
          35% {
            opacity: 0.52;
            transform: translate(-50%, -50%) scale(1.06);
            filter: blur(42px) hue-rotate(55deg);
          }
          70% {
            opacity: 0.46;
            transform: translate(-50%, -50%) scale(1.03);
            filter: blur(40px) hue-rotate(-35deg);
          }
        }
        .cube-gemini-halo {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 300px;
          height: 300px;
          transform: translate(-50%, -50%);
          pointer-events: none;
          z-index: 0;
          border-radius: 50%;
          background: radial-gradient(
            ellipse 72% 68% at 50% 48%,
            rgba(50, 93, 167, 0.22) 0%,
            rgba(34, 197, 94, 0.11) 38%,
            rgba(245, 158, 11, 0.12) 62%,
            transparent 78%
          );
          animation: geminiAuraPulse 9s ease-in-out infinite;
        }
        .cube-gemini-stack {
          position: relative;
          z-index: 1;
          isolation: isolate;
        }
        .cube-pulse-wrap {
          transform-origin: center center;
        }
        .cube-shell--thinking .cube-pulse-wrap {
          animation: cubePulseScale 1.45s ease-in-out infinite;
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
          transition: border-color 0.35s ease, box-shadow 0.35s ease;
        }
        .cube-shell--thinking .cube-face {
          animation: cubeEdgeGlow 1.8s ease-in-out infinite;
        }
        .cube-face.front  { transform: translateZ(60px); }
        .cube-face.back   { transform: rotateY(180deg) translateZ(60px); }
        .cube-face.left   { transform: rotateY(-90deg) translateZ(60px); }
        .cube-face.right  { transform: rotateY(90deg) translateZ(60px); }
        .cube-face.top    { transform: rotateX(90deg) translateZ(60px); }
        .cube-face.bottom { transform: rotateX(-90deg) translateZ(60px); }
        .rationale-shimmer-bar {
          overflow: hidden;
          border-radius: inherit;
        }
        .rationale-shimmer-bar::after {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          width: 40%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(50, 93, 167, 0.07),
            transparent
          );
          animation: rationaleShimmer 1.2s ease-in-out infinite;
        }
      `}</style>

      {/* Transparent main — global bg (#15181c + dot grid) shows through */}
      <main className="dashboard-root min-h-screen w-full overflow-x-hidden bg-[#0a0a0a] text-cube-text">

        <header
          className="sticky top-0 z-30 flex items-center justify-between border-b border-white/[0.05] bg-[#0a0a0a] px-8 py-4"
          style={{ boxShadow: "none" }}
        >
          <h1 className="relative z-10 font-mono text-xs uppercase tracking-[0.35em] text-cube-text/55">
            CubeZ · Fintech AI
          </h1>
          <div className="relative z-10 flex items-center gap-6">
            <span className="font-mono text-xs text-cube-text/45">{email}</span>
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
        <div className="relative z-10 grid min-h-[calc(100dvh-4.25rem)] grid-cols-[25%_50%_25%] items-stretch gap-4 p-4 pb-14">

          <aside className="flex flex-col gap-5 self-start p-6" style={darkPanel}>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.35em] text-cube-text/50">
              İşlem Geçmişi
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
                style={{ background: "#0a0a0a", boxShadow: "none" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: "0%",
                    background: "linear-gradient(90deg, #325da7, #f68c06)",
                    boxShadow: "none",
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
                <div className="dashboard-history-scroll max-h-[min(42vh,380px)] overflow-y-auto overflow-x-hidden pr-0.5">
                  <ul className="space-y-1.5">
                  {history.map((item) => (
                    <li
                      key={item.id}
                      className="relative rounded-xl px-3 py-2 transition-colors"
                      style={{
                        background: "rgba(22, 22, 22, 0.95)",
                        border:     "1px solid rgba(255,255,255,0.06)",
                        boxShadow:  "none",
                      }}
                      onMouseEnter={(e) => Object.assign(e.currentTarget.style, darkPanelHover)}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background  = "rgba(22, 22, 22, 0.95)";
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
                        e.currentTarget.style.boxShadow   = "none";
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

                      <p className="mt-0.5 max-w-full overflow-hidden text-ellipsis whitespace-nowrap pr-4 font-mono text-[10px] text-cube-text/30">
                        {truncateUrl(item.url)}
                      </p>
                    </li>
                  ))}
                </ul>
                </div>
              )}
            </div>

            {/* Savings counter — orange */}
            <div
              className="rounded-xl p-4"
              style={{
                background: "rgba(12, 12, 12, 0.96)",
                border:     "1px solid rgba(255,255,255,0.06)",
                boxShadow:  "none",
              }}
            >
              <p className="text-[9px] uppercase tracking-widest text-cube-text/40">
                Toplam Tasarruf
              </p>
              <p className="mt-1 font-mono text-3xl font-semibold" style={{ color: "#f68c06" }}>
                {savings}
              </p>
              <p className="mt-0.5 text-[9px] text-cube-text/25">iptal / bekle kararı</p>

              <div className="mt-3 space-y-1.5">
                <p className="text-center font-mono text-[8px] uppercase tracking-[0.2em] text-cube-text/45">
                  Bütçe Koruma Oranı
                </p>
                <div
                  className="flex h-1.5 w-full overflow-hidden rounded-full"
                  style={{ background: "#0a0a0a", boxShadow: "none" }}
                  title={
                    savingsMix.saved + savingsMix.spent > 0
                      ? `${savingsMix.saved} koruma / ${savingsMix.spent} AL`
                      : "Henüz karar yok"
                  }
                >
                  <div
                    className="h-full shrink-0 transition-all duration-500"
                    style={{
                      width:
                        savingsMix.saved + savingsMix.spent > 0
                          ? `${savingsMix.savedPct}%`
                          : "0%",
                      background: "linear-gradient(90deg, rgba(246,140,6,0.85), rgba(246,140,6,0.5))",
                      boxShadow: "none",
                    }}
                  />
                  <div
                    className="h-full shrink-0 transition-all duration-500"
                    style={{
                      width:
                        savingsMix.saved + savingsMix.spent > 0
                          ? `${savingsMix.spentPct}%`
                          : "0%",
                      background: "rgba(42, 44, 48, 0.95)",
                      boxShadow: "none",
                    }}
                  />
                </div>
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 flex-col items-center justify-start rounded-2xl px-6 pb-10 pt-[max(1rem,5vh)]">
            <div className="flex w-full max-w-sm flex-col items-center gap-14">
              <div className="relative flex flex-col items-center gap-3 pt-4">
                <div className="cube-gemini-halo" aria-hidden />
                <div className="cube-gemini-stack flex flex-col items-center gap-3">
                <div
                  className={loading ? "cube-shell cube-shell--thinking" : "cube-shell"}
                  style={{ width: 120, height: 120, perspective: "320px" }}
                >
                  <div className="cube-pulse-wrap h-full w-full">
                    <div
                      className="cube-inner"
                      style={
                        {
                          "--cube-speed":      cubeSpeed,
                          "--cube-play-state": loading ? "running" : cubePaused ? "paused" : "running",
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
                </div>

                <div className="min-h-[1.5rem] max-w-md px-2 text-center">
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
              </div>

              <div className="w-full space-y-2.5">
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
            </div>
          </section>

          <aside className="flex flex-col gap-5 self-start p-6" style={darkPanel}>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.35em] text-cube-text/50">
              CUBEZ KARARI
            </h2>

            {/* Verdict card */}
            <div
              className="rounded-xl p-5"
              style={{
                background: "rgba(12, 12, 12, 0.96)",
                border:     "1px solid rgba(255,255,255,0.06)",
                boxShadow:  "none",
              }}
            >
              <p className="text-[9px] uppercase tracking-widest text-cube-text/40">Karar</p>
              {verdictLabel ? (
                <div className="mt-3 flex items-start gap-3">
                  {decision === "allow" && (
                    <IconVerdictAllow className="mt-0.5 shrink-0 text-[#4ade80]" aria-hidden />
                  )}
                  {decision === "shield" && (
                    <IconVerdictShield className="mt-0.5 shrink-0 text-[#f87171]" aria-hidden />
                  )}
                  {decision === "caution" && (
                    <IconVerdictCaution className="mt-0.5 shrink-0 text-[#fb923c]" aria-hidden />
                  )}
                  <p className="font-mono text-lg font-bold leading-snug tracking-wider" style={verdictNeon}>
                    {verdictLabel}
                  </p>
                </div>
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
                        background:   "#121212",
                        border:       "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "10px",
                        boxShadow:    "none",
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
              className="relative flex flex-col gap-4 overflow-hidden rounded-xl p-5"
              style={{
                background: "rgba(12, 12, 12, 0.96)",
                border:     "1px solid rgba(255,255,255,0.06)",
                boxShadow:  "none",
              }}
            >
              <div className="relative z-[1] flex flex-col gap-4">
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-cube-text/40">CubeZ Analizi</p>

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
                      {loading
                        ? "CubeZ analiz ediyor…"
                        : "Ürün URL&apos;si gönderdiğinde yapay zeka burada detaylı analiz yapacak."}
                    </p>
                  )}
                </div>

                {savingsTip && (
                  <div
                    className="pt-3"
                    style={{ borderTop: "1px solid rgba(246,140,6,0.22)" }}
                  >
                    <p
                      className="text-[9px] font-bold uppercase tracking-widest"
                      style={{ color: "#ff9f2a" }}
                    >
                      Tasarruf Önerisi
                    </p>
                    <p
                      className="mt-1.5 text-[12.5px] font-bold leading-relaxed"
                      style={{ color: "#ffa63a" }}
                    >
                      {savingsTip}
                    </p>
                  </div>
                )}
              </div>
              {loading && (
                <div
                  className="rationale-shimmer-bar pointer-events-none absolute inset-0 z-[2]"
                  aria-hidden
                />
              )}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
