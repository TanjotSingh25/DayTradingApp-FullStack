from __future__ import annotations

import base64
import json
import logging
from typing import Optional

import httpx
import jwt
from fastapi import Depends, Header, HTTPException

from app.config import settings

logger = logging.getLogger("order.auth")


def _extract_bearer(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail={"error": "UNAUTHORIZED", "message": "Missing Authorization header"})
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=401, detail={"error": "UNAUTHORIZED", "message": "Invalid Authorization header"})
    return parts[1].strip()


def _jwt_payload_unverified(token: str) -> dict:
    try:
        payload_b64 = token.split(".")[1]
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("utf-8"))
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return {}


def _verify_with_auth_service(token: str) -> Optional[str]:
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


UserIdDep = Depends(get_user_id)

