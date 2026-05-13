"""Deterministic tools: gelişmiş ürün scraper + finansal yardımcılar."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger("cubezero.tools")

DEFAULT_TIMEOUT = httpx.Timeout(12.0, connect=5.0)
MAX_BYTES = 1_500_000
USER_AGENT = "CubeZeroBot/1.0 (+https://cubezero.local; research)"

_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
_SCRAPE_TIMEOUT = httpx.Timeout(15.0, connect=6.0)

_SCRAPE_HEADERS = {
    "User-Agent": _BROWSER_UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Cache-Control": "no-cache",
}


@dataclass
class PageSignals:
    url: str
    title: str | None
    description: str | None
    price_hints: list[str]
    text_excerpt: str


# ── Fiyat ayrıştırma yardımcıları ────────────────────────────────────────────

def _parse_price_float(raw: str | None) -> float | None:
    """
    Türk ve İngiliz locale fiyat stringini float'a çevirir.
    Örnekler: "1.299,00 TL" → 1299.0 | "890.00" → 890.0 | "1,299" → 1299.0
    """
    if not raw:
        return None
    cleaned = (
        raw.strip()
        .replace("₺", "").replace("TL", "").replace("TRY", "")
        .replace("$", "").replace("€", "")
        .strip()
    )
    # Türk formatı: 1.299,00 (nokta=binlik, virgül=ondalık)
    if "," in cleaned and "." in cleaned:
        # Hangisi binlik hangisi ondalık?
        comma_pos = cleaned.rfind(",")
        dot_pos   = cleaned.rfind(".")
        if dot_pos > comma_pos:
            # 1,299.00 → İngiliz formatı
            cleaned = cleaned.replace(",", "")
        else:
            # 1.299,00 → Türk formatı
            cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        # Yalnız virgül — ondalık olabilir veya binlik
        parts = cleaned.split(",")
        if len(parts) == 2 and len(parts[1]) <= 2:
            cleaned = cleaned.replace(",", ".")  # ondalık virgül
        else:
            cleaned = cleaned.replace(",", "")   # binlik virgül
    cleaned = re.sub(r"[^\d.]", "", cleaned)
    if not cleaned:
        return None
    try:
        val = float(cleaned)
        return val if val > 0 else None
    except ValueError:
        return None


def _price_from_jsonld(soup: BeautifulSoup) -> float | None:
    """JSON-LD structured data'dan fiyat çeker (en güvenilir yöntem)."""
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            raw = script.get_text(strip=True)
            if not raw:
                continue
            data = json.loads(raw)
            # Bazen liste olarak gelir
            if isinstance(data, list):
                data = next((d for d in data if isinstance(d, dict)), {})
            # @graph içinde de olabilir
            if "@graph" in data:
                for item in data["@graph"]:
                    if isinstance(item, dict) and item.get("@type") == "Product":
                        data = item
                        break
            if not isinstance(data, dict):
                continue
            # Product tipini bul
            dtype = data.get("@type", "")
            if "Product" not in str(dtype):
                continue
            offers = data.get("offers", {})
            if isinstance(offers, list):
                offers = offers[0] if offers else {}
            for key in ("price", "lowPrice", "highPrice"):
                val = offers.get(key)
                if val is not None:
                    p = _parse_price_float(str(val))
                    if p and p > 0:
                        logger.debug("JSON-LD fiyat bulundu: %.2f", p)
                        return p
        except Exception:
            continue
    return None


def _price_from_nextdata(soup: BeautifulSoup) -> float | None:
    """Next.js __NEXT_DATA__ script tag'inden fiyat çeker (Trendyol/modern siteler)."""
    script = soup.find("script", id="__NEXT_DATA__")
    if not script:
        return None
    try:
        data = json.loads(script.get_text(strip=True))
        # Trendyol'un bilinen veri yolları
        _paths = [
            ["props", "pageProps", "ssrProductDetailData", "product", "price", "discountedPrice"],
            ["props", "pageProps", "ssrProductDetailData", "product", "price", "sellingPrice"],
            ["props", "pageProps", "ssrProductDetailData", "product", "variants", 0, "price", "discountedPrice"],
            ["props", "pageProps", "product", "price", "discountedPrice"],
            ["props", "pageProps", "product", "price"],
            ["props", "pageProps", "initialState", "productDetail", "product", "price", "discountedPrice"],
        ]
        for path in _paths:
            val = data
            for key in path:
                if isinstance(val, dict) and isinstance(key, str):
                    val = val.get(key)
                elif isinstance(val, list) and isinstance(key, int):
                    val = val[key] if len(val) > key else None
                else:
                    val = None
                if val is None:
                    break
            if val is not None and isinstance(val, (int, float)):
                p = float(val)
                if p > 0:
                    logger.debug("__NEXT_DATA__ fiyat bulundu: %.2f", p)
                    return p
            if val is not None and isinstance(val, str):
                p = _parse_price_float(val)
                if p and p > 0:
                    return p
    except Exception as exc:
        logger.debug("__NEXT_DATA__ parse hatasi: %s", exc)
    return None


def _price_from_scripts(soup: BeautifulSoup) -> float | None:
    """
    Inline script tag'lerinde regex ile fiyat arar.
    Trendyol ve benzeri sitelerin gömülü JSON verisi için fallback.
    """
    patterns = [
        r'"discountedPrice"\s*:\s*([\d.]+)',
        r'"sellingPrice"\s*:\s*([\d.]+)',
        r'"originalPrice"\s*:\s*([\d.]+)',
        r'"priceValue"\s*:\s*([\d.]+)',
        r'"salePrice"\s*:\s*([\d.]+)',
        r'\"price\"\s*:\s*["\']?([\d]+(?:[.,][\d]+)?)["\']?',
    ]
    for script in soup.find_all("script"):
        text = script.get_text()
        if len(text) < 30 or "function" in text[:50]:
            continue
        for pat in patterns:
            m = re.search(pat, text)
            if m:
                p = _parse_price_float(m.group(1))
                if p and p > 1.0:  # 1 TL'den küçük değerleri yoksay
                    logger.debug("Script regex fiyat bulundu: %.2f (pattern: %s)", p, pat)
                    return p
    return None


def _price_from_selectors(soup: BeautifulSoup, selectors: list[str]) -> float | None:
    """CSS selector listesini sırayla dener, ilk geçerli fiyatı döner."""
    for sel in selectors:
        try:
            el = soup.select_one(sel)
            if el:
                text = el.get_text(strip=True)
                p = _parse_price_float(text)
                if p and p > 0:
                    logger.debug("CSS selector '%s' fiyat bulundu: %.2f", sel, p)
                    return p
        except Exception:
            continue
    return None


# ── Ana scraper ───────────────────────────────────────────────────────────────

def scrape_product(url: str) -> dict[str, Any]:
    """
    Desteklenen e-ticaret sitelerinden ürün adı ve fiyatı çeker.

    Fiyat sırasıyla şu yöntemlerle aranır:
      1. JSON-LD structured data
      2. Next.js __NEXT_DATA__
      3. Site'e özgü CSS seçiciler
      4. Inline script regex
      5. og: meta etiketleri

    Fiyat bulunamazsa ValueError fırlatır — 0.0 asla döndürmez.
    """
    parsed_url = urlparse(url)
    if parsed_url.scheme not in ("http", "https") or not parsed_url.netloc:
        raise ValueError("Geçersiz URL. Lütfen geçerli bir http(s) adresi girin.")

    netloc = parsed_url.netloc.lower()

    try:
        with httpx.Client(
            timeout=_SCRAPE_TIMEOUT,
            follow_redirects=True,
            headers=_SCRAPE_HEADERS,
        ) as client:
            resp = client.get(url)
            resp.raise_for_status()
            html = resp.text
    except httpx.HTTPStatusError as exc:
        raise ValueError(
            f"Sayfa yüklenemedi (HTTP {exc.response.status_code}). "
            "URL'nin doğruluğunu kontrol edin."
        ) from exc
    except Exception as exc:
        raise ValueError(
            f"Sayfaya erişilemedi: {exc}. İnternet bağlantınızı ve URL'yi kontrol edin."
        ) from exc

    soup = BeautifulSoup(html, "lxml")

    def og(prop: str) -> str | None:
        tag = soup.find("meta", property=prop)
        return str(tag["content"]).strip() if tag and tag.get("content") else None

    # ── İsim çekme ────────────────────────────────────────────────────────────
    name: str | None = None
    name = og("og:title")
    if not name:
        tag = soup.find("title")
        name = tag.get_text(strip=True) if tag else None

    # ── Fiyat çekme — katmanlı strateji ──────────────────────────────────────
    price: float | None = None

    # 1. JSON-LD (en güvenilir — tüm siteler)
    price = _price_from_jsonld(soup)

    # 2. __NEXT_DATA__ (Trendyol ve Next.js tabanlı siteler)
    if not price:
        price = _price_from_nextdata(soup)

    # 3. Site'e özgü CSS seçiciler
    if not price:
        if "trendyol.com" in netloc:
            price = _price_from_selectors(soup, [
                "span.prc-dsc",           # indirimli fiyat
                "span.prc-slg",           # fiyat slug
                ".pr-bx-pr-dsc span",
                ".product-price-container .prc-dsc",
                "[data-drroot='productPrice'] span",
                ".price-display",
            ])
        elif "hepsiburada.com" in netloc:
            price = _price_from_selectors(soup, [
                "span[id*='offering-price']",
                ".product-price span",
                ".sf-price span",
                "[data-bind*='price'] span",
                ".price-value",
            ])
        elif "amazon.com.tr" in netloc:
            price_whole    = soup.select_one(".a-price-whole")
            price_fraction = soup.select_one(".a-price-fraction")
            if price_whole:
                pw = re.sub(r"[^\d]", "", price_whole.get_text(strip=True))
                pf = re.sub(r"[^\d]", "", price_fraction.get_text(strip=True)) if price_fraction else "00"
                price = _parse_price_float(f"{pw}.{pf}")
            if not price:
                price = _price_from_selectors(soup, [
                    ".a-price .a-offscreen",
                    "#priceblock_dealprice",
                    "#priceblock_ourprice",
                ])
        else:
            # Genel siteler
            price = _price_from_selectors(soup, [
                ".product-price", ".price", ".fiyat",
                "[class*='price']", "[itemprop='price']",
            ])

    # 4. Inline script regex (JavaScript embed)
    if not price:
        price = _price_from_scripts(soup)

    # 5. og: meta etiketleri (son çare)
    if not price:
        price = (
            _parse_price_float(og("og:price:amount"))
            or _parse_price_float(og("product:price:amount"))
        )

    # ── Fiyat bulunamadı → açık hata ─────────────────────────────────────────
    if not price or price <= 0:
        logger.warning("Fiyat bulunamadi: %s (netloc=%s)", url, netloc)
        raise ValueError(
            "Ürün fiyatı otomatik olarak tespit edilemedi. "
            "Sayfa dinamik içerik (JavaScript) kullanıyor olabilir. "
            "Lütfen ürünün Trendyol, Hepsiburada veya Amazon.com.tr adresini kullanın."
        )

    logger.info("Fiyat basariyla cekidi: %.2f TRY | Urun: %s", price, name or "?")
    return {
        "name": name or "Bilinmiyor",
        "price": price,
        "currency": "TRY",
    }


# ── Sayfa sinyalleri (legacy flow için korundu) ───────────────────────────────

def _extract_price_strings(text: str, limit: int = 8) -> list[str]:
    patterns = [
        r"(?:₺|TRY|TL|USD|EUR|\$|€)\s*[\d.,]+",
        r"[\d.,]+\s*(?:₺|TRY|TL|USD|EUR)",
    ]
    found: list[str] = []
    for pat in patterns:
        for m in re.findall(pat, text, flags=re.IGNORECASE):
            s = m.strip()
            if s and s not in found:
                found.append(s)
            if len(found) >= limit:
                return found
    return found


def fetch_page_signals(url: str) -> PageSignals:
    """Fetch URL and return non-executable text signals for the agent."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("Geçerli bir http(s) URL girin.")

    headers = {"User-Agent": USER_AGENT}
    with httpx.Client(timeout=DEFAULT_TIMEOUT, follow_redirects=True, headers=headers) as client:
        with client.stream("GET", url) as resp:
            resp.raise_for_status()
            chunks: list[bytes] = []
            total = 0
            for chunk in resp.iter_bytes():
                total += len(chunk)
                if total > MAX_BYTES:
                    break
                chunks.append(chunk)
            raw = b"".join(chunks)

    charset = "utf-8"
    ct = resp.headers.get("content-type", "")
    if "charset=" in ct.lower():
        try:
            charset = ct.split("charset=")[-1].split(";")[0].strip()
        except Exception:
            charset = "utf-8"

    html = raw.decode(charset, errors="replace")
    soup = BeautifulSoup(html, "lxml")

    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else None

    desc = None
    meta = soup.find("meta", attrs={"name": re.compile(r"^description$", re.I)})
    if meta and meta.get("content"):
        desc = meta["content"].strip()

    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    text = soup.get_text(separator="\n", strip=True)
    hints = _extract_price_strings(text) + _extract_price_strings(title or "")

    return PageSignals(
        url=url,
        title=title,
        description=desc,
        price_hints=hints,
        text_excerpt=text[:6000],
    )


def parse_try_amount(value: str | None) -> Decimal | None:
    if value is None:
        return None
    s = value.strip().replace("₺", "").replace("TL", "").replace("TRY", "").strip()
    if not s:
        return None
    s = s.replace(".", "").replace(",", ".") if s.count(",") == 1 and "." in s else s
    s = s.replace(",", ".")
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def affordability_snapshot(
    price_try: Decimal | None, monthly_limit_try: Decimal | None
) -> dict[str, Any]:
    if price_try is None or monthly_limit_try is None or monthly_limit_try <= 0:
        return {
            "price_try": str(price_try) if price_try is not None else None,
            "monthly_limit_try": str(monthly_limit_try) if monthly_limit_try is not None else None,
            "spend_ratio": None,
        }
    ratio = float(price_try / monthly_limit_try)
    return {
        "price_try": str(price_try),
        "monthly_limit_try": str(monthly_limit_try),
        "spend_ratio": round(ratio, 4),
    }
