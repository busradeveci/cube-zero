"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Decision = "shield" | "caution" | "allow" | null;

const LIMIT_KEY = "cubezero_monthly_limit_try";
const HISTORY_KEY = "cubezero_history";
const SAVINGS_KEY = "cubezero_savings";

const STATUS_MESSAGES = [
  "Piyasa taranıyor...",
  "Enflasyon hesaplanıyor...",
  "Bütçe kontrol ediliyor...",
];

interface HistoryItem {
  id: string;
  url: string;
  decision: Decision;
  timestamp: number;
}

interface Props {
  email: string;
}

function InfoIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export function DashboardClient({ email }: Props) {
  const [limit, setLimit] = useState("");
  const [url, setUrl] = useState("");
  const [decision, setDecision] = useState<Decision>(null);
  const [rationale, setRationale] = useState<string | null>(null);
  const [savingsTip, setSavingsTip] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [savings, setSavings] = useState(0);
  const [statusIndex, setStatusIndex] = useState(0);

  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const savedLimit = window.localStorage.getItem(LIMIT_KEY);
    if (savedLimit) setLimit(savedLimit);
    const savedHistory = window.localStorage.getItem(HISTORY_KEY);
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch {}
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
    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`${apiBase}/analyze`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          url: url.trim(),
          monthly_limit_try: limit.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = (data as { detail?: unknown }).detail;
        const msg =
          typeof d === "string"
            ? d
            : Array.isArray(d)
              ? (d as { msg?: string }[]).map((x) => x.msg).filter(Boolean).join(", ")
              : "Analiz başarısız.";
        throw new Error(msg || "Analiz başarısız.");
      }

      const typed = data as {
        decision: Decision;
        rationale: string;
        savings_tip: string;
        confidence: number;
      };
      setDecision(typed.decision);
      setRationale(typed.rationale ?? null);
      setSavingsTip(typed.savings_tip ?? null);
      setConfidence(typeof typed.confidence === "number" ? typed.confidence : null);

      const newItem: HistoryItem = {
        id: Date.now().toString(),
        url: url.trim(),
        decision: typed.decision,
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
    if (decision === "allow") return "AL";
    if (decision === "caution") return "STRATEJİK BEKLEME";
    if (decision === "shield") return "ALMA";
    return null;
  }, [decision]);

  const verdictColor = useMemo(() => {
    if (decision === "allow") return "text-emerald-400";
    if (decision === "caution") return "text-cube-accent";
    if (decision === "shield") return "text-cube-text/40";
    return "";
  }, [decision]);

  function historyDecisionLabel(d: Decision): string {
    if (d === "allow") return "AL";
    if (d === "caution") return "BEKLE";
    if (d === "shield") return "ALMA";
    return "?";
  }

  function historyDecisionColor(d: Decision): string {
    if (d === "allow") return "text-emerald-400";
    if (d === "caution") return "text-cube-accent";
    if (d === "shield") return "text-cube-text/40";
    return "text-cube-text/40";
  }

  const cubeSpeed = loading ? "1s" : "8s";
  const cubePaused = !loading && decision !== null;

  return (
    <>
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
          border: 1.5px solid #bc5727;
          background: rgba(188,87,39,0.025);
        }
        .cube-face.front  { transform: translateZ(60px); }
        .cube-face.back   { transform: rotateY(180deg) translateZ(60px); }
        .cube-face.left   { transform: rotateY(-90deg) translateZ(60px); }
        .cube-face.right  { transform: rotateY(90deg) translateZ(60px); }
        .cube-face.top    { transform: rotateX(90deg) translateZ(60px); }
        .cube-face.bottom { transform: rotateX(-90deg) translateZ(60px); }
      `}</style>

      <main className="min-h-screen bg-cube-bg text-cube-text">
        {/* Ambient glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 45% at 80% 15%, rgba(188,87,39,0.07) 0%, transparent 65%)",
          }}
        />

        {/* Header */}
        <header className="relative z-10 flex items-center justify-between border-b border-white/10 px-8 py-4 backdrop-blur-sm bg-white/[0.02]">
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
        <div className="relative z-10 grid h-[calc(100vh-57px)] grid-cols-[25%_50%_25%] divide-x divide-white/10">

          {/* ── Column 1: Z-ARŞİV ── */}
          <aside className="flex flex-col gap-5 overflow-y-auto p-6">
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
              <div className="h-px w-full overflow-hidden bg-white/10">
                <div
                  className="h-full bg-cube-accent transition-all duration-700"
                  style={{ width: limit ? "0%" : "0%" }}
                />
              </div>
              <input
                value={limit}
                onChange={(e) => persistLimit(e.target.value)}
                placeholder="Limit gir (TRY)"
                className="w-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-cube-text outline-none placeholder:text-cube-text/25 focus:border-cube-accent/50 transition-colors backdrop-blur-md"
              />
            </div>

            {/* Past decisions */}
            <div className="flex flex-1 flex-col gap-2 min-h-0">
              <p className="text-[9px] uppercase tracking-widest text-cube-text/40">
                Geçmiş Analizler
              </p>
              {history.length === 0 ? (
                <p className="text-xs italic text-cube-text/25">Henüz analiz yok</p>
              ) : (
                <ul className="space-y-1.5 overflow-y-auto">
                  {history.map((item) => (
                    <li
                      key={item.id}
                      className="border border-white/[0.08] bg-white/[0.04] px-3 py-2 backdrop-blur-md"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`font-mono text-[10px] font-semibold ${historyDecisionColor(item.decision)}`}
                        >
                          {historyDecisionLabel(item.decision)}
                        </span>
                        <span className="text-[9px] text-cube-text/25">
                          {new Date(item.timestamp).toLocaleDateString("tr-TR")}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-cube-text/30">
                        {item.url}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Savings counter */}
            <div className="border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-md">
              <p className="text-[9px] uppercase tracking-widest text-cube-text/40">
                Toplam Tasarruf
              </p>
              <p className="mt-1 font-mono text-3xl font-semibold text-cube-accent">
                {savings}
              </p>
              <p className="mt-0.5 text-[9px] text-cube-text/25">iptal / bekle kararı</p>
            </div>
          </aside>

          {/* ── Column 2: Cube + Input ── */}
          <section className="flex flex-col items-center p-8 pt-12">
            {/* 3D wireframe cube — upper flex area */}
            <div className="flex flex-1 flex-col items-center justify-center gap-5 min-h-0">
              <div style={{ width: 120, height: 120, perspective: "320px" }}>
                <div
                  className="cube-inner"
                  style={
                    {
                      "--cube-speed": cubeSpeed,
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

              {/* Status / verdict text below cube */}
              <div className="h-6 text-center">
                {loading ? (
                  <p className="font-mono text-xs text-cube-text/50 transition-opacity duration-300">
                    {STATUS_MESSAGES[statusIndex]}
                  </p>
                ) : verdictLabel ? (
                  <p
                    className={`font-mono text-sm font-semibold tracking-[0.2em] ${verdictColor}`}
                  >
                    {verdictLabel}
                  </p>
                ) : (
                  <p className="text-xs text-cube-text/20">CubeZ bekliyor…</p>
                )}
              </div>
            </div>

            {/* URL input + button — anchored to lower area */}
            <div className="w-full max-w-sm space-y-3 pb-6">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Ürün veya teklif URL'si yapıştır…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading && url.trim()) runAnalysis();
                }}
                className="w-full border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-cube-text outline-none placeholder:text-cube-text/25 focus:border-cube-accent/50 transition-colors backdrop-blur-md"
              />
              <button
                type="button"
                onClick={runAnalysis}
                disabled={loading || !url.trim()}
                className="w-full border border-cube-accent bg-white/[0.04] py-3 text-sm font-medium uppercase tracking-widest text-cube-text backdrop-blur-md transition-colors hover:bg-cube-accent disabled:opacity-40"
              >
                CubeZ&apos;e Gönder
              </button>
              {error && (
                <p className="text-center text-xs text-red-400">{error}</p>
              )}
            </div>
          </section>

          {/* ── Column 3: CUBEZ KARARI ── */}
          <aside className="flex flex-col gap-5 p-6">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.35em] text-cube-text/50">
              CUBEZ KARARI
            </h2>

            {/* Verdict card */}
            <div className="border border-white/[0.08] bg-white/[0.04] p-5 backdrop-blur-md">
              <p className="text-[9px] uppercase tracking-widest text-cube-text/40">Karar</p>
              {verdictLabel ? (
                <p
                  className={`mt-3 font-mono text-lg font-bold tracking-wider ${verdictColor}`}
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
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-52 -translate-x-1/2 border border-white/10 bg-cube-bg/95 p-2.5 text-[9px] leading-relaxed text-cube-text/60 backdrop-blur-md group-hover:block">
                      Bu skor markanın güvenilirliğini değil, yapay zekanın veri analizindeki tutarlılık oranını temsil eder.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Reasoning card */}
            <div className="flex-1 border border-white/[0.08] bg-white/[0.04] p-5 backdrop-blur-md flex flex-col gap-4 min-h-0 overflow-y-auto">
              <div>
                <p className="text-[9px] uppercase tracking-widest text-cube-text/40">Gerekçe</p>

                {rationale ? (
                  <div className="mt-3 flex flex-col gap-3">
                    {rationale.split("\n").filter(Boolean).map((line, i) => {
                      const isNumbered = /^\d+\)/.test(line.trim());
                      const numMatch   = line.trim().match(/^(\d+\))\s*(.*)/s);
                      return isNumbered && numMatch ? (
                        <div key={i} className="flex gap-2.5">
                          <span className="mt-0.5 shrink-0 font-mono text-[10px] font-semibold text-cube-accent/70 leading-relaxed">
                            {numMatch[1]}
                          </span>
                          <p className="text-[12.5px] leading-loose text-cube-text/70">
                            {numMatch[2]}
                          </p>
                        </div>
                      ) : (
                        <p key={i} className="text-[12.5px] leading-loose text-cube-text/60">
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

              {/* Savings tip — shown only when present */}
              {savingsTip && (
                <div className="border-t border-cube-accent/15 pt-3">
                  <p className="text-[9px] uppercase tracking-widest text-cube-accent/60">
                    Tasarruf Önerisi
                  </p>
                  <p className="mt-1.5 text-[12px] leading-loose text-cube-accent/80">
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
