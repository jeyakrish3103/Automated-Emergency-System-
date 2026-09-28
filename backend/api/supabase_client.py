"""Shared Supabase client, imported by the endpoint modules in api/.

Uses the service_role key so backend writes bypass row-level security -- this
key must never be sent to the frontend.
"""
import os

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv(".env.local")

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_KEY"]
        _client = create_client(url, key)
    return _client
