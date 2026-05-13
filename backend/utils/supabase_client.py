from dotenv import load_dotenv
import os
import jwt
from jwt import PyJWKClient
from fastapi import HTTPException

load_dotenv()

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")

_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        jwks_uri = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_uri, cache_keys=True)
    return _jwks_client


def verify_token(jwt_token: str) -> dict:
    try:
        header = jwt.get_unverified_header(jwt_token)
        alg = header.get("alg", "HS256")

        if alg == "HS256":
            payload = jwt.decode(
                jwt_token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        else:
            client = _get_jwks_client()
            signing_key = client.get_signing_key_from_jwt(jwt_token)
            payload = jwt.decode(
                jwt_token,
                signing_key.key,
                algorithms=["RS256", "ES256"],
                options={"verify_aud": False},
            )

        user_id = payload.get("sub")
        email = payload.get("email")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no user id")
        return {"id": user_id, "email": email}

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")
