# Security Audit (2026-03-14)

## Scope
- Backend API (`app/backend/server.py`)
- Frontend controls and write actions
- Local helper scripts and setup actions

## Findings summary
- High: 0
- Medium: 0
- Low: 3

## Low findings and disposition
1. Localhost write-action CSRF risk.
   - Mitigation implemented: write operations now enforce allowed origin/referer host checks.
2. Missing secure browser headers.
   - Mitigation implemented: CSP, frame denial, no-sniff, no-referrer headers.
3. Directory listing exposure from static handler.
   - Mitigation implemented: directory listing disabled.

## Additional hardening implemented
- Request body size limit for JSON API.
- One-way safety constraints strengthened for dangerous `extra_args`.
- Connectivity probing can be globally paused to avoid unnecessary remote checks.

## Residual risk
- The app intentionally executes local helper scripts from trusted repository paths.
- Local user account compromise can still control the app and profiles.
- This project is local-first by design and should remain bound to `127.0.0.1`.
