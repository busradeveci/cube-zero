"""
CubeZ Agent — Groq/Llama 3.3 Derin Muhakeme Finansal Ajan.

4 Fazlı Ajansal Döngü:
  [A] PERCEIVE   → Ürün adı + gerçek fiyatı URL'den çek
  [B] REASON     → Bütçe yüzdesi + kalan bütçeyi hesapla
  [C] STRATEGIZE → 1 aylık yatırım getirisi (fırsat maliyeti)
  [D] VERDICT    → Hard constraint + Llama 3.3 derin muhakeme kararı
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Any, Literal

from agents.tools import scrape_product

logger = logging.getLogger("cubezero.agent")

DecisionLabel = Literal["shield", "caution", "allow"]

_VERDICT_TO_DECISION: dict[str, DecisionLabel] = {
    "AL":    "allow",
    "ALMA":  "shield",
    "BEKLE": "caution",
}
_VERDICT_CONFIDENCE: dict[str, float] = {
    "AL":    0.82,
    "ALMA":  0.88,
    "BEKLE": 0.65,
}


@dataclass
class AnalyzeResult:
    """Yapılandırılmış analiz sonucu — main.py API sözleşmesiyle uyumlu."""

    verdict: str
    reason: str
    savings_tip: str
    product_name: str
    price: float
    original_price: float
    discount_percentage: float
    decision: DecisionLabel
    rationale: str
    confidence: float

    def as_dict(self) -> dict[str, Any]:
        return {
            "verdict":              self.verdict,
            "reason":               self.reason,
            "savings_tip":          self.savings_tip,
            "product_name":         self.product_name,
            "price":                self.price,
            "current_price":        self.price,
            "original_price":       self.original_price,
            "discount_percentage": self.discount_percentage,
            "decision":             self.decision,
            "rationale":            self.rationale,
            "confidence":           self.confidence,
        }


class CubeZAgent:
    """Groq/Llama 3.3 tabanlı derin muhakeme finansal ajan."""

    _MONTHLY_RETURN_RATE: float = 0.018  # Türkiye aylık altın/bono tahmini

    def __init__(self, model: str | None = None) -> None:
        self.model = model or os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        self._client: Any = None

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY tanımlı değil.")
        try:
            from groq import Groq
        except ImportError as exc:
            raise RuntimeError("groq paketi eksik: pip install groq") from exc
        self._client = Groq(api_key=api_key)
        return self._client

    # ── 4 Fazlı Ajansal Döngü ─────────────────────────────────────────────────

    def analyze(self, url: str, budget: float) -> AnalyzeResult:
        """
        4 fazlı derin muhakeme:
          A) PERCEIVE   — gerçek ürün fiyatını scrape et
          B) REASON     — bütçe yüzdesi + kalan bütçe
          C) STRATEGIZE — 1 aylık yatırım getirisi
          D) VERDICT    — hard constraint + Llama 3.3 kararı
        """

        # ── [A] PERCEIVE ──────────────────────────────────────────────────────
        logger.info("[A-PERCEIVE] URL analiz ediliyor: %s", url)
        product = scrape_product(url)   # ValueError fırlatır, 0.0 döndürmez
        product_name: str = product["name"]   # type: ignore[assignment]
        price: float = float(product["current_price"])  # type: ignore[assignment]
        original_price: float = float(
            product.get("original_price", price)  # type: ignore[assignment]
        )
        discount_pct: float = float(
            product.get("discount_percentage", 0.0)  # type: ignore[assignment]
        )
        logger.info(
            "[A-PERCEIVE] Urun: %s | Fiyat: %.2f TRY | Liste: %.2f | Indirim: %.2f%%",
            product_name,
            price,
            original_price,
            discount_pct,
        )

        # ── [B] REASON ────────────────────────────────────────────────────────
        logger.info("[B-REASON] Butce uyumu hesaplaniyor...")
        has_budget   = budget > 0
        budget_pct   = (price / budget * 100) if has_budget else 0.0
        budget_after = (budget - price)        if has_budget else 0.0

        if has_budget:
            budget_context = (
                f"Kullanıcının aylık bütçesi : {budget:,.0f} TL\n"
                f"Ürün fiyatı                : {price:,.2f} TL\n"
                f"Bütçe kullanım oranı       : %{budget_pct:.1f}\n"
                f"Satın alma sonrası kalan   : {budget_after:,.0f} TL"
            )
        else:
            budget_context = "Kullanıcı aylık bütçe limiti belirtmedi."

        # ── [C] STRATEGIZE ────────────────────────────────────────────────────
        logger.info("[C-STRATEGIZE] Firsat maliyeti hesaplaniyor...")
        monthly_gain  = price * self._MONTHLY_RETURN_RATE
        future_1month = price + monthly_gain
        investment_context = (
            f"Bu para yerine yatırım yapılırsa (~%{self._MONTHLY_RETURN_RATE*100:.1f} aylık getiri):\n"
            f"  1 ay sonra tahmini değer : {future_1month:,.0f} TL\n"
            f"  Fırsat maliyeti          : {monthly_gain:,.0f} TL"
        )

        # ── [D] VERDICT ───────────────────────────────────────────────────────
        logger.info("[D-VERDICT] Llama 3.3 70B muhakeme basliyor...")

        # HARD CONSTRAINT: fiyat > bütçe → her koşulda ALMA
        hard_alma = has_budget and price > budget
        if hard_alma:
            logger.warning(
                "[D-VERDICT] HARD CONSTRAINT aktif: %.2f TL > %.2f TL butce",
                price, budget,
            )

        # System prompt: bütçe kuralını açıkça say
        if hard_alma:
            budget_rule = (
                f"\n!!! ZORUNLU KURAL !!!\n"
                f"Ürün fiyatı ({price:,.2f} TL) kullanıcının toplam aylık "
                f"bütçesini ({budget:,.2f} TL) AŞIYOR.\n"
                f"Bu durumda kesinlikle ALMA kararı vermelisin. AL veya BEKLE YAZAMAZSIN."
            )
        elif has_budget:
            budget_rule = (
                f"\nBütçe kuralı: Fiyat bütçenin %{budget_pct:.1f}'i.\n"
                f"  ≤%25  → AL\n"
                f"  %25-55 → BEKLE\n"
                f"  >%55  → ALMA"
            )
        else:
            budget_rule = "\nBütçe belirtilmedi — piyasa fiyatı ve fırsat maliyetine göre karar ver."

        discount_block = (
            "\nİNDİRİM / DEĞER SİNYALİ:\n"
            "- Sana verilen 'liste veya referans fiyatı' ile 'şu an ödenen tutar' arasındaki farkı mutlaka değerlendir.\n"
            "- İndirim oranı %20'nin üzerindeyse bunu güçlü bir değer sinyali say: bütçe payı yüksek olsa bile "
            "AL ile BEKLE arasında AL'a doğru eğil; BEKLE ile ALMA arasında BEKLE'ye doğru eğil (fırsat kaçmasın).\n"
            "- Ürün fiyatı aylık bütçeyi AŞIYORSA bu kural AL kararını geçersiz kılamaz; yine yalnızca ALMA ver.\n"
            "- 'reason' metnında indirim ≈%5 veya üzerindeyse kullanıcıya açıkça söyle "
            "(örn. 'Bu ürün şu an yaklaşık %X indirimde').\n"
        )

        system_prompt = (
            "Sen CubeZ'sin — global e-ticaret platformlarında (özellikle Amazon gibi büyük"
            " pazaryerleri) uzmanlaşmış Otonom Finansal Kalkan Ajanısın.\n"
            "Bu platformların sunduğu ürün, fiyat ve piyasa verilerini en yüksek doğrulukla"
            " analiz eder, kullanıcıyı manipülatif fiyatlandırmadan ve anlık satın alma"
            " baskısından korursun.\n"
            + budget_rule + discount_block + "\n"
            "KURALLAR:\n"
            "1. Markayı veya ürün kalitesini asla eleştirme. Sadece finansal uygunluk.\n"
            "2. Tüm yanıtlar %100 Türkçe. Kullan: fırsat maliyeti, bütçe uyumu, piyasa ortalaması.\n"
            "3. Tarafsız ve profesyonel ton.\n"
            "4. 'reason' alanını tam olarak şu yapıda yaz (her madde ayrı satırda, \\n ile ayır):\n"
            "   1) Bütçe uyumu: ...\n"
            "   2) Piyasa karşılaştırması: ...\n"
            "   3) Finansal öneri: ...\n\n"
            "JSON FORMATI (başka hiçbir şey yazma):\n"
            '{"verdict":"AL|BEKLE|ALMA",'
            '"reason":"1) Bütçe uyumu: fiyatın bütçenin yüzde kaçı olduğu ve ne anlama geldiği.'
            r"\n"
            '2) Piyasa karşılaştırması: bu ürün kategorisinde benzer ürünlerin tahmini TL fiyat aralığı.'
            r"\n"
            "3) Finansal öneri: BEKLE/ALMA kararlarında 'Bu parayı harcamak yerine [yatırım aracı] ile"
            " değerlendirirsen 1 ayda yaklaşık [X] TL kazanabilirsin' projeksiyonu.\","
            '"savings_tip":"1 cümle pratik ve uygulanabilir tasarruf önerisi"}'
        )

        if discount_pct >= 0.5 and original_price > price * 1.005:
            discount_user_line = (
                f"Liste / referans fiyatı yaklaşık {original_price:,.2f} TL; "
                f"şu an ödenen tutar {price:,.2f} TL (yaklaşık %{discount_pct:.1f} indirim)."
            )
        else:
            discount_user_line = (
                "İndirim/liste fiyatı farkı tespit edilmedi veya anlamlı bir indirim yok."
            )

        user_msg_parts = [
            f"=== [A] ÜRÜN ===",
            f"Ürün : {product_name}",
            f"Şu an ödenen tutar (satış fiyatı): {price:,.2f} TL",
            f"Liste / referans fiyatı (varsa): {original_price:,.2f} TL",
            f"Tahmini indirim oranı: %{discount_pct:.1f}",
            f"",
            f"=== [A-2] İNDİRİM ÖZETİ ===",
            discount_user_line,
            f"",
            f"=== [B] BÜTÇE ===",
            budget_context,
            f"",
            f"=== [C] FIRSAT MALİYETİ ===",
            investment_context,
            f"",
            f"=== [D] GÖREV ===",
        ]
        if has_budget:
            user_msg_parts += [
                f"'reason' alanını TAM OLARAK şu 3 satır formatında doldur (\\n ile ayır):",
                f"1) Bütçe uyumu: Bu ürün {price:,.2f} TL, aylık bütçenin %{budget_pct:.1f}'ine karşılık geliyor. [ne anlama geliyor?]",
                f"2) Piyasa karşılaştırması: Bu ürün kategorisinde benzer ürünlerin tahmini fiyat aralığı [TL aralığı ver].",
                f"3) Finansal öneri: {'ALMA kararı — ' if hard_alma else ''}Bu {price:,.2f} TL'yi harcamak yerine yatırım aracıyla değerlendirirsen 1 ayda ~{monthly_gain:,.0f} TL kazanabilirsin.",
            ]
        else:
            user_msg_parts += [
                f"Bütçe belirtilmedi. 'reason' alanını TAM OLARAK şu 3 satır formatında doldur (\\n ile ayır):",
                f"1) Bütçe uyumu: Bütçe bilgisi yok — piyasa değerine göre değerlendir.",
                f"2) Piyasa karşılaştırması: Bu ürün kategorisinde benzer ürünlerin tahmini fiyat aralığı [TL aralığı ver].",
                f"3) Finansal öneri: Bu {price:,.2f} TL'yi harcamak yerine yatırım aracıyla değerlendirirsen 1 ayda ~{monthly_gain:,.0f} TL kazanabilirsin.",
            ]

        user_prompt = "\n".join(user_msg_parts)

        client = self._get_client()
        try:
            chat = client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_prompt},
                ],
                temperature=0.10,
                response_format={"type": "json_object"},
                max_tokens=640,
            )
        except Exception as exc:
            self._raise_groq_error(exc)

        # ── Yanıt ayrıştırma ──────────────────────────────────────────────────
        raw = (chat.choices[0].message.content or "").strip()
        if not raw:
            raise RuntimeError("Groq boş yanıt döndürdü. Lütfen tekrar deneyin.")

        parsed  = self._parse_json(raw)
        verdict = str(parsed.get("verdict", "")).strip().upper()

        if verdict not in ("AL", "ALMA", "BEKLE"):
            raise RuntimeError(
                f"Geçersiz karar: '{verdict}'. Lütfen tekrar deneyin."
            )

        reason      = str(parsed.get("reason", "")).strip()
        savings_tip = str(parsed.get("savings_tip", "")).strip()

        if not reason:
            raise RuntimeError("Groq gerekçe döndürmedi. Lütfen tekrar deneyin.")

        # ── Hard constraint güvenlik ağı ─────────────────────────────────────
        if hard_alma and verdict != "ALMA":
            logger.warning("LLM '%s' dedi, hard constraint 'ALMA'ya zorluyor.", verdict)
            verdict = "ALMA"
            reason = (
                f"Bu ürünün fiyatı ({price:,.2f} TL), aylık bütçenizi "
                f"({budget:,.2f} TL) aşmaktadır. Satın alma finansal açıdan uygun değildir. "
                + reason
            )

        decision   = _VERDICT_TO_DECISION[verdict]
        confidence = _VERDICT_CONFIDENCE[verdict]

        rationale_out = reason
        if discount_pct >= 5.0 and "indirim" not in reason.lower():
            rationale_out = (
                f"Bu ürün liste fiyatına kıyasla yaklaşık %{discount_pct:.0f} indirimde.\n"
                + reason
            )

        logger.info(
            "[D-VERDICT] Karar: %s | Guven: %.0f%% | Urun: %s | Fiyat: %.2f TL | Butce: %.0f TL",
            verdict, confidence * 100, product_name, price, budget,
        )

        return AnalyzeResult(
            verdict=verdict,
            reason=reason,
            savings_tip=savings_tip,
            product_name=product_name,
            price=price,
            original_price=original_price,
            discount_percentage=discount_pct,
            decision=decision,
            rationale=rationale_out,
            confidence=confidence,
        )

    # ── Yardımcı metodlar ─────────────────────────────────────────────────────

    @staticmethod
    def _parse_json(text: str) -> dict[str, Any]:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                pass
        raise RuntimeError("Groq yanıtı JSON formatında değil. Lütfen tekrar deneyin.")

    @staticmethod
    def _raise_groq_error(exc: Exception) -> None:
        exc_str = str(exc).lower()
        logger.error("Groq API hatasi (%s): %s", type(exc).__name__, exc)
        if "401" in str(exc) or ("invalid" in exc_str and "key" in exc_str):
            raise RuntimeError(
                "Geçersiz API Anahtarı: GROQ_API_KEY hatalı. "
                "console.groq.com adresinden geçerli bir anahtar alın."
            ) from exc
        if "429" in str(exc) or "rate" in exc_str:
            raise RuntimeError(
                "İstek Limiti: Groq kısa süre içinde çok fazla istek aldı. "
                "Birkaç saniye bekleyip tekrar deneyin."
            ) from exc
        if "timeout" in exc_str or "connect" in exc_str:
            raise RuntimeError(
                "Bağlantı Hatası: Groq API'ye ulaşılamıyor. "
                "İnternet bağlantınızı kontrol edin."
            ) from exc
        raise RuntimeError(
            f"Groq API hatası ({type(exc).__name__}): {exc}"
        ) from exc
