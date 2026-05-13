from fastapi import Header, HTTPException, Depends
from utils.supabase_client import verify_token


async def get_current_user(authorization: str = Header(...)) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization.split(" ")[1]
    return verify_token(token)
