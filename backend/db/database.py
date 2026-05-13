"""SQLite schema definition, connection management, and query helpers."""

import sqlite3
import os
from contextlib import contextmanager
from dotenv import load_dotenv

load_dotenv()

DB_PATH = os.getenv("SQLITE_DB_PATH", "../raseed.db")

_SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS uploads (
    id           TEXT PRIMARY KEY,
    filename     TEXT NOT NULL,
    doc_type     TEXT NOT NULL CHECK(doc_type IN ('gst_notice', 'invoice', 'bank_statement')),
    extracted_text TEXT,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
    id             TEXT PRIMARY KEY,
    invoice_number TEXT,
    invoice_date   TEXT,
    vendor_name    TEXT,
    vendor_gstin   TEXT,
    buyer_name     TEXT,
    buyer_gstin    TEXT,
    grand_total    REAL,
    total_gst      REAL,
    invoice_type   TEXT CHECK(invoice_type IN ('received', 'issued')),
    raw_json       TEXT,
    upload_id      TEXT REFERENCES uploads(id),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
    id          TEXT PRIMARY KEY,
    date        TEXT,
    description TEXT,
    amount      REAL,
    type        TEXT CHECK(type IN ('credit', 'debit')),
    category    TEXT,
    upload_id   TEXT REFERENCES uploads(id)
);

CREATE TABLE IF NOT EXISTS agent_logs (
    id             TEXT PRIMARY KEY,
    agent          TEXT NOT NULL,
    input_summary  TEXT,
    raw_llm_output TEXT,
    parsed_output  TEXT,
    success        INTEGER NOT NULL DEFAULT 0 CHECK(success IN (0, 1)),
    error_message  TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def db_conn():
    """Context manager that auto-commits or rolls back and always closes."""
    conn = get_db()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """Create all tables if they don't exist. Called once on app startup."""
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
    conn = get_db()
    try:
        conn.executescript(_SCHEMA)
        conn.commit()
    finally:
        conn.close()
