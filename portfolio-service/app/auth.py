from __future__ import annotations

import base64
import json
import logging
from typing import Optional

import httpx
import jwt
from fastapi import Depends, Header, HTTPException

from app.config import settings

logger = logging.getLogger("portfolio.auth")


def _extract_bearer(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail={"error": "UNAUTHORIZED", "message": "Missing Authorization header"})
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=401, detail={"error": "UNAUTHORIZED", "message": "Invalid Authorization header"})
    return parts[1].strip()


def _jwt_payload_unverified(token: str) -> dict:
    # WARNING: This does not verify signature; only used to locate likely user_id claim if needed.
    try:
        payload_b64 = token.split(".")[1]
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("utf-8"))
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return {}


def _verify_with_auth_service(token: str) -> Optional[str]:
    # Option A: call auth-service /auth/verify and expect { user_id }.
    # Your repo’s auth service may not have this endpoint; we treat non-200 as “not supported”.
    url = settings.AUTH_SERVICE_URL.rstrip("/") + "/auth/verify"
    try:
        with httpx.Client(timeout=5.0) as client:
            r = client.post(url, headers={"Authorization": f"Bearer {token}"})
        if r.status_code != 200:
            return None
        data = r.json()
        user_id = data.get("user_id")
        if isinstance(user_id, str) and user_id:
            return user_id
        return None
    except Exception as e:
        logger.info("Auth service verify failed (%s); falling back if configured.", str(e))
        return None


def _verify_hs256_locally(token: str) -> Optional[str]:
    # Option B fallback: verify HS256 using env JWT_SECRET.
    if settings.JWT_SECRET:
        try:
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        except jwt.PyJWTError:
            return None
        for k in ("user_id", "sub", "username"):
            v = payload.get(k)
            if isinstance(v, str) and v:
                return v
        return None

    # If JWT_SECRET is not provided, last-resort: unverified payload extraction (dev convenience).
    payload = _jwt_payload_unverified(token)
    for k in ("user_id", "sub", "username"):
        v = payload.get(k)
        if isinstance(v, str) and v:
            return v
    return None


def get_user_id(authorization: Optional[str] = Header(default=None)) -> str:
    token = _extract_bearer(authorization)

    user_id = _verify_with_auth_service(token)
    if user_id:
        return user_id

    user_id = _verify_hs256_locally(token)
    if user_id:
        return user_id

    raise HTTPException(status_code=401, detail={"error": "UNAUTHORIZED", "message": "Invalid token"})


def require_internal_key(x_internal_api_key: Optional[str] = Header(default=None)) -> None:
    if not x_internal_api_key or x_internal_api_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=403, detail={"error": "FORBIDDEN", "message": "Invalid internal API key"})


UserIdDep = Depends(get_user_id)
InternalKeyDep = Depends(require_internal_key)


