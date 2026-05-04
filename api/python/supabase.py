"""
RMM Production — Supabase REST Client
Thin wrapper over urllib.request. No external SDK dependencies.
"""
import os
import json
import urllib.request
import urllib.error
import urllib.parse

SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')


def _headers(extra=None):
    h = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
        'Content-Type': 'application/json',
    }
    if extra:
        h.update(extra)
    return h


def _raise_for(e: urllib.error.HTTPError, operation: str):
    try:
        body = e.read().decode()
    except Exception:
        body = ''
    raise RuntimeError(f"Supabase {operation} error {e.code}: {body}")


def query(table: str, select: str = '*', filters: list = None, limit: int = None) -> list:
    """SELECT from a table. Returns list of row dicts."""
    params = {'select': select}
    url = f"{SUPABASE_URL}/rest/v1/{table}?select={urllib.parse.quote(select)}"
    if filters:
        for f in filters:
            url += f"&{f}"
    if limit is not None:
        url += f"&limit={limit}"
    req = urllib.request.Request(url, headers=_headers())
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        _raise_for(e, 'query')


def insert(table: str, data: dict) -> bool:
    """INSERT a single row. Uses return=minimal (no body returned)."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=_headers({
        'Prefer': 'return=minimal',
    }), method='POST')
    try:
        with urllib.request.urlopen(req) as resp:
            resp.read()
            return True
    except urllib.error.HTTPError as e:
        _raise_for(e, 'insert')


def upsert(table: str, data: dict, on_conflict: str) -> bool:
    """
    INSERT … ON CONFLICT DO UPDATE (merge-duplicates).
    on_conflict: comma-separated column name(s) forming the unique constraint.
    """
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={urllib.parse.quote(on_conflict)}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=_headers({
        'Prefer': 'resolution=merge-duplicates,return=minimal',
    }), method='POST')
    try:
        with urllib.request.urlopen(req) as resp:
            resp.read()
            return True
    except urllib.error.HTTPError as e:
        _raise_for(e, 'upsert')


def update(table: str, data: dict, filters: list) -> bool:
    """PATCH rows matching filters (list of PostgREST filter strings e.g. 'id=eq.xxx')."""
    url = f"{SUPABASE_URL}/rest/v1/{table}?" + "&".join(filters)
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=_headers({
        'Prefer': 'return=minimal',
    }), method='PATCH')
    try:
        with urllib.request.urlopen(req) as resp:
            resp.read()
            return True
    except urllib.error.HTTPError as e:
        _raise_for(e, 'update')
