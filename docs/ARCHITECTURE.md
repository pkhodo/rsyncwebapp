# Architecture

## Principles

- Local-first: backend binds to localhost by default.
- One-way safety by design: remote source to local destination.
- Operational clarity: all job states are visible and inspectable.
- Zero heavy runtime dependencies for easy install.

## Components

1. `app/backend/server.py`
- HTTP API + static file server
- Job lifecycle orchestration
- Retry/backoff logic with network classification
- Rsync capability detection and command fallback
- Service-level pause control (global auto-sync suspend)
- Log tail and history endpoints

2. `app/frontend/app.js`
- Controller/orchestration layer
- Polling loops, form events, API calls
- Setup Center action execution flow
- Basic/Advanced/Expert editor mode control

3. `app/frontend/ui.js`
- Rendering and view-state behavior
- Theme presets (Terminal, Fancy), compact mode, KPI cards
- Setup cards and history timeline rendering

4. `bin/*.sh`
- Start/stop/status/open scripts
- LaunchAgent/menu bar installers and Linux desktop integration

5. `app/menubar/RsyncWebAppMenuBar.swift`
- Native macOS status item controller (`rsync.wa`)

## Security Model

- Job payload validation runs in backend before command construction.
- Local paths must be absolute and local-only.
- Remote paths must be absolute remote paths.
- Known dangerous rsync args are blocked.
- Security headers are applied to all responses.
- Mutating APIs enforce localhost-origin checks.
- Directory listing is disabled.
- API is intended for local use (`127.0.0.1`).

## Why no React/Next (currently)

The current UI is intentionally dependency-light to reduce install friction and operational drift.  
If the project evolves to multi-user auth, plugin extensions, or rich charting, a framework migration is straightforward because controller and renderer are already split.
