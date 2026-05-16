# 🛡️ CubeZero: Finansal Kararlarınızın Otonom Koruyucusu

E-ticaret sayfalarındaki ani satın alma dürtüsünü kesmek için CubeZero, **deterministik Python çekirdeği** (ölçülebilir fiyat, bütçe matematiği, veto) ile **olasılıksal LLM katmanını** (yapılandırılmış Türkçe gerekçe) ardışık konumlandırır: önce matematik ve veri doğruluğu, sonra dil.

Sistem omurgası: çok stratejili **web scraping** ile gerçek fiyat → kod içi **budget hard block** → sabit parametreli **opportunity-cost** projeksiyonu → **Groq LPU** üzerinde tek atımlık **Llama 3.3 · 70B** JSON verdict (**AL / BEKLE / ALMA**).

## 🧠 Mimari Omurga ve Teknolojik Altyapı (Intelligence Stack)

- **Groq LPU (Ultra-Low Latency Inference):** Düşük gecikmeli çıkarım ile analiz süresini hackathon/demo ve günlük kullanım için saniyeler bandına yaklaştırır; kritik zaman diliminde “şimdi al” dürtüsüne müdahale etmek için hız doğrudan ürün sinyali olur.

- **Llama 3.3 · 70B (State-of-the-Art LLM):** Deterministik metrikleri üç maddelik, tutarlı **JSON rationale** ile birleştirerek jüri ve kullanıcıya **okunabilir finansal gerekçe** üretir; model yalnızca güvenlik sınırları çizilmiş veri üzerinde konuşur.

- **4-Phase Deterministic Agentic Workflow:** Fazlar A–C tamamen kodda ölçülür; faz D’ye gelindiğinde “**önce kural ve sayı**, sonra dil**” ilkesi bozulmaz — dil katmanı bütçe aşımında **Hard Block** ile **ALMA**’ya **zorunlu** eşiklenmiştir.

## 🔄 4 Fazlı Otonom İş Akışı (The Pipeline)

1. **01 | Algıla (Perceive):** Multi-strategy web scraping & fail-closed price extraction (**Amazon TR**, **Trendyol**, **Hepsiburada**) — doğrulanamayan fiyat için sessiz `0 TL` yerine hata.

2. **02 | Muhakeme (Reason):** Python tabanlı deterministik bütçe optimizasyonu. Limit aşımında tavizsiz **Hard Block** (**Veto**): fiyatı bütçe üzerindeyse çıktı politikası **`ALMA`**.

3. **03 | Strateji Geliştir (Strategize):** Sabit fırsat maliyeti simülasyonu ve finansal kalkan projeksiyonu (referans `~%1.8` aylık — kod sabiti); kullanıcıya harcamanın alternatif zaman çizgisini rakamsal gösterir.

4. **04 | Hüküm Ver (Verdict):** Güvenlik sınırları altında **`response_format: json_object`** ile yapılandırılmış çıktı ve rasyonel karar (**AL** / **BEKLE** / **ALMA**); LLM çıktısı kural bozarsa Python katmanı düzeltir.

### Teknoloji Özeti (Stack)

| Katman | Teknoloji |
|--------|-----------|
| Backend | **Python** · **FastAPI** · `httpx` · BeautifulSoup |
| AI | **Groq SDK** · **Llama 3.3 · 70B** |
| Auth | **Supabase Auth** · JWT doğrulama (`/analyze`) |
| Frontend | **Next.js 14** (App Router) · **TypeScript** · **Tailwind CSS** |

## 🚀 Kurulum ve Çalıştırma (Quick Start)

Monorepo kök dizininden; iki ayrı terminal kullanın (backend + frontend).

```bash
# Backend bağımlılıkları (Python 3.11+ önerilir)
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate  |  macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# Frontend bağımlılıkları (Node.js 18+)
cd ../frontend
npm install
```

**Çevre değişkenleri:** `backend/.env` ve `frontend/.env.local` dosyalarını oluşturun.

```env
# backend/.env
GROQ_API_KEY=your_key
GROQ_MODEL=llama-3.3-70b-versatile
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_JWT_SECRET=your_jwt_secret
CORS_ORIGINS=http://localhost:3000

# frontend/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

```bash
# Terminal 1 — API
cd backend
uvicorn main:app --reload --port 8000

# Terminal 2 — UI
cd frontend
npm run dev
```

Uygulama: `http://localhost:3000` · API: `http://localhost:8000` · Swagger: `/docs`.

---

## API (özet)

- **`POST /analyze`** — `Authorization: Bearer <Supabase JWT>`, gövde: `url`, `monthly_limit_try`.
- **`GET /health`** — auth yok.

---

## Güvenlik ve Kısıt

- Kart / banka bağlantısı yok.
- **`DEBUG_BYPASS_AUTH=1`** yalnızca yerel geliştirme için; üretimde kapatın.

---

## Lisans

MIT — ayrıntılar için [LICENSE](LICENSE).
