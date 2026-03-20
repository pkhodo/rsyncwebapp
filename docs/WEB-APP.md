# Rsync Web App Guide

## URL

Default URL:

```bash
http://rsync.localhost:8787
```

If `8787` is occupied, the app auto-selects another free local port and prints it in `./bin/start-ui.sh` output.

## Navigation Areas

- Overview
- Jobs
- Locations
- Job Builder
- Logs & Diagnostics
- Setup & Updates

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

Update helpers:

```bash
./bin/update-app.sh
```

Windows:

```powershell
.\bin\update-app.ps1
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

Optional signing/notarization for distributing the menu bar helper:

```bash
./bin/sign-menubar.sh "Developer ID Application: YOUR NAME (TEAMID)"
./bin/notarize-menubar.sh rsyncwebapp-notary
```

macOS desktop shortcuts:

```bash
./bin/install-desktop-shortcuts.sh
```

Desktop shortcuts include a one-click `Reinstall LaunchAgent` command.

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

Windows one-click starter:

```powershell
.\bin\get-started-windows.bat
```

## First Configuration

1. Open the UI.
2. Complete the **First-Run Wizard** cards from left to right.
3. Use **Setup Center** and run **Install Dependencies** first (`python3`, `ssh`, `rsync`).
4. Use remaining one-click helpers (autostart/menu/tray/shortcuts where available).
5. Create jobs with your own:
   - SSH server (`user@host`)
   - absolute remote path (`/remote/source/path`)
   - absolute local path (`/absolute/local/path`)
6. For `mirror` mode, explicitly enable **Mirror delete confirmed** in the editor.
7. Keep `dry run` enabled for first validation.
8. Run `Test Conn` and `Preview Deletes`.
9. Disable dry-run only after validation.
10. Use `Pause Auto-Sync` when ZTNA is intentionally offline for extended periods.
11. Use **Copy Diagnostics** in the header when you need a full state snapshot for debugging/support.
12. Use **Check Updates** in the header and **Update App** in Setup Center for one-click upgrade flow.
13. Automatic update checks run at most once per week per browser profile.
14. Use **Locations** to manage reusable remote/local profiles and compose jobs in bulk.

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
- Location profiles: `profiles/locations.json` (local)
- Example locations: `profiles/locations.example.json`
- Service state: `state/`
- Logs: `state/logs/`
- Metadata DB: `state/rsync-webapp.db`

## API (Local)

- `GET /api/health`
- `GET /api/jobs`
- `GET /api/locations`
- `POST /api/jobs/preview-command`
- `POST /api/jobs`
- `POST /api/locations/remote`
- `POST /api/locations/local`
- `POST /api/locations/compose`
- `PUT /api/jobs/{id}`
- `PUT /api/locations/remote/{id}`
- `PUT /api/locations/local/{id}`
- `DELETE /api/jobs/{id}`
- `DELETE /api/locations/remote/{id}`
- `DELETE /api/locations/local/{id}`
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
- `GET /api/app/version`
- `GET /api/app/update-check`
- `GET /api/onboarding/status`
- `GET /api/diagnostics`
- `GET /api/setup/options`
- `GET /api/service/status`
- `GET /api/service/settings`
- `GET /api/service/logs`
- `POST /api/service/pause-auto`
- `POST /api/service/resume-auto`
- `POST /api/service/restart`
- `POST /api/service/stop`
- `POST /api/setup/{action_id}`
