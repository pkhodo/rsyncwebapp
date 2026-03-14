import tempfile
import unittest
from pathlib import Path
from typing import cast
from unittest.mock import patch

from app.backend import server


def _base_payload():
    return {
        "id": "job1",
        "name": "Test Job",
        "server": "user@example-host",
        "remote_path": "/srv/source",
        "local_path": "/tmp/local-target",
        "mode": "mirror",
        "dry_run": False,
        "auto_retry": True,
        "excludes": [],
        "extra_args": [],
        "timeout_seconds": 60,
        "contimeout_seconds": 15,
        "retry_initial_seconds": 1,
        "retry_max_seconds": 2,
        "bwlimit_kbps": 0,
        "nice_level": 0,
        "allowed_start_hour": -1,
        "allowed_end_hour": -1,
    }


def _caps(progress2=True, append_verify=True, contimeout=True):
    return {
        "available": True,
        "ready": True,
        "path": "/usr/bin/rsync",
        "version": "rsync 3.2.7",
        "flavor": "rsync",
        "supports": {
            "human_readable": True,
            "info": progress2,
            "progress": True,
            "progress2": progress2,
            "append_verify": append_verify,
            "append": True,
            "partial": True,
            "contimeout": contimeout,
            "ignore_existing": True,
            "delete": True,
        },
        "notes": [],
        "checked_at": server.now_iso(),
    }


class ValidationTests(unittest.TestCase):
    def test_rejects_relative_local_path(self):
        payload = _base_payload()
        payload["local_path"] = "relative/path"
        with self.assertRaises(RuntimeError):
            server.normalize_job_payload(payload)

    def test_rejects_dangerous_extra_arg(self):
        payload = _base_payload()
        payload["extra_args"] = ["--remove-source-files"]
        with self.assertRaises(RuntimeError):
            server.normalize_job_payload(payload)


class CommandBuildTests(unittest.TestCase):
    def test_falls_back_when_progress2_unavailable(self):
        cfg = server.JobConfig(**server.normalize_job_payload(_base_payload()))
        job = server.JobControl(cfg, rsync_caps_provider=lambda: _caps(progress2=False, append_verify=False))
        cmd = job._build_command()
        cmd_str = " ".join(cmd)
        self.assertIn("--progress", cmd_str)
        self.assertNotIn("--info=progress2", cmd_str)
        self.assertNotIn("--append-verify", cmd_str)

    def test_start_blocked_when_service_paused(self):
        cfg = server.JobConfig(**server.normalize_job_payload(_base_payload()))
        job = server.JobControl(cfg, rsync_caps_provider=lambda: _caps(), service_pause_checker=lambda: True)
        with self.assertRaises(RuntimeError):
            job.start()


class RetryClassificationTests(unittest.TestCase):
    def test_retryable_by_exit_code(self):
        cfg = server.JobConfig(**server.normalize_job_payload(_base_payload()))
        job = server.JobControl(cfg, rsync_caps_provider=lambda: _caps())
        self.assertTrue(job._is_retryable_network_failure(255, []))

    def test_retryable_by_output_pattern(self):
        cfg = server.JobConfig(**server.normalize_job_payload(_base_payload()))
        job = server.JobControl(cfg, rsync_caps_provider=lambda: _caps())
        self.assertTrue(job._is_retryable_network_failure(1, ["ssh: connection timed out"]))


class _FakePopen:
    scenarios: list[dict[str, object]] = []
    _pid = 32000

    def __init__(self, *_args, **_kwargs):
        if not _FakePopen.scenarios:
            raise RuntimeError("No fake scenarios left")
        scenario = _FakePopen.scenarios.pop(0)
        _FakePopen._pid += 1
        self.pid = _FakePopen._pid
        self._exit = int(cast(int, scenario["exit_code"]))
        self.stdout = iter(cast(list[str], scenario["lines"]))

    def wait(self):
        return self._exit

    def poll(self):
        return None


class LifecycleReplayTests(unittest.TestCase):
    def test_network_failure_then_success(self):
        payload = _base_payload()
        payload["retry_initial_seconds"] = 1
        payload["retry_max_seconds"] = 2
        cfg = server.JobConfig(**server.normalize_job_payload(payload))

        with tempfile.TemporaryDirectory() as td:
            log_dir = Path(td) / "logs"
            log_dir.mkdir(parents=True, exist_ok=True)
            with patch.object(server, "LOG_DIR", log_dir):
                job = server.JobControl(
                    cfg,
                    rsync_caps_provider=lambda: _caps(),
                    service_pause_checker=lambda: False,
                )
                _FakePopen.scenarios = [
                    {"exit_code": 255, "lines": ["ssh: connection timed out"]},
                    {"exit_code": 0, "lines": ["123,456 100% 4.00MB/s 00:00:00"]},
                ]
                with patch.object(server.subprocess, "Popen", _FakePopen):
                    with patch.object(job, "_ssh_reachable", return_value=True):
                        job._runner(force_dry_run=False)

                self.assertEqual(job.runtime.status, "completed")
                self.assertEqual(job.runtime.retries, 1)
                self.assertGreaterEqual(job.runtime.attempts, 2)


if __name__ == "__main__":
    unittest.main()
