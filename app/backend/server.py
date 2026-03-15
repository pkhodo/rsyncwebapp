#!/usr/bin/env python3
"""Rsync Web App backend (no external dependencies)."""

from __future__ import annotations

import json
import os
import platform
import re
import shlex
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable
from urllib.parse import parse_qs, urlparse

try:
    import fcntl
except ImportError:  # pragma: no cover - non-POSIX fallback
    fcntl = None

ROOT = Path(__file__).resolve().parents[2]
FRONTEND_SRC_DIR = ROOT / "app" / "frontend"
FRONTEND_DIST_DIR = FRONTEND_SRC_DIR / "dist"
FRONTEND_DIR = FRONTEND_DIST_DIR if FRONTEND_DIST_DIR.exists() else FRONTEND_SRC_DIR
STATE_DIR = ROOT / "state"
LOG_DIR = STATE_DIR / "logs"
PROFILE_PATH = ROOT / "profiles" / "jobs.json"
LOCATIONS_PATH = ROOT / "profiles" / "locations.json"
DB_PATH = STATE_DIR / "rsync-webapp.db"
SETTINGS_PATH = STATE_DIR / "service-settings.json"
BIN_DIR = ROOT / "bin"
PACKAGE_JSON_PATH = ROOT / "package.json"
ENV_UPDATE_REPO = os.environ.get("RSYNC_WEBAPP_UPDATE_REPO", "").strip()
INSTANCE_LOCK_DIR = Path(tempfile.gettempdir())


class SingleInstanceLock:
    def __init__(self, lock_path: Path, key: str):
        self.lock_path = lock_path
        self.key = key
        self._file: Any | None = None

    def acquire(self) -> bool:
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        handle = self.lock_path.open("a+", encoding="utf-8")
        if fcntl is None:
            self._file = handle
            return True
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            handle.close()
            return False
        handle.seek(0)
        handle.truncate()
        payload = {
            "pid": os.getpid(),
            "started_at": now_iso(),
            "root": str(ROOT),
            "key": self.key,
        }
        handle.write(json.dumps(payload) + "\n")
        handle.flush()
        self._file = handle
        return True

    def release(self) -> None:
        if self._file is None:
            return
        if fcntl is not None:
            try:
                fcntl.flock(self._file.fileno(), fcntl.LOCK_UN)
            except OSError:
                pass
        try:
            self._file.close()
        except Exception:
            pass
        self._file = None


def now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def parse_shell_list(value: str) -> list[str]:
    items: list[str] = []
    for line in value.splitlines():
        cleaned = line.strip()
        if not cleaned or cleaned.startswith("#"):
            continue
        items.append(cleaned)
    return items


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return cleaned[:48] or str(uuid.uuid4())[:8]


def read_app_version() -> str:
    try:
        payload = json.loads(PACKAGE_JSON_PATH.read_text(encoding="utf-8"))
    except Exception:
        return "0.0.0"
    return str(payload.get("version", "0.0.0"))


APP_VERSION = read_app_version()


def _version_tuple(value: str) -> tuple[int, int, int]:
    cleaned = value.strip().lstrip("vV")
    digits = re.findall(r"\d+", cleaned)
    major = int(digits[0]) if len(digits) > 0 else 0
    minor = int(digits[1]) if len(digits) > 1 else 0
    patch = int(digits[2]) if len(digits) > 2 else 0
    return (major, minor, patch)


def _validate_remote_server(value: str) -> str:
    server = str(value).strip()
    if not server:
        raise RuntimeError("Remote server is required")
    if server.startswith("/") or " " in server:
        raise RuntimeError("server must be an SSH host target like user@host")
    return server


def _validate_remote_path(value: str) -> str:
    path = str(value).strip()
    if not path:
        raise RuntimeError("Remote path is required")
    if not path.startswith("/"):
        raise RuntimeError("remote_path must be absolute on remote host")
    if ":" in path:
        raise RuntimeError("remote_path must not contain ':'")
    parts = [part for part in path.split("/") if part]
    if ".." in parts:
        raise RuntimeError("remote_path must not include '..'")
    return path


def _validate_local_path(value: str) -> str:
    path = str(value).strip()
    if not path:
        raise RuntimeError("Local path is required")
    if not path.startswith("/"):
        raise RuntimeError("local_path must be an absolute local path")
    if ":" in path:
        raise RuntimeError("local_path must not contain ':'")
    parts = [part for part in path.split("/") if part]
    if ".." in parts:
        raise RuntimeError("local_path must not include '..'")
    return path


def normalize_remote_location_payload(payload: dict[str, Any]) -> dict[str, str]:
    name = str(payload.get("name", "")).strip()
    if not name:
        raise RuntimeError("Remote location name is required")
    location_id = str(payload.get("id") or slugify(name)).strip()
    if not location_id:
        raise RuntimeError("Remote location id is required")
    notes = str(payload.get("notes", "")).strip()
    return {
        "id": slugify(location_id),
        "name": name,
        "server": _validate_remote_server(str(payload.get("server", ""))),
        "remote_path": _validate_remote_path(str(payload.get("remote_path", ""))),
        "notes": notes,
    }


def normalize_local_location_payload(payload: dict[str, Any]) -> dict[str, str]:
    name = str(payload.get("name", "")).strip()
    if not name:
        raise RuntimeError("Local location name is required")
    location_id = str(payload.get("id") or slugify(name)).strip()
    if not location_id:
        raise RuntimeError("Local location id is required")
    notes = str(payload.get("notes", "")).strip()
    return {
        "id": slugify(location_id),
        "name": name,
        "local_path": _validate_local_path(str(payload.get("local_path", ""))),
        "notes": notes,
    }


def _run_capture(args: list[str]) -> tuple[int, str]:
    proc = subprocess.run(args, capture_output=True, text=True)
    output = (proc.stdout + "\n" + proc.stderr).strip()
    return proc.returncode, output


def detect_update_repo() -> str:
    if ENV_UPDATE_REPO:
        return ENV_UPDATE_REPO
    if not (ROOT / ".git").exists():
        return "pkhodo/rsyncwebapp"
    code, remote_url = _run_capture(["git", "-C", str(ROOT), "config", "--get", "remote.origin.url"])
    if code != 0:
        return "pkhodo/rsyncwebapp"
    text = remote_url.strip()
    https_match = re.search(r"github\.com/([^/]+/[^/.]+)(?:\.git)?$", text)
    ssh_match = re.search(r"github\.com:([^/]+/[^/.]+)(?:\.git)?$", text)
    match = https_match or ssh_match
    if not match:
        return "pkhodo/rsyncwebapp"
    return match.group(1)


UPDATE_REPO = detect_update_repo()


def detect_rsync_capabilities() -> dict[str, Any]:
    path = shutil.which("rsync")
    if not path:
        return {
            "available": False,
            "path": "",
            "version": "",
            "detail": "rsync not found in PATH",
            "flavor": "unknown",
            "supports": {},
        }

    version_code, version_output = _run_capture(["rsync", "--version"])
    help_code, help_output = _run_capture(["rsync", "--help"])
    first_line = version_output.splitlines()[0] if version_output else ""
    combined = (version_output + "\n" + help_output).lower()
    flavor = "openrsync" if "openrsync" in combined else "rsync"

    supports = {
        "human_readable": "--human-readable" in combined or "human-readable output" in combined,
        "info": "--info" in combined,
        "progress": "--progress" in combined,
        "progress2": "progress2" in combined,
        "append_verify": "--append-verify" in combined,
        "append": "--append" in combined,
        "partial": "--partial" in combined,
        "contimeout": "--contimeout" in combined,
        "ignore_existing": "--ignore-existing" in combined,
        "delete": "--delete" in combined,
    }

    core_ok = bool(path and supports["partial"] and supports["ignore_existing"] and supports["delete"])
    notes: list[str] = []
    if flavor == "openrsync":
        notes.append("Detected openrsync implementation; some flags differ from upstream rsync.")
    if not supports["info"] or not supports["progress2"]:
        notes.append("progress2 not available; UI will use basic progress output.")
    if not supports["append_verify"]:
        notes.append("append-verify not available; fallback resume behavior is used.")

    detail_lines = [version_output.strip(), help_output.splitlines()[0] if help_output else ""]
    detail = "\n".join([line for line in detail_lines if line])

    return {
        "available": bool(path and (version_code == 0 or first_line)),
        "ready": core_ok,
        "path": path,
        "version": first_line,
        "detail": detail[:1200],
        "flavor": flavor,
        "supports": supports,
        "notes": notes,
        "checked_at": now_iso(),
        "help_exit_code": help_code,
    }


class HistoryStore:
    """SQLite store for run metadata and notable events."""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            cur = self._conn.cursor()
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS job_runs (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  job_id TEXT NOT NULL,
                  attempt INTEGER NOT NULL,
                  started_at TEXT NOT NULL,
                  finished_at TEXT,
                  status TEXT NOT NULL,
                  exit_code INTEGER,
                  dry_run INTEGER NOT NULL,
                  mode TEXT NOT NULL,
                  bytes_line TEXT,
                  error TEXT,
                  transferred_files INTEGER,
                  deleted_files INTEGER,
                  sent_bytes INTEGER,
                  received_bytes INTEGER,
                  total_size_bytes INTEGER
                )
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS job_events (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  job_id TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  event_type TEXT NOT NULL,
                  status TEXT NOT NULL,
                  message TEXT
                )
                """
            )
            self._ensure_column("job_runs", "transferred_files", "INTEGER")
            self._ensure_column("job_runs", "deleted_files", "INTEGER")
            self._ensure_column("job_runs", "sent_bytes", "INTEGER")
            self._ensure_column("job_runs", "received_bytes", "INTEGER")
            self._ensure_column("job_runs", "total_size_bytes", "INTEGER")
            self._conn.commit()

    def _ensure_column(self, table: str, column: str, definition: str) -> None:
        rows = self._conn.execute(f"PRAGMA table_info({table})").fetchall()
        existing = {str(row["name"]) for row in rows}
        if column in existing:
            return
        self._conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    def add_event(self, job_id: str, event_type: str, status: str, message: str) -> None:
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO job_events (job_id, created_at, event_type, status, message)
                VALUES (?, ?, ?, ?, ?)
                """,
                (job_id, now_iso(), event_type, status, message),
            )
            self._conn.commit()

    def start_run(self, job_id: str, attempt: int, mode: str, dry_run: bool) -> int:
        with self._lock:
            cur = self._conn.cursor()
            cur.execute(
                """
                INSERT INTO job_runs (job_id, attempt, started_at, status, dry_run, mode)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (job_id, attempt, now_iso(), "running", 1 if dry_run else 0, mode),
            )
            self._conn.commit()
            last_row_id = cur.lastrowid
            if last_row_id is None:
                raise RuntimeError("Failed to create run history row")
            return int(last_row_id)

    def finish_run(
        self,
        run_id: int,
        status: str,
        exit_code: int | None,
        bytes_line: str,
        error: str,
        summary: dict[str, int] | None = None,
    ) -> None:
        summary = summary or {}
        with self._lock:
            self._conn.execute(
                """
                UPDATE job_runs
                SET finished_at = ?, status = ?, exit_code = ?, bytes_line = ?, error = ?,
                    transferred_files = ?, deleted_files = ?, sent_bytes = ?, received_bytes = ?, total_size_bytes = ?
                WHERE id = ?
                """,
                (
                    now_iso(),
                    status,
                    exit_code,
                    bytes_line,
                    error,
                    int(summary.get("transferred_files", 0) or 0),
                    int(summary.get("deleted_files", 0) or 0),
                    int(summary.get("sent_bytes", 0) or 0),
                    int(summary.get("received_bytes", 0) or 0),
                    int(summary.get("total_size_bytes", 0) or 0),
                    run_id,
                ),
            )
            self._conn.commit()

    def get_latest_runs(self, job_ids: list[str]) -> dict[str, dict[str, Any]]:
        cleaned = [job_id for job_id in job_ids if str(job_id).strip()]
        if not cleaned:
            return {}
        placeholders = ",".join("?" for _ in cleaned)
        with self._lock:
            rows = self._conn.execute(
                f"""
                SELECT jr.*
                FROM job_runs jr
                INNER JOIN (
                  SELECT job_id, MAX(id) AS max_id
                  FROM job_runs
                  WHERE job_id IN ({placeholders})
                  GROUP BY job_id
                ) latest
                  ON latest.job_id = jr.job_id
                 AND latest.max_id = jr.id
                """,
                tuple(cleaned),
            ).fetchall()
        return {str(row["job_id"]): dict(row) for row in rows}

    def get_recent(self, job_id: str, limit: int = 20) -> dict[str, Any]:
        with self._lock:
            runs = self._conn.execute(
                """
                SELECT * FROM job_runs WHERE job_id = ? ORDER BY id DESC LIMIT ?
                """,
                (job_id, limit),
            ).fetchall()
            events = self._conn.execute(
                """
                SELECT * FROM job_events WHERE job_id = ? ORDER BY id DESC LIMIT ?
                """,
                (job_id, limit),
            ).fetchall()
        return {
            "runs": [dict(row) for row in runs],
            "events": [dict(row) for row in events],
        }

    def has_any_dry_run(self) -> bool:
        with self._lock:
            row = self._conn.execute(
                "SELECT 1 FROM job_runs WHERE dry_run = 1 LIMIT 1"
            ).fetchone()
        return bool(row)

@dataclass
class JobConfig:
    id: str
    name: str
    server: str
    remote_path: str
    local_path: str
    mode: str = "mirror"  # mirror|append
    mirror_confirmed: bool = False
    dry_run: bool = False
    auto_retry: bool = True
    excludes: list[str] = field(default_factory=list)
    extra_args: list[str] = field(default_factory=list)
    timeout_seconds: int = 60
    contimeout_seconds: int = 15
    retry_initial_seconds: int = 10
    retry_max_seconds: int = 300
    bwlimit_kbps: int = 0
    nice_level: int = 0
    allowed_start_hour: int = -1
    allowed_end_hour: int = -1


@dataclass
class JobRuntime:
    status: str = "idle"  # idle|running|paused|paused_service|waiting_network|waiting_window|completed|failed|canceled
    progress_percent: float = 0.0
    progress_line: str = ""
    attempts: int = 0
    retries: int = 0
    last_started_at: str | None = None
    last_finished_at: str | None = None
    next_retry_at: str | None = None
    pid: int | None = None
    last_exit_code: int | None = None
    last_error: str = ""
    last_run_type: str = ""  # live|dry-run
    last_run_summary: str = ""
    last_run_stats: dict[str, int] = field(default_factory=dict)


class JobControl:
    NETWORK_FAILURE_PATTERNS = (
        "connection timed out",
        "operation timed out",
        "connection reset",
        "no route to host",
        "network is unreachable",
        "could not resolve hostname",
        "connection refused",
        "connection closed",
        "broken pipe",
        "host is down",
        "software caused connection abort",
        "connection lost",
        "packet_write_wait",
    )
    NETWORK_RETRY_EXIT_CODES = {10, 11, 12, 30, 35, 255}

    PROGRESS_RE = re.compile(
        r"(?P<bytes>[\d,]+)\s+(?P<pct>\d+)%\s+(?P<rate>[^\s]+)\s+(?P<eta>\S+)"
    )
    PROGRESS_FALLBACK_RE = re.compile(r"(?P<pct>\d{1,3})%")

    def __init__(
        self,
        config: JobConfig,
        history: HistoryStore | None = None,
        rsync_caps_provider: Callable[[], dict[str, Any]] | None = None,
        service_pause_checker: Callable[[], bool] | None = None,
    ):
        self.config = config
        self.history = history
        self.runtime = JobRuntime()
        self._rsync_caps_provider = rsync_caps_provider or detect_rsync_capabilities
        self._service_pause_checker = service_pause_checker or (lambda: False)
        self._lock = threading.Lock()
        self._cancel_requested = threading.Event()
        self._thread: threading.Thread | None = None
        self._process: subprocess.Popen[str] | None = None
        self.log_path = LOG_DIR / f"{self.config.id}.log"

    def _record_event(self, event_type: str, status: str, message: str) -> None:
        if self.history:
            self.history.add_event(self.config.id, event_type, status, message)

    def serialize(self) -> dict[str, Any]:
        with self._lock:
            return {
                "config": asdict(self.config),
                "runtime": asdict(self.runtime),
                "log_path": str(self.log_path),
            }

    def load_log_tail(self, limit: int = 150) -> str:
        if not self.log_path.exists():
            return ""
        with self.log_path.open("r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()[-limit:]
        return "".join(lines)

    def update_config(self, new_config: JobConfig) -> None:
        with self._lock:
            if self.runtime.status in {"running", "paused", "paused_service", "waiting_network", "waiting_window"}:
                raise RuntimeError("Cannot edit a running job")
            self.config = new_config

    def _write_log(self, line: str) -> None:
        timestamped = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {line}"
        with self.log_path.open("a", encoding="utf-8") as f:
            f.write(timestamped + "\n")

    def _extract_int(self, value: str) -> int:
        digits = re.sub(r"[^\d]", "", value or "")
        return int(digits) if digits else 0

    def _summarize_run(self, lines: list[str]) -> dict[str, int]:
        transferred = 0
        deleted = 0
        sent = 0
        received = 0
        total_size = 0

        xfer_re = re.compile(r"xfer#(?P<count>\d+)")
        transferred_re = re.compile(r"number of .*files transferred:\s*(?P<count>[\d,]+)", re.IGNORECASE)
        sent_re = re.compile(
            r"sent\s+(?P<sent>[\d,]+)\s+bytes\s+received\s+(?P<recv>[\d,]+)\s+bytes",
            re.IGNORECASE,
        )
        total_re = re.compile(r"total size is\s+(?P<size>[\d,]+)", re.IGNORECASE)

        for line in lines:
            lowered = line.lower()
            if "deleting " in lowered:
                deleted += 1

            xfer_match = xfer_re.search(line)
            if xfer_match:
                transferred = max(transferred, self._extract_int(xfer_match.group("count")))

            transferred_match = transferred_re.search(line)
            if transferred_match:
                transferred = max(
                    transferred,
                    self._extract_int(transferred_match.group("count")),
                )

            sent_match = sent_re.search(line)
            if sent_match:
                sent = self._extract_int(sent_match.group("sent"))
                received = self._extract_int(sent_match.group("recv"))

            total_match = total_re.search(line)
            if total_match:
                total_size = self._extract_int(total_match.group("size"))

        return {
            "transferred_files": transferred,
            "deleted_files": deleted,
            "sent_bytes": sent,
            "received_bytes": received,
            "total_size_bytes": total_size,
        }

    def _summary_text(self, summary: dict[str, int], dry_run: bool) -> str:
        transfer_label = "would transfer" if dry_run else "transferred"
        delete_label = "would delete" if dry_run else "deleted"
        return (
            f"{transfer_label}: {summary.get('transferred_files', 0)} · "
            f"{delete_label}: {summary.get('deleted_files', 0)} · "
            f"sent: {summary.get('sent_bytes', 0)}B · recv: {summary.get('received_bytes', 0)}B"
        )

    def _build_command(self, force_dry_run: bool = False, force_live: bool = False) -> list[str]:
        cfg = self.config
        caps = self._rsync_caps_provider()
        if not caps.get("available"):
            raise RuntimeError("rsync binary is unavailable")
        supports = caps.get("supports", {})

        if cfg.mode == "mirror" and not supports.get("delete"):
            raise RuntimeError("Installed rsync does not support --delete required for mirror mode")
        if cfg.mode == "append" and not supports.get("ignore_existing"):
            raise RuntimeError("Installed rsync does not support --ignore-existing required for append mode")

        src = f"{cfg.server}:{cfg.remote_path.rstrip('/')}/"
        dst = f"{cfg.local_path.rstrip('/')}/"
        ssh_cmd = f"ssh -o BatchMode=yes -o ConnectTimeout={max(3, cfg.contimeout_seconds)}"

        cmd = [
            "rsync",
            "-avz",
            "--progress",
            "--partial",
            f"--timeout={cfg.timeout_seconds}",
            "-e",
            ssh_cmd,
        ]
        if supports.get("human_readable"):
            cmd.append("--human-readable")
        if supports.get("info") and supports.get("progress2"):
            cmd.append("--info=progress2")
        if supports.get("append_verify"):
            cmd.append("--append-verify")
        if supports.get("contimeout"):
            cmd.append(f"--contimeout={cfg.contimeout_seconds}")
        if cfg.mode == "mirror":
            cmd.append("--delete")
        if cfg.mode == "append":
            cmd.append("--ignore-existing")
        if (cfg.dry_run and not force_live) or force_dry_run:
            cmd.append("--dry-run")
        if cfg.bwlimit_kbps > 0:
            cmd.append(f"--bwlimit={cfg.bwlimit_kbps}")
        for item in cfg.excludes:
            cmd.append(f"--exclude={item}")
        cmd.extend(cfg.extra_args)
        cmd.extend([src, dst])
        return cmd

    def _build_preview_command(self) -> list[str]:
        cmd = self._build_command(force_dry_run=True)
        return cmd[:-2] + ["--itemize-changes"] + cmd[-2:]

    def _ensure_local_path(self) -> None:
        Path(self.config.local_path).mkdir(parents=True, exist_ok=True)

    def _is_retryable_network_failure(self, exit_code: int, recent_lines: list[str]) -> bool:
        if exit_code in self.NETWORK_RETRY_EXIT_CODES:
            return True
        text = "\n".join(recent_lines[-180:])
        return any(marker in text for marker in self.NETWORK_FAILURE_PATTERNS)

    def _ssh_reachable(self) -> bool:
        probe = [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            self.config.server,
            "true",
        ]
        proc = subprocess.run(probe, capture_output=True, text=True)
        return proc.returncode == 0

    def _in_allowed_window(self) -> bool:
        start = self.config.allowed_start_hour
        end = self.config.allowed_end_hour
        if start < 0 or end < 0:
            return True
        hour = datetime.now().hour
        if start == end:
            return True
        if start < end:
            return start <= hour < end
        return hour >= start or hour < end

    def preview_deletes(self, limit: int = 200) -> dict[str, Any]:
        with self._lock:
            if self.runtime.status in {"running", "paused", "paused_service", "waiting_network", "waiting_window"}:
                raise RuntimeError("Cannot run preview while job is active")

        self._ensure_local_path()
        cmd = self._build_preview_command()
        proc = subprocess.run(cmd, capture_output=True, text=True)
        output = (proc.stdout + "\n" + proc.stderr).splitlines()
        deletions = []
        for line in output:
            lowered = line.lower()
            if "deleting " in lowered:
                deletions.append(line.strip())
            if len(deletions) >= limit:
                break
        self._record_event(
            "preview",
            "ok" if proc.returncode == 0 else "failed",
            f"Delete preview run returned {proc.returncode}",
        )
        return {
            "exit_code": proc.returncode,
            "deletes_count": len(deletions),
            "deletes_preview": deletions,
            "tail": "\n".join(output[-60:]),
        }

    def start(self, force_dry_run: bool = False, force_live: bool = False) -> None:
        if force_dry_run and force_live:
            raise RuntimeError("Cannot request both dry-run and live mode at the same time.")
        with self._lock:
            if self.runtime.status in {"running", "paused", "paused_service", "waiting_network", "waiting_window"}:
                raise RuntimeError("Job already running")
            if self._service_pause_checker():
                raise RuntimeError("Service auto-sync is paused. Resume service before starting jobs.")
            if (
                self.config.mode == "mirror"
                and not self.config.mirror_confirmed
                and not force_dry_run
            ):
                raise RuntimeError(
                    "Mirror mode requires explicit delete confirmation before live run."
                )
            self._cancel_requested.clear()
            self._thread = threading.Thread(
                target=self._runner,
                kwargs={"force_dry_run": force_dry_run, "force_live": force_live},
                daemon=True,
            )
            self._thread.start()
        self._record_event(
            "action",
            "requested",
            "Dry run requested by user."
            if force_dry_run
            else ("Live run requested by user." if force_live else "Run requested by user."),
        )

    def test_connection(self) -> dict[str, Any]:
        probe = [
            "ssh",
            "-o",
            "BatchMode=yes",
            "-o",
            f"ConnectTimeout={max(3, self.config.contimeout_seconds)}",
            self.config.server,
            "echo ok",
        ]
        proc = subprocess.run(probe, capture_output=True, text=True)
        output = (proc.stdout + "\n" + proc.stderr).strip()
        return {
            "reachable": proc.returncode == 0,
            "exit_code": proc.returncode,
            "output": output,
        }

    def pause(self) -> None:
        with self._lock:
            if self.runtime.status != "running" or not self._process:
                raise RuntimeError("Job is not running")
            os.killpg(os.getpgid(self._process.pid), signal.SIGSTOP)
            self.runtime.status = "paused"
            self._write_log("Paused by user.")
        self._record_event("action", "paused", "Paused by user.")

    def resume(self) -> None:
        with self._lock:
            if self.runtime.status != "paused" or not self._process:
                raise RuntimeError("Job is not paused")
            os.killpg(os.getpgid(self._process.pid), signal.SIGCONT)
            self.runtime.status = "running"
            self._write_log("Resumed by user.")
        self._record_event("action", "resumed", "Resumed by user.")

    def cancel(self) -> None:
        self._cancel_requested.set()
        with self._lock:
            proc = self._process
            self.runtime.next_retry_at = None
        if proc and proc.poll() is None:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except ProcessLookupError:
                pass
        self._write_log("Cancel requested by user.")
        self._record_event("action", "canceled", "Cancel requested by user.")

    def _runner(self, force_dry_run: bool = False, force_live: bool = False) -> None:
        cfg = self.config
        delay = max(1, cfg.retry_initial_seconds)
        waiting_window_logged = False
        paused_logged = False

        while True:
            if self._cancel_requested.is_set():
                with self._lock:
                    self.runtime.status = "canceled"
                    self.runtime.last_finished_at = now_iso()
                    self.runtime.last_exit_code = 130
                    self.runtime.next_retry_at = None
                    self.runtime.pid = None
                    self.runtime.last_error = "Canceled by user."
                self._record_event("run", "canceled", "Job canceled before start.")
                return

            if self._service_pause_checker():
                with self._lock:
                    self.runtime.status = "paused_service"
                    self.runtime.next_retry_at = None
                if not paused_logged:
                    self._write_log("Service-level pause active. Waiting for resume.")
                    self._record_event(
                        "service",
                        "paused_service",
                        "Global auto-sync pause is enabled.",
                    )
                    paused_logged = True
                time.sleep(1)
                continue
            if paused_logged:
                self._write_log("Service-level pause cleared. Continuing.")
                self._record_event(
                    "service",
                    "resumed_service",
                    "Global auto-sync pause cleared.",
                )
                paused_logged = False

            if not self._in_allowed_window():
                next_hour = (datetime.now().replace(minute=0, second=0, microsecond=0).timestamp() + 3600)
                with self._lock:
                    self.runtime.status = "waiting_window"
                    self.runtime.next_retry_at = datetime.fromtimestamp(
                        next_hour, tz=timezone.utc
                    ).isoformat()
                if not waiting_window_logged:
                    self._write_log("Outside allowed schedule window. Waiting...")
                    self._record_event(
                        "schedule",
                        "waiting_window",
                        "Outside allowed hour window; waiting.",
                    )
                    waiting_window_logged = True
                time.sleep(30)
                continue
            waiting_window_logged = False

            with self._lock:
                self.runtime.status = "running"
                self.runtime.attempts += 1
                self.runtime.last_started_at = now_iso()
                self.runtime.last_error = ""
                self.runtime.next_retry_at = None
                self.runtime.progress_percent = 0.0
                self.runtime.progress_line = ""
                attempt = self.runtime.attempts

            run_id = None
            run_is_dry = force_dry_run or (cfg.dry_run and not force_live)
            if self.history:
                run_id = self.history.start_run(
                    self.config.id,
                    attempt=attempt,
                    mode=cfg.mode,
                    dry_run=run_is_dry,
                )

            try:
                self._ensure_local_path()
                cmd = self._build_command(force_dry_run=force_dry_run, force_live=force_live)
                if cfg.nice_level != 0:
                    cmd = ["nice", "-n", str(cfg.nice_level)] + cmd
                self._write_log(f"Starting: {' '.join(shlex.quote(c) for c in cmd)}")
                run_lines: list[str] = []
                run_lines_full: list[str] = []
                proc = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    preexec_fn=os.setsid,
                )
                with self._lock:
                    self._process = proc
                    self.runtime.pid = proc.pid

                assert proc.stdout is not None
                for raw_line in proc.stdout:
                    line = raw_line.rstrip("\n")
                    self._write_log(line)
                    run_lines.append(line.lower())
                    run_lines_full.append(line)
                    if len(run_lines) > 300:
                        run_lines = run_lines[-300:]
                    if len(run_lines_full) > 2000:
                        run_lines_full = run_lines_full[-2000:]
                    match = self.PROGRESS_RE.search(line)
                    if not match:
                        match = self.PROGRESS_FALLBACK_RE.search(line)
                    if match:
                        with self._lock:
                            self.runtime.progress_percent = float(match.group("pct"))
                            self.runtime.progress_line = line
                    if self._cancel_requested.is_set():
                        break

                exit_code = proc.wait()
            except Exception as exc:  # noqa: BLE001
                exit_code = 1
                self._write_log(f"Internal error: {exc}")

            with self._lock:
                self._process = None
                self.runtime.pid = None
                self.runtime.last_exit_code = exit_code
                self.runtime.last_finished_at = now_iso()
                summary = self._summarize_run(run_lines_full if "run_lines_full" in locals() else [])
                self.runtime.last_run_type = "dry-run" if run_is_dry else "live"
                self.runtime.last_run_stats = summary
                self.runtime.last_run_summary = self._summary_text(summary, run_is_dry)

            if self._cancel_requested.is_set():
                with self._lock:
                    self.runtime.status = "canceled"
                    self.runtime.next_retry_at = None
                    self.runtime.last_error = "Canceled by user."
                if run_id and self.history:
                    self.history.finish_run(
                        run_id=run_id,
                        status="canceled",
                        exit_code=self.runtime.last_exit_code,
                        bytes_line=self.runtime.progress_line,
                        error=self.runtime.last_error,
                        summary=summary,
                    )
                self._record_event("run", "canceled", "Job canceled by user.")
                return

            if exit_code == 0:
                with self._lock:
                    self.runtime.status = "completed"
                    self.runtime.progress_percent = 100.0
                    self.runtime.next_retry_at = None
                self._write_log("Completed successfully.")
                if run_id and self.history:
                    self.history.finish_run(
                        run_id=run_id,
                        status="completed",
                        exit_code=0,
                        bytes_line=self.runtime.progress_line,
                        error="",
                        summary=summary,
                    )
                self._record_event(
                    "run",
                    "completed",
                    f"Run completed successfully. {self.runtime.last_run_summary}",
                )
                return

            # Failure path.
            network_related = self._is_retryable_network_failure(exit_code, run_lines if "run_lines" in locals() else [])
            if not network_related and cfg.auto_retry and not self._ssh_reachable():
                network_related = True
                self._write_log("SSH probe failed after rsync error; treating as network interruption.")
            with self._lock:
                self.runtime.last_error = (
                    "Network/SSH interruption."
                    if network_related
                    else f"Rsync failed with exit code {exit_code}."
                )

            if not cfg.auto_retry or not network_related:
                with self._lock:
                    self.runtime.status = "failed"
                    self.runtime.next_retry_at = None
                self._write_log("Failed and will not retry.")
                if run_id and self.history:
                    self.history.finish_run(
                        run_id=run_id,
                        status="failed",
                        exit_code=exit_code,
                        bytes_line=self.runtime.progress_line,
                        error=self.runtime.last_error,
                        summary=summary,
                    )
                self._record_event("run", "failed", self.runtime.last_error)
                return

            # Wait for network recovery before retrying.
            with self._lock:
                self.runtime.status = "waiting_network"
                self.runtime.retries += 1
            if run_id and self.history:
                self.history.finish_run(
                    run_id=run_id,
                    status="retry_wait",
                    exit_code=exit_code,
                    bytes_line=self.runtime.progress_line,
                    error=self.runtime.last_error,
                    summary=summary,
                )
            self._write_log(
                f"Network unavailable. Retrying in {delay}s (ZTNA/SSH check)."
            )
            self._record_event(
                "network",
                "waiting_network",
                f"Retrying in {delay}s due to network/SSH interruption.",
            )

            stop_at = time.time() + delay
            with self._lock:
                self.runtime.next_retry_at = datetime.fromtimestamp(
                    stop_at, tz=timezone.utc
                ).isoformat()

            while time.time() < stop_at:
                if self._cancel_requested.is_set():
                    with self._lock:
                        self.runtime.status = "canceled"
                        self.runtime.next_retry_at = None
                    return
                if self._service_pause_checker():
                    with self._lock:
                        self.runtime.status = "paused_service"
                        self.runtime.next_retry_at = None
                    break
                time.sleep(1)

            if self._service_pause_checker():
                continue

            if self._ssh_reachable():
                self._write_log("SSH reachable again. Restarting job.")
                self._record_event("network", "reachable", "SSH reachable. Retrying now.")
                delay = max(1, cfg.retry_initial_seconds)
                continue

            delay = min(delay * 2, max(delay, cfg.retry_max_seconds))


class AppState:
    def __init__(self, host: str, port: int) -> None:
        self._lock = threading.Lock()
        self._locations_lock = threading.Lock()
        self.started_at = now_iso()
        self.host = host
        self.port = port
        self.history = HistoryStore(DB_PATH)
        self.jobs: dict[str, JobControl] = {}
        self._locations: dict[str, list[dict[str, str]]] = {
            "remote_locations": [],
            "local_locations": [],
        }
        self._service_pause = False
        self._connectivity_lock = threading.Lock()
        self._connectivity_cache: dict[str, dict[str, Any]] = {}
        self._rsync_capabilities_cache: dict[str, Any] | None = None
        self._update_check_cache: dict[str, Any] | None = None
        self._restart_callback: Any = None
        self._stop_callback: Any = None
        self._load_settings()
        self._load_jobs()
        self._load_locations()

    def _list_listener_pids(self) -> list[int]:
        if not shutil.which("lsof"):
            return [os.getpid()]
        proc = subprocess.run(
            ["lsof", "-nP", f"-iTCP:{self.port}", "-sTCP:LISTEN", "-t"],
            capture_output=True,
            text=True,
        )
        if proc.returncode not in {0, 1}:
            return [os.getpid()]
        pids: set[int] = set()
        for raw in proc.stdout.splitlines():
            value = raw.strip()
            if not value:
                continue
            try:
                pids.add(int(value))
            except ValueError:
                continue
        if not pids:
            pids.add(os.getpid())
        return sorted(pids)

    def _process_detail(self, pid: int) -> dict[str, Any]:
        detail = {
            "pid": pid,
            "current": pid == os.getpid(),
            "command": "",
        }
        proc = subprocess.run(
            ["ps", "-p", str(pid), "-o", "command="],
            capture_output=True,
            text=True,
        )
        if proc.returncode == 0:
            detail["command"] = (proc.stdout.strip() or "")[:220]
        return detail

    def _instance_summary(self) -> dict[str, Any]:
        pids = self._list_listener_pids()
        details = [self._process_detail(pid) for pid in pids]
        count = len(pids)
        return {
            "count": count,
            "pids": pids,
            "details": details,
            "single_instance": count == 1 and os.getpid() in pids,
            "warning": (
                "Multiple listeners found on app port. Stop duplicates and keep one service."
                if count > 1
                else ""
            ),
            "cleanup_hint": (
                "Use Setup > service controls or ./bin/stop-ui.sh, then ./bin/status-ui.sh to verify one instance."
            ),
        }

    def _load_settings(self) -> None:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        if not SETTINGS_PATH.exists():
            SETTINGS_PATH.write_text(
                json.dumps({"service_pause": False, "updated_at": now_iso()}, indent=2),
                encoding="utf-8",
            )
        payload = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        self._service_pause = bool(payload.get("service_pause", False))

    def _save_settings(self) -> None:
        SETTINGS_PATH.write_text(
            json.dumps(
                {
                    "service_pause": self._service_pause,
                    "updated_at": now_iso(),
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    def _load_jobs(self) -> None:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        LOG_DIR.mkdir(parents=True, exist_ok=True)

        if not PROFILE_PATH.exists():
            PROFILE_PATH.write_text(json.dumps({"jobs": []}, indent=2), encoding="utf-8")

        payload = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
        loaded: dict[str, JobControl] = {}
        for raw_job in payload.get("jobs", []):
            cfg = JobConfig(**raw_job)
            loaded[cfg.id] = JobControl(
                cfg,
                history=self.history,
                rsync_caps_provider=self.get_rsync_capabilities,
                service_pause_checker=self.is_service_paused,
            )
        with self._lock:
            self.jobs = loaded

    def _save_jobs(self) -> None:
        with self._lock:
            payload = {"jobs": [asdict(job.config) for job in self.jobs.values()]}
        PROFILE_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def _load_locations(self) -> None:
        PROFILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        if not LOCATIONS_PATH.exists():
            LOCATIONS_PATH.write_text(
                json.dumps({"remote_locations": [], "local_locations": []}, indent=2),
                encoding="utf-8",
            )
        payload = json.loads(LOCATIONS_PATH.read_text(encoding="utf-8"))
        remotes: list[dict[str, str]] = []
        locals_: list[dict[str, str]] = []
        for item in payload.get("remote_locations", []):
            try:
                remotes.append(normalize_remote_location_payload(item))
            except Exception:
                continue
        for item in payload.get("local_locations", []):
            try:
                locals_.append(normalize_local_location_payload(item))
            except Exception:
                continue
        with self._locations_lock:
            self._locations = {
                "remote_locations": remotes,
                "local_locations": locals_,
            }

    def _save_locations(self) -> None:
        with self._locations_lock:
            payload = {
                "remote_locations": self._locations["remote_locations"],
                "local_locations": self._locations["local_locations"],
            }
        LOCATIONS_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def list_jobs(self) -> list[dict[str, Any]]:
        with self._lock:
            items = [job.serialize() for job in self.jobs.values()]
        latest_runs = self.history.get_latest_runs([item["config"]["id"] for item in items])
        for item in items:
            item["last_run"] = latest_runs.get(item["config"]["id"])
        return items

    def list_locations(self) -> dict[str, Any]:
        with self._locations_lock:
            remotes = sorted(self._locations["remote_locations"], key=lambda item: item["name"].lower())
            locals_ = sorted(self._locations["local_locations"], key=lambda item: item["name"].lower())
        return {
            "remote_locations": remotes,
            "local_locations": locals_,
            "checked_at": now_iso(),
        }

    def _dedupe_location_id(self, kind: str, location_id: str) -> str:
        with self._locations_lock:
            existing = {item["id"] for item in self._locations[kind]}
        if location_id not in existing:
            return location_id
        base = location_id
        counter = 2
        while f"{base}-{counter}" in existing:
            counter += 1
        return f"{base}-{counter}"

    def create_location(self, kind: str, payload: dict[str, Any]) -> dict[str, str]:
        if kind not in {"remote_locations", "local_locations"}:
            raise RuntimeError("Unknown location kind")
        normalized = (
            normalize_remote_location_payload(payload)
            if kind == "remote_locations"
            else normalize_local_location_payload(payload)
        )
        normalized["id"] = self._dedupe_location_id(kind, normalized["id"])
        with self._locations_lock:
            self._locations[kind].append(normalized)
        self._save_locations()
        return normalized

    def update_location(self, kind: str, location_id: str, payload: dict[str, Any]) -> dict[str, str]:
        if kind not in {"remote_locations", "local_locations"}:
            raise RuntimeError("Unknown location kind")
        with self._locations_lock:
            current = next((item for item in self._locations[kind] if item["id"] == location_id), None)
        if not current:
            raise KeyError(f"Unknown location: {location_id}")
        merged = dict(current)
        merged.update(payload)
        merged["id"] = location_id
        normalized = (
            normalize_remote_location_payload(merged)
            if kind == "remote_locations"
            else normalize_local_location_payload(merged)
        )
        normalized["id"] = location_id
        with self._locations_lock:
            next_items = [
                normalized if item["id"] == location_id else item
                for item in self._locations[kind]
            ]
            self._locations[kind] = next_items
        self._save_locations()
        return normalized

    def delete_location(self, kind: str, location_id: str) -> None:
        if kind not in {"remote_locations", "local_locations"}:
            raise RuntimeError("Unknown location kind")
        with self._locations_lock:
            current = next((item for item in self._locations[kind] if item["id"] == location_id), None)
        if not current:
            raise KeyError(f"Unknown location: {location_id}")
        jobs = self.list_jobs()
        if kind == "remote_locations":
            in_use = any(
                job["config"]["server"] == current["server"]
                and job["config"]["remote_path"] == current["remote_path"]
                for job in jobs
            )
            if in_use:
                raise RuntimeError("Cannot delete remote location used by existing jobs")
        else:
            in_use = any(job["config"]["local_path"] == current["local_path"] for job in jobs)
            if in_use:
                raise RuntimeError("Cannot delete local location used by existing jobs")
        with self._locations_lock:
            self._locations[kind] = [item for item in self._locations[kind] if item["id"] != location_id]
        self._save_locations()

    def compose_locations(self, payload: dict[str, Any]) -> dict[str, Any]:
        remote_ids = [str(item).strip() for item in payload.get("remote_ids", []) if str(item).strip()]
        local_ids = [str(item).strip() for item in payload.get("local_ids", []) if str(item).strip()]
        if not remote_ids or not local_ids:
            raise RuntimeError("Select at least one remote and one local location")
        pair_mode = str(payload.get("pair_mode", "matrix")).strip().lower()
        if pair_mode not in {"matrix", "zip"}:
            raise RuntimeError("pair_mode must be 'matrix' or 'zip'")

        with self._locations_lock:
            remotes_by_id = {item["id"]: item for item in self._locations["remote_locations"]}
            locals_by_id = {item["id"]: item for item in self._locations["local_locations"]}
        missing_remotes = [item for item in remote_ids if item not in remotes_by_id]
        missing_locals = [item for item in local_ids if item not in locals_by_id]
        if missing_remotes or missing_locals:
            missing = sorted(set(missing_remotes + missing_locals))
            raise RuntimeError(f"Unknown location ids: {', '.join(missing)}")

        remotes = [remotes_by_id[item] for item in remote_ids]
        locals_ = [locals_by_id[item] for item in local_ids]
        pairs: list[tuple[dict[str, str], dict[str, str]]] = []
        if pair_mode == "matrix":
            for remote in remotes:
                for local_item in locals_:
                    pairs.append((remote, local_item))
        else:
            if len(remotes) != len(locals_):
                raise RuntimeError("zip mode requires the same number of remotes and locals")
            pairs = list(zip(remotes, locals_))

        defaults = payload.get("defaults", {})
        if not isinstance(defaults, dict):
            defaults = {}
        create = bool(payload.get("create", False))
        name_template = str(payload.get("name_template", "{remote_name} -> {local_name}")).strip()
        if not name_template:
            name_template = "{remote_name} -> {local_name}"

        preview_jobs: list[dict[str, Any]] = []
        created_jobs: list[dict[str, Any]] = []
        errors: list[str] = []

        for index, (remote, local_item) in enumerate(pairs, start=1):
            try:
                name = name_template.format(
                    remote_id=remote["id"],
                    remote_name=remote["name"],
                    local_id=local_item["id"],
                    local_name=local_item["name"],
                    index=index,
                )
            except KeyError:
                name = f"{remote['name']} -> {local_item['name']}"
            base_payload: dict[str, Any] = {
                "id": f"{slugify(remote['name'])}-{slugify(local_item['name'])}-{index}",
                "name": name,
                "server": remote["server"],
                "remote_path": remote["remote_path"],
                "local_path": local_item["local_path"],
                "mode": str(defaults.get("mode", "append")),
                "mirror_confirmed": bool(defaults.get("mirror_confirmed", False)),
                "dry_run": bool(defaults.get("dry_run", True)),
                "auto_retry": bool(defaults.get("auto_retry", True)),
                "timeout_seconds": int(defaults.get("timeout_seconds", 60)),
                "contimeout_seconds": int(defaults.get("contimeout_seconds", 15)),
                "retry_initial_seconds": int(defaults.get("retry_initial_seconds", 10)),
                "retry_max_seconds": int(defaults.get("retry_max_seconds", 300)),
                "bwlimit_kbps": int(defaults.get("bwlimit_kbps", 0)),
                "nice_level": int(defaults.get("nice_level", 0)),
                "allowed_start_hour": int(defaults.get("allowed_start_hour", -1)),
                "allowed_end_hour": int(defaults.get("allowed_end_hour", -1)),
                "excludes": defaults.get("excludes", []),
                "extra_args": defaults.get("extra_args", []),
            }
            try:
                normalized = normalize_job_payload(base_payload)
                preview_jobs.append(normalized)
                if create:
                    created_jobs.append(self.create(normalized))
            except Exception as exc:
                errors.append(f"{remote['name']} -> {local_item['name']}: {exc}")

        return {
            "pair_mode": pair_mode,
            "create": create,
            "pairs_total": len(pairs),
            "preview_jobs": preview_jobs,
            "created_jobs": created_jobs,
            "created_count": len(created_jobs),
            "errors": errors,
            "generated_at": now_iso(),
        }

    def get(self, job_id: str) -> JobControl:
        with self._lock:
            if job_id not in self.jobs:
                raise KeyError(f"Unknown job: {job_id}")
            return self.jobs[job_id]

    def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        payload = dict(payload)
        payload["id"] = payload.get("id") or str(uuid.uuid4())[:8]
        cfg = JobConfig(**normalize_job_payload(payload))
        with self._lock:
            if cfg.id in self.jobs:
                raise RuntimeError(f"Job id already exists: {cfg.id}")
            self.jobs[cfg.id] = JobControl(
                cfg,
                history=self.history,
                rsync_caps_provider=self.get_rsync_capabilities,
                service_pause_checker=self.is_service_paused,
            )
        self._save_jobs()
        return self.get(cfg.id).serialize()

    def update(self, job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        job = self.get(job_id)
        merged = asdict(job.config)
        merged.update(payload)
        merged["id"] = job_id
        cfg = JobConfig(**normalize_job_payload(merged))
        job.update_config(cfg)
        self._save_jobs()
        return job.serialize()

    def delete(self, job_id: str) -> None:
        job = self.get(job_id)
        runtime = job.runtime.status
        if runtime in {"running", "paused", "paused_service", "waiting_network", "waiting_window"}:
            raise RuntimeError("Cannot delete a running job")
        with self._lock:
            del self.jobs[job_id]
        self._save_jobs()

    def is_service_paused(self) -> bool:
        with self._lock:
            return self._service_pause

    def set_service_paused(self, paused: bool) -> dict[str, Any]:
        with self._lock:
            self._service_pause = bool(paused)
        self._save_settings()
        return {"service_pause": self._service_pause, "updated_at": now_iso()}

    def get_rsync_capabilities(self, force: bool = False) -> dict[str, Any]:
        with self._lock:
            cached = self._rsync_capabilities_cache
        if cached and not force:
            checked_at = cached.get("checked_at")
            if checked_at:
                age_seconds = time.time() - datetime.fromisoformat(checked_at).timestamp()
                if age_seconds < 25:
                    return cached
        fresh = detect_rsync_capabilities()
        with self._lock:
            self._rsync_capabilities_cache = fresh
        return fresh

    def get_recent_history(self, job_id: str, limit: int = 20) -> dict[str, Any]:
        self.get(job_id)
        return self.history.get_recent(job_id, limit=limit)

    def onboarding_status(self) -> dict[str, Any]:
        checks = self.system_checks()
        jobs = self.list_jobs()
        connectivity = self.get_connectivity(force=True)
        servers = list((connectivity.get("servers") or {}).values())
        reachable = any(bool(item.get("reachable")) for item in servers)
        has_job = len(jobs) > 0
        has_dry_run = self.history.has_any_dry_run()
        if not has_job:
            ssh_state = "pending_no_job"
        elif connectivity.get("paused"):
            ssh_state = "paused"
        else:
            ssh_state = "ok" if reachable else "pending"

        steps = [
            {
                "id": "dependencies",
                "label": "Install Dependencies",
                "state": "ok" if checks.get("ready") else "pending",
                "detail": "python3, ssh, rsync",
            },
            {
                "id": "ssh_check",
                "label": "Verify SSH Reachability",
                "state": ssh_state,
                "detail": f"{sum(1 for x in servers if x.get('reachable'))}/{len(servers)} targets reachable",
            },
            {
                "id": "first_job",
                "label": "Create First Job",
                "state": "ok" if has_job else "pending",
                "detail": f"{len(jobs)} job(s) configured",
            },
            {
                "id": "first_dry_run",
                "label": "Run First Dry Run",
                "state": "ok" if has_dry_run else "pending",
                "detail": "Execute at least one dry-run before live sync.",
            },
        ]
        complete = all(step["state"] == "ok" for step in steps)
        return {
            "complete": complete,
            "steps": steps,
            "checked_at": now_iso(),
        }

    def diagnostics_bundle(self) -> dict[str, Any]:
        with self._lock:
            jobs_snapshot = [job.serialize() for job in self.jobs.values()]
        job_logs: dict[str, str] = {}
        for item in jobs_snapshot:
            cfg = item["config"]
            job_logs[cfg["id"]] = self.get(cfg["id"]).load_log_tail(limit=80)
        return {
            "generated_at": now_iso(),
            "service": self.service_status(),
            "system_checks": self.system_checks(),
            "connectivity": self.get_connectivity(force=False),
            "onboarding": self.onboarding_status(),
            "locations": self.list_locations(),
            "jobs": jobs_snapshot,
            "service_logs": self.service_logs(tail=120),
            "job_logs": job_logs,
        }

    def app_version_info(self) -> dict[str, Any]:
        return {
            "version": APP_VERSION,
            "update_repo": UPDATE_REPO,
            "checked_at": now_iso(),
        }

    def check_for_updates(self, force: bool = False) -> dict[str, Any]:
        with self._lock:
            cached = self._update_check_cache
        if cached and not force:
            checked_at = cached.get("checked_at")
            if checked_at:
                age_seconds = time.time() - datetime.fromisoformat(checked_at).timestamp()
                if age_seconds < 3600:
                    return cached

        url = f"https://api.github.com/repos/{UPDATE_REPO}/releases/latest"
        request = urllib.request.Request(
            url,
            headers={
                "Accept": "application/vnd.github+json",
                "User-Agent": "rsyncwebapp-update-checker",
            },
            method="GET",
        )
        result: dict[str, Any] = {
            "current_version": APP_VERSION,
            "update_repo": UPDATE_REPO,
            "checked_at": now_iso(),
            "ok": False,
            "update_available": False,
        }
        if (ROOT / ".git").exists():
            branch_code, branch_out = _run_capture(
                ["git", "-C", str(ROOT), "branch", "--show-current"]
            )
            local_code, local_out = _run_capture(["git", "-C", str(ROOT), "rev-parse", "HEAD"])
            branch = branch_out.strip() if branch_code == 0 and branch_out.strip() else "main"
            if local_code == 0 and local_out.strip():
                remote_code, remote_out = _run_capture(
                    ["git", "-C", str(ROOT), "ls-remote", "origin", f"refs/heads/{branch}"]
                )
                remote_sha = remote_out.split()[0] if remote_code == 0 and remote_out.strip() else ""
                if remote_sha:
                    local_sha = local_out.strip()
                    result.update(
                        {
                            "ok": True,
                            "channel": "git",
                            "branch": branch,
                            "local_commit": local_sha[:10],
                            "remote_commit": remote_sha[:10],
                            "update_available": local_sha != remote_sha,
                        }
                    )
                    with self._lock:
                        self._update_check_cache = result
                    return result

        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                payload = json.loads(response.read().decode("utf-8"))
            latest_tag = str(payload.get("tag_name", "")).strip()
            latest_version = latest_tag.lstrip("vV") if latest_tag else ""
            html_url = str(payload.get("html_url", "")).strip()
            update_available = bool(
                latest_version and _version_tuple(latest_version) > _version_tuple(APP_VERSION)
            )
            result.update(
                {
                    "ok": True,
                    "channel": "release",
                    "latest_tag": latest_tag,
                    "latest_version": latest_version,
                    "release_url": html_url,
                    "update_available": update_available,
                }
            )
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            result["error"] = str(exc)

        with self._lock:
            self._update_check_cache = result
        return result

    def preview_command(self, payload: dict[str, Any]) -> dict[str, Any]:
        preview_payload = dict(payload)
        preview_payload["id"] = preview_payload.get("id") or "preview-job"
        normalized = normalize_job_payload(preview_payload)
        cfg = JobConfig(**normalized)
        probe = JobControl(
            cfg,
            history=None,
            rsync_caps_provider=self.get_rsync_capabilities,
            service_pause_checker=self.is_service_paused,
        )
        command = probe._build_command(force_dry_run=False)
        return {
            "command": command,
            "shell": " ".join(shlex.quote(part) for part in command),
            "rsync_capabilities": self.get_rsync_capabilities(),
        }

    def _probe_server(self, server: str, timeout: int = 6) -> dict[str, Any]:
        started = time.time()
        proc = subprocess.run(
            [
                "ssh",
                "-o",
                "BatchMode=yes",
                "-o",
                f"ConnectTimeout={timeout}",
                server,
                "true",
            ],
            capture_output=True,
            text=True,
        )
        latency_ms = int((time.time() - started) * 1000)
        output = (proc.stdout + "\n" + proc.stderr).strip()
        return {
            "server": server,
            "reachable": proc.returncode == 0,
            "exit_code": proc.returncode,
            "latency_ms": latency_ms,
            "checked_at": now_iso(),
            "output": output,
        }

    def get_connectivity(self, force: bool = False) -> dict[str, Any]:
        with self._lock:
            servers = sorted({job.config.server for job in self.jobs.values()})
            paused = self._service_pause
        if paused:
            with self._connectivity_lock:
                cached_copy = dict(self._connectivity_cache)
            paused_results = {
                server: cached_copy.get(
                    server,
                    {
                        "server": server,
                        "reachable": False,
                        "exit_code": None,
                        "latency_ms": None,
                        "checked_at": now_iso(),
                        "output": "Connectivity probing paused by service control.",
                    },
                )
                for server in servers
            }
            return {
                "servers": paused_results,
                "checked_at": now_iso(),
                "paused": True,
            }
        results: dict[str, dict[str, Any]] = {}
        for server in servers:
            use_cache = False
            cached: dict[str, Any] | None = None
            with self._connectivity_lock:
                cached = self._connectivity_cache.get(server)
                if cached and not force:
                    checked_ts = datetime.fromisoformat(cached["checked_at"]).timestamp()
                    use_cache = (time.time() - checked_ts) < 15
            if use_cache and cached is not None:
                results[server] = cached
                continue
            probe = self._probe_server(server)
            with self._connectivity_lock:
                self._connectivity_cache[server] = probe
            results[server] = probe
        return {"servers": results, "checked_at": now_iso(), "paused": False}

    def service_status(self) -> dict[str, Any]:
        started_dt = datetime.fromisoformat(self.started_at)
        uptime = int((datetime.now(tz=timezone.utc) - started_dt).total_seconds())
        return {
            "pid": os.getpid(),
            "host": self.host,
            "port": self.port,
            "started_at": self.started_at,
            "uptime_seconds": uptime,
            "service_pause": self.is_service_paused(),
            "instances": self._instance_summary(),
        }

    def system_checks(self) -> dict[str, Any]:
        def check_command(command: str, args: list[str]) -> dict[str, Any]:
            path = shutil.which(command)
            if not path:
                return {"available": False, "path": "", "version": "", "detail": "not found in PATH"}
            proc = subprocess.run(args, capture_output=True, text=True)
            output = (proc.stdout + "\n" + proc.stderr).strip()
            first_line = output.splitlines()[0] if output else ""
            return {
                "available": proc.returncode == 0 or bool(first_line),
                "path": path,
                "version": first_line,
                "detail": output[:400],
            }

        rsync_info = check_command("rsync", ["rsync", "--version"])
        ssh_info = check_command("ssh", ["ssh", "-V"])
        launchctl_info = check_command("launchctl", ["launchctl", "help"])
        xcrun_info = check_command("xcrun", ["xcrun", "--version"])
        rsync_caps = self.get_rsync_capabilities(force=True)
        compatibility_ready = bool(rsync_caps.get("ready"))

        return {
            "ready": bool(rsync_info["available"] and ssh_info["available"] and compatibility_ready),
            "commands": {
                "rsync": rsync_info,
                "ssh": ssh_info,
                "launchctl": launchctl_info,
                "xcrun": xcrun_info,
            },
            "rsync_capabilities": rsync_caps,
            "compatibility_ready": compatibility_ready,
            "checked_at": now_iso(),
        }

    def service_logs(self, tail: int = 140) -> dict[str, Any]:
        safe_tail = max(20, min(800, int(tail)))
        log_files = [
            LOG_DIR / "launchagent.out.log",
            LOG_DIR / "launchagent.err.log",
            LOG_DIR / "app.log",
        ]
        entries: list[dict[str, Any]] = []
        for log_path in log_files:
            lines: list[str] = []
            if log_path.exists():
                with log_path.open("r", encoding="utf-8", errors="replace") as handle:
                    lines = [line.rstrip("\n") for line in handle.readlines()[-safe_tail:]]
            entries.append(
                {
                    "name": log_path.name,
                    "path": str(log_path),
                    "exists": log_path.exists(),
                    "lines": lines,
                }
            )
        return {"tail": safe_tail, "logs": entries, "checked_at": now_iso()}

    def platform_info(self) -> dict[str, Any]:
        system = platform.system().lower()
        if system == "darwin":
            os_id = "macos"
        elif system == "linux":
            os_id = "linux"
        elif system == "windows":
            os_id = "windows"
        else:
            os_id = "unknown"
        return {
            "os_id": os_id,
            "system": platform.system(),
            "release": platform.release(),
            "python": platform.python_version(),
        }

    def setup_options(self) -> dict[str, Any]:
        info = self.platform_info()
        os_id = info["os_id"]
        actions: list[dict[str, str]] = []
        if os_id == "macos":
            actions = [
                {
                    "id": "install_dependencies",
                    "label": "Install Dependencies",
                    "script": "install-deps.sh",
                    "description": "Install/verify python3, ssh, and rsync.",
                },
                {
                    "id": "update_app",
                    "label": "Update App",
                    "script": "update-app.sh",
                    "description": "Pull latest release if git checkout, or open release downloads.",
                },
                {
                    "id": "install_launchagent",
                    "label": "Enable Autostart",
                    "script": "install-launchagent.sh",
                    "description": "Start at login and auto-restart on crash.",
                },
                {
                    "id": "install_menubar",
                    "label": "Install Menu Bar",
                    "script": "install-menubar.sh",
                    "description": "Native menu bar controller (rsync.wa).",
                },
                {
                    "id": "install_desktop_shortcuts",
                    "label": "Desktop Shortcuts",
                    "script": "install-desktop-shortcuts.sh",
                    "description": "Create Start/Stop/Status desktop commands.",
                },
            ]
        elif os_id == "linux":
            actions = [
                {
                    "id": "install_dependencies",
                    "label": "Install Dependencies",
                    "script": "install-deps.sh",
                    "description": "Install/verify python3, ssh, and rsync.",
                },
                {
                    "id": "update_app",
                    "label": "Update App",
                    "script": "update-app.sh",
                    "description": "Pull latest release if git checkout, or open release downloads.",
                },
                {
                    "id": "install_linux_autostart",
                    "label": "Enable Autostart",
                    "script": "install-linux-autostart.sh",
                    "description": "Install user-level systemd service.",
                },
                {
                    "id": "install_linux_shortcuts",
                    "label": "Desktop Shortcuts",
                    "script": "install-linux-desktop-shortcuts.sh",
                    "description": "Create desktop launcher entries.",
                },
            ]
        elif os_id == "windows":
            actions = [
                {
                    "id": "install_dependencies",
                    "label": "Install Dependencies",
                    "script": "install-windows-deps.ps1",
                    "description": "Guide/install required dependencies for Windows.",
                },
                {
                    "id": "update_app",
                    "label": "Update App",
                    "script": "update-app.ps1",
                    "description": "Pull latest release if git checkout, or open release downloads.",
                },
                {
                    "id": "install_windows_shortcuts",
                    "label": "Desktop Shortcuts",
                    "script": "install-windows-shortcuts.ps1",
                    "description": "Create PowerShell desktop shortcuts.",
                },
                {
                    "id": "run_windows_quickstart",
                    "label": "Start App (Windows)",
                    "script": "windows-quickstart.ps1",
                    "description": "One-click start flow for Windows.",
                },
            ]
        return {"platform": info, "actions": actions, "checked_at": now_iso()}

    def run_setup_action(self, action_id: str) -> dict[str, Any]:
        options = self.setup_options()
        action = next((item for item in options["actions"] if item["id"] == action_id), None)
        if not action:
            raise RuntimeError(f"Unsupported setup action for this OS: {action_id}")
        script_path = BIN_DIR / action["script"]
        if not script_path.exists():
            raise RuntimeError(f"Setup script is missing: {script_path.name}")

        if script_path.suffix == ".ps1":
            command = [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(script_path),
            ]
        else:
            command = ["bash", str(script_path)]

        proc = subprocess.run(
            command,
            cwd=str(ROOT),
            capture_output=True,
            text=True,
        )
        output = (proc.stdout + "\n" + proc.stderr).strip()
        return {
            "action": action,
            "command": command,
            "exit_code": proc.returncode,
            "success": proc.returncode == 0,
            "output": output[-5000:],
            "ran_at": now_iso(),
        }

    def set_restart_callback(self, callback: Any) -> None:
        self._restart_callback = callback

    def restart_service(self) -> None:
        if not self._restart_callback:
            raise RuntimeError("Restart callback is not configured")
        self._restart_callback()

    def set_stop_callback(self, callback: Any) -> None:
        self._stop_callback = callback

    def stop_service(self) -> None:
        if not self._stop_callback:
            raise RuntimeError("Stop callback is not configured")
        self._stop_callback()


def normalize_job_payload(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(payload)
    normalized["mode"] = normalized.get("mode", "mirror")
    normalized["mirror_confirmed"] = bool(normalized.get("mirror_confirmed", False))
    normalized["dry_run"] = bool(normalized.get("dry_run", False))
    normalized["auto_retry"] = bool(normalized.get("auto_retry", True))

    excludes = normalized.get("excludes", [])
    if isinstance(excludes, str):
        excludes = parse_shell_list(excludes)
    normalized["excludes"] = excludes

    extra_args = normalized.get("extra_args", [])
    if isinstance(extra_args, str):
        extra_args = parse_shell_list(extra_args)
    normalized["extra_args"] = extra_args

    int_defaults = {
        "timeout_seconds": 60,
        "contimeout_seconds": 15,
        "retry_initial_seconds": 10,
        "retry_max_seconds": 300,
        "bwlimit_kbps": 0,
        "nice_level": 0,
        "allowed_start_hour": -1,
        "allowed_end_hour": -1,
    }
    for int_field, default_value in int_defaults.items():
        normalized[int_field] = int(normalized.get(int_field, default_value) or default_value)
    validate_job_payload(normalized)
    return normalized


def validate_job_payload(payload: dict[str, Any]) -> None:
    required = ("name", "server", "remote_path", "local_path")
    for key in required:
        value = str(payload.get(key, "")).strip()
        if not value:
            raise RuntimeError(f"Field '{key}' is required")

    if payload.get("mode") not in {"mirror", "append"}:
        raise RuntimeError("Mode must be 'mirror' or 'append'")
    if payload.get("mode") == "mirror" and not bool(payload.get("mirror_confirmed", False)):
        raise RuntimeError("Mirror mode requires explicit delete confirmation.")

    local_path = str(payload["local_path"])
    remote_path = str(payload["remote_path"])
    server = str(payload["server"])

    # Enforce one-way remote->local semantics.
    if not local_path.startswith("/"):
        raise RuntimeError("local_path must be an absolute local path")
    if ":" in local_path:
        raise RuntimeError("local_path must not contain ':' (remote syntax)")
    if not remote_path.startswith("/"):
        raise RuntimeError("remote_path must be absolute on remote host")
    if ":" in remote_path:
        raise RuntimeError("remote_path must not contain ':'")

    parts = [p for p in remote_path.split("/") if p]
    if ".." in parts:
        raise RuntimeError("remote_path must not include '..'")
    parts = [p for p in local_path.split("/") if p]
    if ".." in parts:
        raise RuntimeError("local_path must not include '..'")

    if server.startswith("/") or " " in server:
        raise RuntimeError("server must be an SSH host target like user@host")

    dangerous_arg_prefixes = (
        "--remove-source-files",
        "--rsync-path",
        "--remote-option",
        "--server",
        "--sender",
        "--daemon",
        "--write-batch",
        "--read-batch",
        "--delete",
        "--ignore-existing",
        "--dry-run",
        "--contimeout",
        "--timeout",
        "--rsh",
        "-e",
    )
    for arg in payload.get("extra_args", []):
        if any(str(arg).startswith(prefix) for prefix in dangerous_arg_prefixes):
            raise RuntimeError(
                f"extra_args contains disallowed one-way-breaking option: {arg}"
            )

    nice_level = int(payload.get("nice_level", 0))
    if nice_level < -20 or nice_level > 19:
        raise RuntimeError("nice_level must be between -20 and 19")

    for hour_key in ("allowed_start_hour", "allowed_end_hour"):
        hour = int(payload.get(hour_key, -1))
        if hour != -1 and (hour < 0 or hour > 23):
            raise RuntimeError(f"{hour_key} must be -1 or 0..23")


class RequestHandler(SimpleHTTPRequestHandler):
    server_version = "RsyncWebApp/1.0"

    def __init__(self, *args: Any, app_state: AppState, **kwargs: Any):
        self.app_state = app_state
        super().__init__(*args, directory=str(FRONTEND_DIR), **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        # Keep stdout clean.
        return

    def list_directory(self, path: str):  # type: ignore[override]
        self.send_error(403, "Directory listing is disabled")
        return None

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'")
        super().end_headers()

    def _read_json(self) -> dict[str, Any]:
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length > 1024 * 1024:
            raise RuntimeError("Request body too large")
        data = self.rfile.read(content_length) if content_length else b"{}"
        parsed = json.loads(data.decode("utf-8"))
        if not isinstance(parsed, dict):
            raise RuntimeError("JSON body must be an object")
        return dict(parsed)

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, message: str, status: int = 400) -> None:
        self._send_json({"ok": False, "error": message}, status=status)

    def _has_allowed_origin(self) -> bool:
        raw = self.headers.get("Origin") or self.headers.get("Referer")
        if not raw:
            return True
        parsed = urlparse(raw)
        host = (parsed.hostname or "").lower()
        allowed = {"localhost", "127.0.0.1", "rsync.localhost"}
        try:
            server_addr = getattr(self.server, "server_address", None)
            if isinstance(server_addr, tuple) and server_addr:
                allowed.add(str(server_addr[0]).lower())
        except Exception:
            pass
        return host in allowed

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/api/health":
            self._send_json({"ok": True, "now": now_iso()})
            return
        if path == "/api/service/status":
            self._send_json({"ok": True, "service": self.app_state.service_status()})
            return
        if path == "/api/service/settings":
            self._send_json(
                {
                    "ok": True,
                    "settings": {
                        "service_pause": self.app_state.is_service_paused(),
                    },
                }
            )
            return
        if path == "/api/system/checks":
            self._send_json({"ok": True, "checks": self.app_state.system_checks()})
            return
        if path == "/api/app/version":
            self._send_json({"ok": True, "app": self.app_state.app_version_info()})
            return
        if path == "/api/app/update-check":
            query = parse_qs(parsed.query)
            force = query.get("force", ["0"])[0] == "1"
            self._send_json({"ok": True, "update": self.app_state.check_for_updates(force=force)})
            return
        if path == "/api/onboarding/status":
            self._send_json({"ok": True, "onboarding": self.app_state.onboarding_status()})
            return
        if path == "/api/diagnostics":
            self._send_json({"ok": True, "diagnostics": self.app_state.diagnostics_bundle()})
            return
        if path == "/api/setup/options":
            self._send_json({"ok": True, "setup": self.app_state.setup_options()})
            return
        if path == "/api/service/logs":
            query = parse_qs(parsed.query)
            tail = int(query.get("tail", ["140"])[0])
            self._send_json({"ok": True, "service_logs": self.app_state.service_logs(tail=tail)})
            return
        if path == "/api/jobs":
            self._send_json({"ok": True, "jobs": self.app_state.list_jobs()})
            return
        if path == "/api/locations":
            self._send_json({"ok": True, "locations": self.app_state.list_locations()})
            return
        if path == "/api/connectivity":
            query = parse_qs(parsed.query)
            force = query.get("force", ["0"])[0] == "1"
            self._send_json(
                {"ok": True, "connectivity": self.app_state.get_connectivity(force=force)}
            )
            return
        if path.startswith("/api/jobs/") and path.endswith("/history"):
            job_id = path.split("/")[3]
            query = parse_qs(parsed.query)
            limit = int(query.get("limit", ["20"])[0])
            try:
                history = self.app_state.get_recent_history(job_id, limit=limit)
            except KeyError as exc:
                self._error(str(exc), status=404)
                return
            self._send_json({"ok": True, "job_id": job_id, "history": history})
            return
        if path.startswith("/api/jobs/") and path.endswith("/log"):
            job_id = path.split("/")[3]
            query = parse_qs(parsed.query)
            tail = int(query.get("tail", ["200"])[0])
            try:
                log_text = self.app_state.get(job_id).load_log_tail(limit=tail)
            except KeyError as exc:
                self._error(str(exc), status=404)
                return
            self._send_json({"ok": True, "job_id": job_id, "log": log_text})
            return
        if path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        if not self._has_allowed_origin():
            self._error("Origin not allowed for write operation", status=403)
            return
        try:
            if path == "/api/jobs/preview-command":
                payload = self._read_json()
                result = self.app_state.preview_command(payload)
                self._send_json({"ok": True, "result": result})
                return
            if path == "/api/jobs":
                payload = self._read_json()
                item = self.app_state.create(payload)
                self._send_json({"ok": True, "job": item}, status=201)
                return
            if path == "/api/locations/remote":
                payload = self._read_json()
                item = self.app_state.create_location("remote_locations", payload)
                self._send_json({"ok": True, "location": item}, status=201)
                return
            if path == "/api/locations/local":
                payload = self._read_json()
                item = self.app_state.create_location("local_locations", payload)
                self._send_json({"ok": True, "location": item}, status=201)
                return
            if path == "/api/locations/compose":
                payload = self._read_json()
                result = self.app_state.compose_locations(payload)
                self._send_json({"ok": True, "result": result}, status=200)
                return
            if path == "/api/service/pause-auto":
                result = self.app_state.set_service_paused(True)
                self._send_json({"ok": True, "settings": result})
                return
            if path == "/api/service/resume-auto":
                result = self.app_state.set_service_paused(False)
                self._send_json({"ok": True, "settings": result})
                return
            if path == "/api/service/restart":
                self._send_json({"ok": True, "message": "Restart requested"})
                self.app_state.restart_service()
                return
            if path == "/api/service/stop":
                self._send_json({"ok": True, "message": "Stop requested"})
                self.app_state.stop_service()
                return
            if path.startswith("/api/setup/"):
                action_id = path.split("/")[3]
                result = self.app_state.run_setup_action(action_id)
                self._send_json({"ok": True, "result": result}, status=200)
                return
            if path.startswith("/api/jobs/") and path.endswith("/start"):
                job_id = path.split("/")[3]
                self.app_state.get(job_id).start()
                self._send_json({"ok": True})
                return
            if path.startswith("/api/jobs/") and path.endswith("/start-live"):
                job_id = path.split("/")[3]
                self.app_state.get(job_id).start(force_live=True)
                self._send_json({"ok": True})
                return
            if path.startswith("/api/jobs/") and path.endswith("/dry-run"):
                job_id = path.split("/")[3]
                self.app_state.get(job_id).start(force_dry_run=True)
                self._send_json({"ok": True})
                return
            if path.startswith("/api/jobs/") and path.endswith("/pause"):
                job_id = path.split("/")[3]
                self.app_state.get(job_id).pause()
                self._send_json({"ok": True})
                return
            if path.startswith("/api/jobs/") and path.endswith("/resume"):
                job_id = path.split("/")[3]
                self.app_state.get(job_id).resume()
                self._send_json({"ok": True})
                return
            if path.startswith("/api/jobs/") and path.endswith("/cancel"):
                job_id = path.split("/")[3]
                self.app_state.get(job_id).cancel()
                self._send_json({"ok": True})
                return
            if path.startswith("/api/jobs/") and path.endswith("/test-connection"):
                job_id = path.split("/")[3]
                result = self.app_state.get(job_id).test_connection()
                self._send_json({"ok": True, "result": result})
                return
            if path.startswith("/api/jobs/") and path.endswith("/preview-deletes"):
                job_id = path.split("/")[3]
                result = self.app_state.get(job_id).preview_deletes(limit=250)
                self._send_json({"ok": True, "result": result})
                return
        except KeyError as exc:
            self._error(str(exc), status=404)
            return
        except Exception as exc:  # noqa: BLE001
            self._error(str(exc), status=400)
            return
        self._error("Unknown endpoint", status=404)

    def do_PUT(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        if not self._has_allowed_origin():
            self._error("Origin not allowed for write operation", status=403)
            return
        if path.startswith("/api/jobs/"):
            job_id = path.split("/")[3]
            try:
                payload = self._read_json()
                item = self.app_state.update(job_id, payload)
                self._send_json({"ok": True, "job": item})
            except KeyError as exc:
                self._error(str(exc), status=404)
            except Exception as exc:  # noqa: BLE001
                self._error(str(exc), status=400)
            return
        if path.startswith("/api/locations/remote/"):
            location_id = path.split("/")[4]
            try:
                payload = self._read_json()
                item = self.app_state.update_location("remote_locations", location_id, payload)
                self._send_json({"ok": True, "location": item})
            except KeyError as exc:
                self._error(str(exc), status=404)
            except Exception as exc:  # noqa: BLE001
                self._error(str(exc), status=400)
            return
        if path.startswith("/api/locations/local/"):
            location_id = path.split("/")[4]
            try:
                payload = self._read_json()
                item = self.app_state.update_location("local_locations", location_id, payload)
                self._send_json({"ok": True, "location": item})
            except KeyError as exc:
                self._error(str(exc), status=404)
            except Exception as exc:  # noqa: BLE001
                self._error(str(exc), status=400)
            return
        self._error("Unknown endpoint", status=404)

    def do_DELETE(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        if not self._has_allowed_origin():
            self._error("Origin not allowed for write operation", status=403)
            return
        if path.startswith("/api/jobs/"):
            job_id = path.split("/")[3]
            try:
                self.app_state.delete(job_id)
                self._send_json({"ok": True})
            except KeyError as exc:
                self._error(str(exc), status=404)
            except Exception as exc:  # noqa: BLE001
                self._error(str(exc), status=400)
            return
        if path.startswith("/api/locations/remote/"):
            location_id = path.split("/")[4]
            try:
                self.app_state.delete_location("remote_locations", location_id)
                self._send_json({"ok": True})
            except KeyError as exc:
                self._error(str(exc), status=404)
            except Exception as exc:  # noqa: BLE001
                self._error(str(exc), status=400)
            return
        if path.startswith("/api/locations/local/"):
            location_id = path.split("/")[4]
            try:
                self.app_state.delete_location("local_locations", location_id)
                self._send_json({"ok": True})
            except KeyError as exc:
                self._error(str(exc), status=404)
            except Exception as exc:  # noqa: BLE001
                self._error(str(exc), status=400)
            return
        self._error("Unknown endpoint", status=404)


def main() -> None:
    host = os.environ.get("RSYNC_WEBAPP_HOST", "127.0.0.1")
    port = int(os.environ.get("RSYNC_WEBAPP_PORT", "8787"))
    lock_path = INSTANCE_LOCK_DIR / f"rsync-webapp-{port}.lock"
    lock = SingleInstanceLock(lock_path, key=f"{host}:{port}")
    if not lock.acquire():
        print(
            f"Rsync Web App is already running on {host}:{port}. "
            "Use ./bin/status-ui.sh to inspect active instance."
        )
        return
    app_state = AppState(host=host, port=port)

    def request_restart() -> None:
        def _restart() -> None:
            time.sleep(0.35)
            os.execv(sys.executable, [sys.executable, str(Path(__file__).resolve())])

        threading.Thread(target=_restart, daemon=True).start()

    def request_stop() -> None:
        def _stop() -> None:
            time.sleep(0.35)
            if platform.system().lower() == "darwin":
                agent_file = Path.home() / "Library" / "LaunchAgents" / "local.rsyncwebapp.control.plist"
                if agent_file.exists():
                    try:
                        subprocess.run(
                            ["launchctl", "unload", str(agent_file)],
                            capture_output=True,
                            text=True,
                        )
                    except Exception:
                        pass
            os._exit(0)

        threading.Thread(target=_stop, daemon=True).start()

    app_state.set_restart_callback(request_restart)
    app_state.set_stop_callback(request_stop)

    def handler(*args: Any, **kwargs: Any) -> RequestHandler:
        return RequestHandler(*args, app_state=app_state, **kwargs)

    httpd = ThreadingHTTPServer((host, port), handler)
    print(f"Rsync Web App listening on http://{host}:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
        lock.release()


if __name__ == "__main__":
    main()
