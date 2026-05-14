"""CubeZero FastAPI gateway — kara kutu API (kart verisi yok)."""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from pydantic import BaseModel, Field, field_validator

from agents.cubez_agent import CubeZAgent

load_dotenv(override=True)

logger = logging.getLogger("cubezero")
logging.basicConfig(level=logging.INFO)

# Singleton — reuses the genai.Client HTTP connection pool across requests.
_agent = CubeZAgent()

app = FastAPI(
    title="CubeZero API",
    description="CubeZ Ajanı — Groq Llama 3.3 70B · 4 Fazlı Otonom Finansal Karar Motoru",
    version="0.3.0",
)

_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000")
allow_origins = [o.strip() for o in _origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── JWKS (JSON Web Key Set) — Supabase ECC P-256 + eski HS256 tokenları destekler ──
_supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
_project_ref = _supabase_url.replace("https://", "").split(".")[0]
_JWKS_URL = f"https://{_project_ref}.supabase.co/auth/v1/.well-known/jwks.json"
_JWKS_TTL = 3600  # 1 saat cache

_jwks_cache: dict[str, Any] | None = None
_jwks_cache_time: float = 0.0
_jwks_lock = threading.Lock()


def _get_jwks() -> dict[str, Any]:
    """JWKS'i Supabase'den çeker ve 1 saat önbelleğe alır."""
    global _jwks_cache, _jwks_cache_time
    now = time.monotonic()
    if _jwks_cache is not None and (now - _jwks_cache_time) < _JWKS_TTL:
        return _jwks_cache
    with _jwks_lock:
        if _jwks_cache is not None and (now - _jwks_cache_time) < _JWKS_TTL:
            return _jwks_cache
        try:
            resp = httpx.get(_JWKS_URL, timeout=5.0)
            resp.raise_for_status()
            data: dict[str, Any] = resp.json()
            _jwks_cache = data
            _jwks_cache_time = now
            key_count = len(data.get("keys", []))
            logger.info("JWKS guncellendi — %d anahtar yuklendi (%s)", key_count, _JWKS_URL)
        except Exception as exc:
            logger.warning("JWKS alinamadi: %s — onceki cache kullanilacak", exc)
            if _jwks_cache is None:
                _jwks_cache = {"keys": []}
    return _jwks_cache  # type: ignore[return-value]


def _verify_with_jwks(token: str) -> dict[str, object] | None:
    """
    JWKS içindeki her anahtar ile doğrulama dener.
    Supabase'in mevcut ECC P-256 (ES256) anahtarını destekler.
    Başarılı olursa payload döner, hiçbiri eşleşmezse None döner.
    """
    jwks = _get_jwks()
    for key_data in jwks.get("keys", []):
        alg = key_data.get("alg", "ES256")
        try:
            payload: dict[str, object] = jwt.decode(
                token,
                key_data,
                algorithms=[alg],
                audience="authenticated",
                options={"verify_aud": True, "verify_exp": True},
            )
            logger.debug("JWKS dogrulamasi basarili (alg=%s, kid=%s)", alg, key_data.get("kid"))
            return payload
        except JWTError:
            continue
    return None


def _verify_with_legacy_hs256(token: str) -> dict[str, object] | None:
    """
    Eski HS256 Shared Secret ile doğrulama dener.
    PREVIOUS KEY statüsündeki tokenlar için fallback.
    """
    raw_secret = os.getenv("SUPABASE_JWT_SECRET", "")
    if not raw_secret:
        return None
    try:
        payload: dict[str, object] = jwt.decode(
            token,
            raw_secret.encode("utf-8"),
            algorithms=["HS256"],
            audience="authenticated",
            options={"verify_aud": True, "verify_exp": True},
        )
        logger.debug("HS256 legacy dogrulamasi basarili")
        return payload
    except JWTError:
        return None


def verify_token(authorization: str = Header(...)) -> dict[str, object]:
    # DEV BYPASS — sadece local test, production'da ASLA "1" yapma
    if os.getenv("DEBUG_BYPASS_AUTH", "0") == "1":
        logger.warning("JWT dogrulamasi atlandi (DEBUG_BYPASS_AUTH=1) — sadece test modu")
        return {"sub": "debug-user", "bypass": True}

    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer token gerekli.")
    token = authorization.removeprefix("Bearer ").strip()

    # 1. JWKS ile dene — ECC P-256 (ES256) mevcut tokenlar için
    try:
        payload = _verify_with_jwks(token)
        if payload is not None:
            return payload
    except Exception as exc:
        logger.debug("JWKS dogrulamasi istisna: %s", exc)

    # 2. Fallback — eski HS256 Shared Secret (PREVIOUS KEY tokenlar için)
    payload = _verify_with_legacy_hs256(token)
    if payload is not None:
        return payload

    logger.warning("Token dogrulanamadi — her iki yontem de basarisiz")
    raise HTTPException(status_code=401, detail="Geçersiz veya süresi dolmuş token.")


class AnalyzeRequest(BaseModel):
    url: str = Field(..., min_length=8)
    monthly_limit_try: str | None = Field(default=None)

    @field_validator("url")
    @classmethod
    def url_must_be_http(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("Geçerli bir http veya https URL girin.")
        return v

    @field_validator("monthly_limit_try")
    @classmethod
    def limit_must_be_positive(cls, v: str | None) -> str | None:
        if v is None:
            return v
        normalized = v.strip().replace(".", "").replace(",", ".")
        try:
            amount = float(normalized)
        except ValueError:
            raise ValueError("Bütçe limiti sayısal bir değer olmalıdır.")
        if amount <= 0:
            raise ValueError("Bütçe limiti sıfırdan büyük olmalıdır.")
        return v


class AnalyzeResponse(BaseModel):
    # New structured fields
    verdict: str           # "AL" | "ALMA" | "BEKLE"
    reason: str
    savings_tip: str
    product_name: str
    price: float            # ödenecek tutar (= current_price)
    current_price: float
    original_price: float
    discount_percentage: float
    # Frontend-compatible aliases (decision/rationale/confidence)
    decision: str          # "allow" | "shield" | "caution"
    rationale: str
    confidence: float


def _parse_budget(monthly_limit_try: str | None) -> float:
    """Convert the validated monthly_limit_try string to a float."""
    if not monthly_limit_try:
        return 0.0
    try:
        normalized = monthly_limit_try.strip().replace(".", "").replace(",", ".")
        return float(normalized)
    except ValueError:
        return 0.0


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "cubezero"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(
    body: AnalyzeRequest,
    _user: dict[str, object] = Depends(verify_token),
) -> AnalyzeResponse:
    budget = _parse_budget(body.monthly_limit_try)
    try:
        result = _agent.analyze(body.url.strip(), budget)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        msg = str(e)
        status = 429 if ("kota" in msg.lower() or "quota" in msg.lower() or "limit" in msg.lower()) else 503
        raise HTTPException(status_code=status, detail=msg) from e
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail="Analiz sırasında beklenmeyen hata.") from e
    return AnalyzeResponse(**result.as_dict())
