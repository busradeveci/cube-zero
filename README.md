

# ⬛ CubeZ

### *Otonom Finansal Koruyucunuz*

**Kullanıcıları manipülatif e-ticaret algoritmalarına karşı yüksek hızlı LPU tabanlı muhakeme ile koruyan dijital kalkan.**

[Python](https://python.org)
[FastAPI](https://fastapi.tiangolo.com)
[Next.js](https://nextjs.org)
[Groq](https://groq.com)
[Supabase](https://supabase.com)
[Lisans: MIT](LICENSE)



---

## CubeZ Nedir?

CubeZ, anlık satın alma dürtülerini gerçek zamanlı olarak durduran bir **Otonom Finansal Kalkan Ajanıdır.** Herhangi bir ürün URL'sini yapıştırın, aylık bütçenizi tanımlayın — CubeZ 4 fazlı ajansal döngüsünü devreye alır: canlı ürün verisini çeker, bütçe oranını hesaplar, fırsat maliyetini projekte eder ve saniyenin altında üç değerli bir karar sunar.

> **Kart bilgisi yok. Banka erişimi yok. Takip yok.**
> CubeZ yalnızca sizin belirlediğiniz aylık limiti ve karar geçmişinizi saklar — bunun ötesinde hiçbir veri işlenmez.

---

## Temel Yetenekler

### Otonom Web Algısı (Autonomous Web Perception)

CubeZ'in Scraping motoru tek bir metadata alanına bağlı değildir. Fiyatı tespit etmek için beş ayrı stratejiyi sırayla uygular:

1. **JSON-LD Structured Data** — Standartlara uygun, en güvenilir yöntem
2. **Next.js** `__NEXT_DATA__` — Sunucu taraflı render'dan ilk durum verisini okur (Amazon, modern SPA'lar)
3. **Site'e Özgü CSS Seçiciler** — Platform bazlı element hedefleme
4. **Inline Script Regex** — Gömülü JSON nesnelerinden fiyat anahtarlarını çeker (`discountedPrice`, `sellingPrice`)
5. **OpenGraph Meta Etiketleri** — Son çare fallback

Fiyat doğrulanamıyorsa CubeZ **açık hata fırlatır** — `0.00 TL` ile sahte bir analiz üretmez. Sıfır sahte veri, sıfır sessiz hata.

---

### Llama 3.3 70B + Groq LPU

CubeZ'in muhakeme çekirdeği, büyük dil modeli çıkarımı için özel olarak tasarlanmış silikon olan **Groq LPU (Language Processing Unit)** altyapısında çalışır:

- 70 milyar parametreli modelde **saniyenin altında** finansal muhakeme
- `response_format: json_object` ile deterministik, tutarlı JSON çıktısı
- GPU tabanlı alternatiflere kıyasla çok daha yüksek kota limiti — kota dolumu riski minimumdur

---

### Akıllı Bütçe Savunması (Smart Budget Defense)

Her analizde şu metrikler otomatik hesaplanır:


| Metrik                 | Formül                                 |
| ---------------------- | -------------------------------------- |
| Bütçe Kullanım Oranı   | `(fiyat / aylık_limit) × 100`          |
| Kalan Bütçe            | `aylık_limit − fiyat`                  |
| Hard Block Tetikleyici | `fiyat > aylık_limit → ALMA (zorunlu)` |


**Hard Block mekanizması Python katmanında** çalışır. LLM yanlış bir karar verse bile Python bu kararı geçersiz kılar ve `ALMA`'ya zorlar. Finansal güvenlik ağı, yapay zekanın üzerindedir.

---

### Yatırım Projeksiyonu (Investment Projection)

CubeZ her satın alma için **fırsat maliyetini** hesaplar. Türkiye için muhafazakâr aylık getiri referansı (~%1.8 — altın/bono ortalaması) baz alınır:

```
1 aylık tahmini kazanç  = fiyat × 0.018
1 ay sonraki değer      = fiyat + kazanç
```

Bu projeksiyon her gerekçenin üçüncü maddesine doğrudan yerleştirilir — kullanıcıya harcamanın somut bir alternatifini gösterir.

---

### Yapılandırılmış Gerekçe — Okunabilir Çıktı

Ajan, her karar için numaralı üç maddelik analiz üretir:

```
1) Bütçe uyumu   : X TL fiyat, Y TL bütçenin %Z'sine karşılık geliyor.
2) Piyasa karşılaştırması : Bu kategoride benzer ürünler A–B TL aralığında.
3) Finansal öneri: Bu parayı harcamak yerine yatırım yapılırsa 1 ayda ~C TL kazanılabilir.
```

---

## 4-Fazlı Ajansal Döngü

```
URL Girişi
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  [A] ALGI — PERCEIVE                                │
│      Çok katmanlı Scraper → ürün adı + gerçek fiyat │
│      Fiyat bulunamazsa ValueError fırlatır          │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  [B] MUHAKEME — REASON                              │
│      Bütçe oranı · kalan bütçe · Hard Block kontrolü│
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  [C] STRATEJİ — STRATEGIZE                          │
│      Fırsat maliyeti · 1 aylık yatırım getirisi     │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  [D] KARAR — VERDICT  (Llama 3.3 · Groq LPU)       │
│      AL · BEKLE · ALMA + 3 maddelik gerekçe         │
│      Python Hard Constraint güvenlik ağı            │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
             Dashboard · Z-Arşivi
```

---

## Teknik Yığın (Tech Stack)


| Katman                      | Teknoloji                                                                 |
| --------------------------- | ------------------------------------------------------------------------- |
| **AI Muhakeme**             | Groq SDK · Llama 3.3 70B Versatile · LPU Inference                        |
| **Backend**                 | Python 3.11+ · FastAPI · Pydantic v2 · `httpx` · BeautifulSoup4           |
| **Kimlik Doğrulama (Auth)** | Supabase Auth · JWKS (ES256 / ECC P-256) + HS256 fallback · `python-jose` |
| **Frontend**                | Next.js 14 (App Router) · TypeScript · Tailwind CSS · Framer Motion       |
| **3D Arayüz**               | Saf CSS 3D wireframe küp — Three.js bağımlılığı yok                       |
| **Veritabanı**              | Supabase (PostgreSQL) — karar geçmişi, bütçe limitleri                    |
| **Ortam Yönetimi**          | `python-dotenv` · `.env.local` (Next.js)                                  |


---

## Mühendislik Kararı: Neden Global Pazaryerleri Önce?

CubeZ, **veri hacmi değil, veri hassasiyeti** üzerine inşa edilmiştir. Yüzlerce e-ticaret platformunda yüzeysel kapsam yerine, büyük global pazaryerlerinin yapılandırılmış ve öngörülebilir veri mimarisine odaklanılmıştır.

Bu yaklaşımın getirileri:

- **Tutarlı fiyat alanı mevcudiyeti** — ürün sayfaları bilinen kalıpları izler: JSON-LD offers, `__NEXT_DATA__` SSR nesneleri, standart CSS seçiciler
- **Yüksek güvenle veri çekme** — aynı sayısal değere ulaşan birden fazla bağımsız strateji
- **Güvenilir finansal tavsiye** — doğrulanmış `890.00 TL` üzerine kurulan karar, tahmin edilen `0.00 TL` üzerine kurulandan katbekat değerlidir

> Yeni platformlar aynı ilkeyle eklenir: bir platform yalnızca çekme doğruluğu güvenilir eşiğe ulaştığında sisteme dahil edilir.

---

## Nasıl Çalışır?

1. Supabase hesabınızla **giriş yapın**
2. Sol panelden **Aylık Bütçe Limitinizi** girin (örn. `5000` TL)
3. Desteklenen bir pazaryerinden **ürün URL'sini** giriş alanına yapıştırın
4. `Enter`'a basın veya `**CubeZ'e Gönder`** butonuna tıklayın
5. Ajan 4 fazlı döngüsünü çalıştırır — Groq LPU sayesinde genellikle **1 saniyenin altında** tamamlanır
6. **AL / STRATEJİK BEKLEME / ALMA** kararınızı, 3 maddelik gerekçe ve tasarruf önerisiyle birlikte alın
7. Her karar **Z-Arşivi**'ne otomatik kaydedilir — geçmiş otonom kararlarınızın kişisel defteri
8. **Tasarruf Sayacı**, CubeZ'in engellediği dürtüsel satın alma girişimlerini takip eder

---

## Proje Yapısı

```
cube-zero/
├── backend/
│   ├── agents/
│   │   ├── cubez_agent.py      # 4 fazlı ajansal döngü (Groq / Llama 3.3)
│   │   └── tools.py            # Çok katmanlı Scraper + finansal yardımcılar
│   ├── main.py                 # FastAPI gateway · JWKS Auth · /analyze endpoint
│   ├── requirements.txt
│   └── .env
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx            # Hero landing page
│   │   ├── auth/page.tsx       # Giriş / Kayıt
│   │   └── dashboard/
│   │       └── DashboardClient.tsx   # Command Center arayüzü
│   ├── components/
│   │   └── NeuralCubeScene.tsx # CSS 3D wireframe küp
│   ├── tailwind.config.ts
│   └── .env.local
│
└── README.md
```

---

## Kurulum

### Gereksinimler

- Python 3.11+
- Node.js 18+
- [Groq API anahtarı](https://console.groq.com) (ücretsiz katman yeterlidir)
- [Supabase](https://supabase.com) projesi (ücretsiz katman yeterlidir)

---

### Backend

```bash
# 1. Backend klasörüne geç
cd backend

# 2. Sanal ortam oluştur ve etkinleştir
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

# 3. Bağımlılıkları yükle
pip install -r requirements.txt

# 4. Ortam değişkenlerini yapılandır
# backend/.env dosyasını oluştur:
```

```env
GROQ_API_KEY=gsk_anahtariniz_buraya
GROQ_MODEL=llama-3.3-70b-versatile

SUPABASE_URL=https://proje-referenceiniz.supabase.co
SUPABASE_JWT_SECRET=supabase_hs256_secret

CORS_ORIGINS=http://localhost:3000
DEBUG_BYPASS_AUTH=0
```

```bash
# 5. API sunucusunu başlat
uvicorn main:app --reload --port 8000
```

API → `http://localhost:8000`
Etkileşimli dokümantasyon → `http://localhost:8000/docs`

---

### Frontend

```bash
# 1. Frontend klasörüne geç
cd frontend

# 2. Bağımlılıkları yükle
npm install

# 3. Ortam değişkenlerini yapılandır
# frontend/.env.local dosyasını oluştur:
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://proje-referenceiniz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=supabase_anon_anahtariniz
NEXT_PUBLIC_API_URL=http://localhost:8000
```

```bash
# 4. Geliştirme sunucusunu başlat
npm run dev
```

Uygulama → `http://localhost:3000`

---

## Ortam Değişkenleri Referansı

### `backend/.env`


| Değişken              | Zorunlu | Açıklama                                        |
| --------------------- | ------- | ----------------------------------------------- |
| `GROQ_API_KEY`        | Evet    | Groq konsol API anahtarı                        |
| `GROQ_MODEL`          | Hayır   | Varsayılan: `llama-3.3-70b-versatile`           |
| `SUPABASE_URL`        | Evet    | Supabase proje URL'si                           |
| `SUPABASE_JWT_SECRET` | Evet    | Legacy HS256 secret (Supabase → Settings → API) |
| `CORS_ORIGINS`        | Hayır   | Virgülle ayrılmış izin verilen origin'ler       |
| `DEBUG_BYPASS_AUTH`   | Hayır   | Yalnızca local geliştirmede `1` yapın           |


### `frontend/.env.local`


| Değişken                        | Zorunlu | Açıklama                      |
| ------------------------------- | ------- | ----------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Evet    | Backend ile aynı Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Evet    | Supabase proje anon key       |
| `NEXT_PUBLIC_API_URL`           | Evet    | Backend base URL              |


---

## API Referansı

### `POST /analyze`

`Authorization: Bearer <supabase_jwt>` header'ı gereklidir.

**İstek gövdesi:**

```json
{
  "url": "https://www.amazon.com.tr/dp/B0EXAMPLE",
  "monthly_limit_try": "5000"
}
```

**Yanıt:**

```json
{
  "verdict": "ALMA",
  "decision": "shield",
  "rationale": "1) Bütçe uyumu: ...\n2) Piyasa karşılaştırması: ...\n3) Finansal öneri: ...",
  "savings_tip": "Bu ürünü listeye ekleyip fiyat düşüşünü bekleyebilirsin.",
  "confidence": 0.88,
  "product_name": "Sony WH-1000XM5 Kulaklık",
  "price": 4299.0
}
```

**Karar değerleri:**


| Değer               | Decision  | Anlam                                                     |
| ------------------- | --------- | --------------------------------------------------------- |
| `AL`                | `allow`   | Satın al — fiyat bütçe içinde ve piyasaya uygun           |
| `STRATEJİK BEKLEME` | `caution` | Bekle — fiyat sınırda ya da piyasa ortalamasının üzerinde |
| `ALMA`              | `shield`  | Satın alma — fiyat bütçeyi aşıyor veya aşırı pahalı       |


### `GET /health`

Auth gerektirmez. `{"status": "ok", "service": "cubezero"}` döndürür.

---

## Güvenlik Modeli

- **JWT Doğrulama**: Çift modlu — birincil ES256 (JWKS üzerinden Supabase ECC P-256 token'ları), fallback HS256 (shared secret). JWKS yanıtı 1 saat boyunca thread-safe olarak önbelleğe alınır.
- **Kart verisi yok**: CubeZ hiçbir zaman ödeme bilgisi istemez, saklamaz veya iletmez.
- **PII loglama yok**: Ürün URL'leri ve kararlar yalnızca kullanıcının tarayıcı local storage'ında ve Supabase'de kullanıcı kapsamlı satır olarak tutulur.
- **Hard Budget Constraint**: Bütçe aşım bloğu LLM kararından önce Python'da uygulanır — yapay zeka finansal güvenlik engelini geçemez.

---

## Lisans

MIT — ayrıntılar için [LICENSE](LICENSE) dosyasına bakın.

---

