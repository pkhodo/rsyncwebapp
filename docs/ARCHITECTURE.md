# Architecture

## Principles

- Local-first: backend binds to localhost by default.
- One-way safety by design: remote source to local destination.
- Operational clarity: job state and service state are visible in one console.
- Lightweight backend with pragmatic frontend tooling.

## System Components

1. `app/backend/server.py`
- Local HTTP API + static asset server
- Job lifecycle orchestration
- Retry/backoff logic with network-failure classification
- Rsync capability detection and command fallback behavior
- Service-level pause/resume control
- Diagnostics, history, and setup action endpoints

2. `app/frontend/src/*` (React + Vite + Tailwind)
- Multi-screen operations console (`Overview`, `Jobs`, `Locations`, `Builder`, `Logs`, `Setup`)
- Polling/state orchestration and API integration
- Theme presets (`Terminal`, `Fancy`) and compact mode
- Basic/Advanced/Expert builder modes

3. `app/menubar/RsyncWebAppMenuBar.swift`
- Native macOS status item (`rsync.wa`)
- Open/start/stop/restart/status controls
- Update check + updater action integration

4. `bin/*.sh` and platform helpers
- Service lifecycle scripts
- Setup/install scripts (dependencies, launchagent, shortcuts, menu bar)
- Update scripts

## Persistence Model

- Jobs: `profiles/jobs.json`
- Location profiles: `profiles/locations.json`
- Runtime history/events: `state/rsync-webapp.db` (SQLite)
- Service settings: `state/service-settings.json`
- Logs: `state/logs/`

## Security Model

- Input validation before command construction
- Absolute path constraints (remote and local)
- One-way-safety guardrails on rsync args
- Mirror mode requires explicit delete confirmation
- Mutating endpoints enforce localhost-origin checks
- Security response headers enabled
- Intended local-only usage (`127.0.0.1`)
