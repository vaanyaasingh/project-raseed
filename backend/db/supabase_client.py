"""Supabase client — service role, bypasses RLS for backend writes."""
import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

_url: str = os.environ["SUPABASE_URL"]
_key: str = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase: Client = create_client(_url, _key)
