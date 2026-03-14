# Rsync Web App Guide

## URL

Default URL:

```bash
http://rsync.localhost:8787
```

## Start / Stop

```bash
cd /path/to/rsyncwebapp
./bin/quickstart.sh
./bin/start-ui.sh
./bin/status-ui.sh
./bin/stop-ui.sh
```

Open in browser:

```bash
./bin/open-ui.sh
```

## Autostart and Desktop Integration

macOS autostart (restart on crash + start at login):

```bash
./bin/install-launchagent.sh
```

macOS menu bar controller:

```bash
./bin/install-menubar.sh
```

Remove menu bar controller:

```bash
./bin/uninstall-menubar.sh
```

macOS desktop shortcuts:

```bash
./bin/install-desktop-shortcuts.sh
```

Linux autostart (systemd user service):

```bash
./bin/install-linux-autostart.sh
```

Linux desktop launchers:

```bash
./bin/install-linux-desktop-shortcuts.sh
```

Windows desktop shortcuts (PowerShell):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\bin\install-windows-shortcuts.ps1
```

## First Configuration

1. Open the UI.
2. Use **Setup Center** and run **Install Dependencies** first (`python3`, `ssh`, `rsync`).
3. Use remaining one-click helpers (autostart/menu/tray/shortcuts where available).
4. Create jobs with your own:
   - SSH server (`user@host`)
   - absolute remote path (`/remote/source/path`)
   - absolute local path (`/absolute/local/path`)
5. Keep `dry run` enabled for first validation.
6. Run `Test Conn` and `Preview Deletes`.
7. Disable dry-run only after validation.
8. Use `Pause Auto-Sync` when ZTNA is intentionally offline for extended periods.

## Editor Modes

- `Basic`: required fields and safe defaults
- `Advanced`: retry, timeout, schedule, and performance controls
- `Expert`: raw args and exact command preview

## Job Modes

- `mirror`: synchronize and delete local files removed on remote
- `append`: copy only new files, keep existing local files

## Network Interruptions / ZTNA

When SSH/rsync is unavailable:

- job status moves to `waiting_network`
- retry backoff is applied
- SSH reachability is probed
- job resumes automatically when reachable again

When **Pause Auto-Sync** is enabled:

- new runs are blocked
- retry/probe loops are suspended
- connectivity probing is paused

## Runtime Storage

- Job profiles: `profiles/jobs.json` (local)
- Example profile: `profiles/jobs.example.json`
- Service state: `state/`
- Logs: `state/logs/`
- Metadata DB: `state/rsync-webapp.db`

## API (Local)

- `GET /api/health`
- `GET /api/jobs`
- `POST /api/jobs/preview-command`
- `POST /api/jobs`
- `PUT /api/jobs/{id}`
- `DELETE /api/jobs/{id}`
- `POST /api/jobs/{id}/start`
- `POST /api/jobs/{id}/dry-run`
- `POST /api/jobs/{id}/pause`
- `POST /api/jobs/{id}/resume`
- `POST /api/jobs/{id}/cancel`
- `POST /api/jobs/{id}/test-connection`
- `POST /api/jobs/{id}/preview-deletes`
- `GET /api/jobs/{id}/log`
- `GET /api/jobs/{id}/history`
- `GET /api/connectivity`
- `GET /api/system/checks`
- `GET /api/setup/options`
- `GET /api/service/status`
- `GET /api/service/settings`
- `GET /api/service/logs`
- `POST /api/service/pause-auto`
- `POST /api/service/resume-auto`
- `POST /api/service/restart`
- `POST /api/service/stop`
- `POST /api/setup/{action_id}`
