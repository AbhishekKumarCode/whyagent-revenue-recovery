"""Real backend auth: sqlite-backed users, salted password hashing, server-side
session tokens. Stdlib-only (hashlib + sqlite3 + secrets) so this stays dependency-free
like the rest of the demo — but the hashing, storage, and session validation are real,
not cosmetic. Sessions live in-memory (a dict), so they reset on server restart; that's
an acceptable trade for a single-process buildathon demo, not a security shortcut on
the parts that matter (nobody's password is ever stored in plaintext or recoverable).
"""
from __future__ import annotations

import hashlib
import secrets
import sqlite3
import time
from pathlib import Path

from fastapi import Header, HTTPException

DB_PATH = Path(__file__).resolve().parent.parent / "why_agent_users.db"
PBKDF2_ITERATIONS = 200_000

# token -> {"user_id": int, "email": str, "name": str, "created_at": float}
_sessions: dict[str, dict] = {}


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = _connect()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            salt TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at REAL NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()
    # Seed a demo account so judges/reviewers can get in without registering first.
    if get_user_by_email("demo@razorpay.com") is None:
        create_user("demo@razorpay.com", "demo1234", "Demo Reviewer")


def _hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return salt.hex(), digest.hex()


def _verify_password(password: str, salt_hex: str, hash_hex: str) -> bool:
    salt = bytes.fromhex(salt_hex)
    _, computed_hash = _hash_password(password, salt)
    return secrets.compare_digest(computed_hash, hash_hex)


def get_user_by_email(email: str) -> sqlite3.Row | None:
    conn = _connect()
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email.lower().strip(),)).fetchone()
    conn.close()
    return row


def create_user(email: str, password: str, name: str) -> sqlite3.Row:
    email = email.lower().strip()
    if len(password) < 6:
        raise ValueError("password must be at least 6 characters")
    if get_user_by_email(email) is not None:
        raise ValueError("an account with this email already exists")
    salt_hex, hash_hex = _hash_password(password)
    conn = _connect()
    cur = conn.execute(
        "INSERT INTO users (email, name, salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
        (email, name.strip() or email.split("@")[0], salt_hex, hash_hex, time.time()),
    )
    conn.commit()
    user_id = cur.lastrowid
    conn.close()
    return get_user_by_email(email)  # type: ignore[return-value]


def authenticate(email: str, password: str) -> sqlite3.Row:
    user = get_user_by_email(email)
    if user is None or not _verify_password(password, user["salt"], user["password_hash"]):
        raise ValueError("invalid email or password")
    return user


def create_session(user: sqlite3.Row) -> str:
    token = secrets.token_urlsafe(32)
    _sessions[token] = {
        "token": token,
        "user_id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "created_at": time.time(),
    }
    return token


def delete_session(token: str) -> None:
    _sessions.pop(token, None)


def public_user(user: sqlite3.Row | dict) -> dict:
    return {"email": user["email"], "name": user["name"]}


def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    """FastAPI dependency — every protected route takes `user = Depends(get_current_user)`."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "not authenticated")
    token = authorization.removeprefix("Bearer ").strip()
    session = _sessions.get(token)
    if session is None:
        raise HTTPException(401, "session expired or invalid — please log in again")
    return session
