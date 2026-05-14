"""Deterministic tools: gelişmiş ürün scraper + finansal yardımcılar."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import urlparse, urlunparse

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger("cubezero.tools")

DEFAULT_TIMEOUT = httpx.Timeout(12.0, connect=5.0)
MAX_BYTES = 1_500_000
USER_AGENT = "CubeZeroBot/1.0 (+https://cubezero.local; research)"

_BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0"
)
_SCRAPE_TIMEOUT = httpx.Timeout(18.0, connect=8.0)

_SCRAPE_HEADERS = {
    "User-Agent": _BROWSER_UA,
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,image/apng,*/*;q=0.8"
    ),
    # Amazon TR: Türkçe öncelikli (bot sayfayı dil ile getirir)
    "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.5,en;q=0.4",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.google.com/",
    "Connection": "keep-alive",
    "Cache-Control": "max-age=0",
    "Upgrade-Insecure-Requests": "1",
    "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not=A?Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
}


# Amazon ürün sayfası yolu: ASIN → kısa /dp/.../ URL (uzun ref= parametreleri bot skorunu artırır)
_ASIN_IN_PATH = re.compile(
    r"(?:/dp/|/gp/product/|/gp/aw/d/|/exec/obidos/ASIN/)([A-Z0-9]{10})(?:[/?#]|$)",
    re.IGNORECASE,
)


def _is_amazon_retail_host(netloc: str) -> bool:
    n = netloc.lower()
    if "amazonaws.com" in n or "media-amazon.com" in n:
        return False
    return "amazon." in n


def _amazon_canonical_dp_url(parsed: Any) -> str:
    """Aynı ürün için kısa PDP adresi; fiyat HTML'i için daha stabil."""
    path = parsed.path or ""
    m = _ASIN_IN_PATH.search(path)
    if not m:
        return urlunparse(
            (parsed.scheme, parsed.netloc, path, "", parsed.query, "")
        )
    asin = m.group(1).upper()
    clean_path = f"/dp/{asin}/"
    return urlunparse((parsed.scheme, parsed.netloc, clean_path, "", "", ""))


def _html_looks_like_amazon_product_page(html: str) -> bool:
    low = html.lower()
    if len(html) < 12_000 and (
        "validatecaptcha" in low
        or "ap/cvf" in low
        or "robot check" in low
    ):
        return False
    if "a-price" in low:
        return len(html) > 18_000 or "data-asin" in low or "twister" in low
    return len(html) >= 75_000


def _fetch_amazon_html_curl(canonical: str, original: str) -> str | None:
    """
    Amazon, saf httpx TLS ile bot sayfası döndürür; curl_cffi Chrome impersonate
    ile gerçek ürün HTML'i alınır (TLS/JA3 uyumu).
    """
    try:
        from curl_cffi import requests as curl_requests
    except ImportError:
        logger.warning(
            "curl-cffi kurulu degil; Amazon fiyatlari siklikle basarisiz olur. "
            "pip install curl-cffi"
        )
        return None

    for impersonate in ("chrome131", "chrome124", "chrome120"):
        for attempt in (canonical, original):
            try:
                r = curl_requests.get(
                    attempt,
                    impersonate=impersonate,
                    timeout=28,
                    allow_redirects=True,
                    headers={
                        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.5,en;q=0.4",
                        "Referer": "https://www.google.com/",
                    },
                )
            except Exception as exc:
                logger.debug(
                    "Amazon curl_cffi GET hata (imp=%s): %s",
                    impersonate,
                    exc,
                )
                continue
            if r.status_code != 200:
                continue
            body = r.text
            if _html_looks_like_amazon_product_page(body):
                logger.info(
                    "Amazon HTML curl_cffi ile alindi (imp=%s, len=%s, url=%s...)",
                    impersonate,
                    len(body),
                    attempt[:70],
                )
                return body
    return None


def _fetch_html_for_scrape(url: str, parsed) -> str:
    """Ürün sayfasi HTML — Amazon icin curl_cffi oncelikli."""
    netloc = (parsed.netloc or "").lower()
    if _is_amazon_retail_host(netloc):
        canonical = _amazon_canonical_dp_url(parsed)
        curl_html = _fetch_amazon_html_curl(canonical, url)
        if curl_html:
            return curl_html

    try:
        with httpx.Client(
            timeout=_SCRAPE_TIMEOUT,
            follow_redirects=True,
            headers=_SCRAPE_HEADERS,
        ) as client:
            first = (
                _amazon_canonical_dp_url(parsed)
                if _is_amazon_retail_host(netloc)
                else url
            )
            resp = client.get(first)
            if (
                _is_amazon_retail_host(netloc)
                and first != url
                and resp.status_code == 200
                and not _html_looks_like_amazon_product_page(resp.text)
            ):
                resp = client.get(url)
            resp.raise_for_status()
            return resp.text
    except httpx.HTTPStatusError as exc:
        raise ValueError(
            f"Sayfa yüklenemedi (HTTP {exc.response.status_code}). "
            "URL'nin doğruluğunu kontrol edin."
        ) from exc
    except Exception as exc:
        raise ValueError(
            f"Sayfaya erişilemedi: {exc}. İnternet bağlantınızı ve URL'yi kontrol edin."
        ) from exc


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
        .replace("\u202f", "")
        .replace("\xa0", " ")
        .replace("₺", "")
        .replace("TL", "")
        .replace("TRY", "")
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
    elif "." in cleaned:
        # Yalnız nokta: "54.999" → Türk binlikleri | "12.99" → ondalık
        numeric = re.sub(r"[^\d.]", "", cleaned)
        dots = numeric.split(".")
        if len(dots) >= 2 and all(p.isdigit() for p in dots):
            last = dots[-1]
            if len(last) == 3:
                cleaned = "".join(dots)
            # aksi halde float için numeric korunur (örn. 12.99)

    cleaned = re.sub(r"[^\d.]", "", cleaned)
    if not cleaned:
        return None
    try:
        val = float(cleaned)
        return val if val > 0 else None
    except ValueError:
        return None


def _extract_prices_from_jsonld_offer_block(offers: Any) -> list[float]:
    """Product.offers yapısından (Offer | AggregateOffer | liste) olası fiyatları toplar."""
    out: list[float] = []

    def walk(node: Any) -> None:
        if node is None:
            return
        if isinstance(node, list):
            for x in node:
                walk(x)
            return
        if not isinstance(node, dict):
            return
        otype = str(node.get("@type", "")).lower()
        keys_trial = ("lowPrice", "highPrice", "price")
        if "aggregateoffer" in otype:
            for key in keys_trial:
                val = node.get(key)
                if val is None:
                    continue
                # Bazen Offers @type ile iç içe
                if isinstance(val, dict) and "price" not in val and all(
                    k not in val for k in keys_trial
                ):
                    walk(val)
                    continue
                p = _parse_price_float(str(val))
                if p and p > 0:
                    out.append(p)
            walk(node.get("offers"))
            return
        # Offer
        seen_scalar = False
        for key in keys_trial:
            val = node.get(key)
            if val is None:
                continue
            if isinstance(val, dict):
                for sub_key in ("@value", "value", "price"):
                    pv = val.get(sub_key)
                    if pv is not None:
                        p = _parse_price_float(str(pv))
                        if p and p > 0:
                            out.append(p)
                            seen_scalar = True
            else:
                p = _parse_price_float(str(val))
                if p and p > 0:
                    out.append(p)
                    seen_scalar = True
        if not seen_scalar:
            walk(node.get("offers"))

    walk(offers)
    return out


def _price_from_jsonld(soup: BeautifulSoup) -> float | None:
    """JSON-LD structured data'dan fiyat çeker (en güvenilir yöntem)."""
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            raw = script.get_text(strip=True)
            if not raw:
                continue
            data = json.loads(raw)
            candidates: list[dict[str, Any]] = []
            if isinstance(data, list):
                candidates = [d for d in data if isinstance(d, dict)]
            elif isinstance(data, dict):
                if "@graph" in data:
                    for item in data["@graph"]:
                        if isinstance(item, dict):
                            candidates.append(item)
                else:
                    candidates = [data]

            for cand in candidates:
                if not isinstance(cand, dict):
                    continue
                dtype = cand.get("@type", "")
                dtypes = dtype if isinstance(dtype, list) else [dtype]
                types_s = " ".join(str(t) for t in dtypes)
                if "Product" not in types_s:
                    continue
                offers = cand.get("offers")
                found = _extract_prices_from_jsonld_offer_block(offers)
                if found:
                    chosen = min(found)  # çoğunlukla liste fiyatından düşük = satış fiyatı
                    logger.debug("JSON-LD fiyat bulundu: %.2f (%s aday)", chosen, len(found))
                    return chosen
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


def _compute_discount_pct(original: float, current: float) -> float:
    """Liste / eski fiyat ile güncel fiyat arasındaki indirim yüzdesi (0–99.99)."""
    if original <= 0 or current <= 0 or current >= original * 0.999:
        return 0.0
    pct = (original - current) / original * 100.0
    return round(min(max(pct, 0.0), 99.99), 2)


def _amazon_try_embedded_json_price(html: str) -> float | None:
    """Amazon ürün sayfasında gömülü JSON bloklarından fiyat yakalar."""

    compact = html.replace("\\u002F", "/")
    candidates: list[float] = []

    def try_parse(label: str, m: re.Match[str]) -> None:
        p = _parse_price_float(m.group(1))
        if p and p > 0:
            candidates.append(p)
            logger.debug("Amazon regex %s → %.2f", label, p)

    contextual = [
        (
            r'"buyingOptionType"\s*:\s*"NEW"[\s\S]{0,4000}?'
            r'"displayString"\s*:\s*"([^"]+)"',
            "buyingOptionType+displayString",
        ),
        (
            r'"priceToPay"\s*:[^{]{0,2600}?'
            r'"displayString"\s*:\s*"([^"]+)"',
            "priceToPay+displayString",
        ),
    ]
    for pat, label in contextual:
        m = re.search(pat, compact, re.IGNORECASE)
        if m:
            try_parse(label, m)

    simpler = [
        (r'"landingAsinPrice"\s*:\s*"([\d.]+(?:,[\d]{1,2})?)"', "landingAsinPrice"),
        (r'"displayAmount"\s*:\s*"([\d\s\u202f\.]+(?:,[\d]{1,2})?)"', "displayAmount"),
        (r'"displayString"\s*:\s*"([\d\s\u202f\.]+(?:,[\d]{1,2})?)\s*TL"', "displayString+TL"),
    ]
    for pat, label in simpler:
        for m in re.finditer(pat, compact, re.IGNORECASE):
            try_parse(label, m)
            break

    if not candidates:
        return None

    uniq = sorted({round(c, 2) for c in candidates})
    if len(uniq) == 1:
        return float(uniq[0])
    # Birden fazla — genelde kampanyalı güncel satış için en düşük makul TRY
    return float(min(uniq))


def _price_from_amazon_tr(soup: BeautifulSoup, html: str) -> float | None:
    """Amazon — önce satış/indirimli fiyat (a-text-price = liste, en sonda yedek)."""
    dom_selectors = [
        "#price_inside_buybox .a-price.priceToPay .a-offscreen",
        "#price_inside_buybox .reinventPricePriceToPayMargin .a-price .a-offscreen",
        "#corePrice_feature_div .reinventPricePriceToPayMargin .a-price .a-offscreen",
        "#corePrice_feature_div .a-price.priceToPay .a-offscreen",
        "#corePriceDisplay_desktop_feature_div .a-price.priceToPay .a-offscreen",
        "#corePrice_feature_div .a-price .a-offscreen",
        "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",
        "#desktop_unifiedPrice .a-price .a-offscreen",
        "#tp_price_block_total_price_ww .a-price .a-offscreen",
        "span[data-cy='price-recipe'] .a-price.priceToPay .a-offscreen",
        ".a-price.priceToPay .a-offscreen",
        "#priceblock_dealprice",
        "#priceblock_ourprice",
        "span#priceblock_ourprice",
        "span#aod-price-1 .a-offscreen",
        "span#aod-price-1 span.a-price .a-offscreen",
        ".a-price .a-offscreen",
        "span.a-price-whole",
    ]
    price = _price_from_selectors(soup, dom_selectors)
    if price:
        return price

    for box_sel in (
        "span.a-price.aok-align-center.reinventPricePriceToPayMargin.priceToPay",
        "span.a-price.priceToPay",
        "#corePrice_feature_div span.a-price",
        "span[data-csa-c-slot-id=\"apex_dp_offer_display\"] span.a-price",
    ):
        box = soup.select_one(box_sel)
        if box:
            p = _parse_price_float(box.get_text(" ", strip=True))
            if p and p > 0:
                logger.debug("Amazon buy-box '%s' metni parse: %.2f", box_sel, p)
                return p

    whole_el = soup.select_one(".a-price-whole, .a-price .a-price-whole")
    if whole_el:
        parent = whole_el.find_parent("span", class_=re.compile(r"\ba-price\b"))
        if parent:
            p = _parse_price_float(parent.get_text(" ", strip=True))
            if p and p > 0:
                logger.debug(
                    "Amazon span.a-price (parent of whole) metni parse: %.2f", p
                )
                return p

    meta = soup.find("meta", itemprop="price")
    if meta and meta.get("content"):
        p = _parse_price_float(meta["content"])  # type: ignore[arg-type]
        if p and p > 0:
            return p
    twitter = soup.find("meta", attrs={"name": "twitter:data1"})
    if twitter and twitter.get("content"):
        p = _parse_price_float(str(twitter["content"]))
        if p and p > 0:
            return p

    ogp = soup.find("meta", property="og:price:amount") or soup.find(
        "meta", attrs={"property": "product:price:amount"}
    )
    if ogp and ogp.get("content"):
        p = _parse_price_float(str(ogp["content"]))
        if p and p > 0:
            return p

    return _amazon_try_embedded_json_price(html)


def _amazon_list_reference_price(soup: BeautifulSoup) -> float | None:
    """Amazon liste / üstü çizili referans fiyatı (a-text-price vb.)."""
    return _price_from_selectors(
        soup,
        [
            "span.a-price.a-text-price .a-offscreen",
            "#corePrice_desktop .a-text-price .a-offscreen",
            ".basisPrice .a-offscreen",
            "#listPrice",
            ".a-size-small.a-color-price.a-text-strike .a-offscreen",
            ".a-size-small.a-color-secondary .a-offscreen",
            "#corePrice_feature_div .a-text-price .a-offscreen",
            "#apex_desktop .a-text-price .a-offscreen",
        ],
    )


def _enrich_current_and_original_prices(
    soup: BeautifulSoup,
    netloc: str,
    base_current: float,
) -> tuple[float, float, float]:
    """
    base_current: birincil scraper çıktısı (satış fiyatı varsayılır).
    Dönüş: (current_price, original_price, discount_percentage).
    """
    current = base_current
    original = base_current

    if _is_amazon_retail_host(netloc):
        list_p = _amazon_list_reference_price(soup)
        if list_p and list_p > current * 1.003:
            original = list_p
        else:
            original = current
    elif "trendyol.com" in netloc:
        list_p = _price_from_selectors(
            soup,
            ["span.prc-org", ".prc-org", ".pr-bx-pr-org span", ".pr-bx-pr-org"],
        )
        if list_p and list_p > current * 1.003:
            original = list_p
        else:
            original = current
    elif "hepsiburada.com" in netloc:
        list_p = _price_from_selectors(
            soup,
            [
                ".product-price-wrapper .old-price",
                ".oldPriceStrickthrough",
                ".price-old-value",
                "[class*='old-price']",
            ],
        )
        if list_p and list_p > current * 1.003:
            original = list_p
        else:
            original = current
    else:
        sale_c = _price_from_selectors(
            soup,
            [".price-new", ".sale-price", ".current-price", ".price--sale"],
        )
        old_c = _price_from_selectors(
            soup,
            [
                ".price-old",
                ".original-price",
                ".was-price",
                ".compare-at-price",
                ".price--was",
            ],
        )
        if sale_c and old_c and old_c > sale_c * 1.003:
            current = sale_c
            original = old_c
        elif old_c and old_c > current * 1.003:
            original = old_c
        else:
            original = current

    disc = _compute_discount_pct(original, current)
    return current, original, disc


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

    html = _fetch_html_for_scrape(url, parsed_url)

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
        elif _is_amazon_retail_host(netloc):
            price = _price_from_amazon_tr(soup, html)
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
        logger.warning(
            "Fiyat bulunamadi: %s (netloc=%s, html_bytes~%s)",
            url,
            netloc,
            len(html),
        )
        if "amazon." in netloc and (
            ("captcha" in html.lower() and len(html) < 50_000)
            or "validatecaptcha" in html.lower().replace("\\", "")
        ):
            raise ValueError(
                "Amazon ürün sayfası yerine doğrulama veya bloklama içeriği alındı; "
                "fiyat okunamadı. Aynı URL'yi birkaç dakika sonra veya kullanıcı "
                "tarayıcısından tekrar deneyin."
            )
        raise ValueError(
            "Ürün fiyatı otomatik olarak tespit edilemedi. "
            "Sayfa dinamik içerik (JavaScript) kullanıyor olabilir. "
            "Lütfen ürünün Trendyol, Hepsiburada veya Amazon.com.tr adresini kullanın."
        )

    current_price, original_price, discount_pct = _enrich_current_and_original_prices(
        soup, netloc, float(price)
    )

    logger.info(
        "Fiyat cekildi: current=%.2f original=%.2f indirim=%.2f%% | Urun: %s",
        current_price,
        original_price,
        discount_pct,
        name or "?",
    )
    return {
        "name": name or "Bilinmiyor",
        "currency": "TRY",
        "current_price": current_price,
        "original_price": original_price,
        "discount_percentage": discount_pct,
        "price": current_price,
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
