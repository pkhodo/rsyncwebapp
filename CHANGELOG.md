# Changelog

All notable changes to this project are documented in this file.

## [0.5.0] - 2026-03-14

### Added
- New React + Vite + Tailwind frontend architecture with Lucide icon system.
- Rebuilt operations UI with dedicated screens: `Overview`, `Jobs`, `Locations`, `Builder`, `Logs`, `Setup`.
- Theme system refresh for `Terminal` and `Fancy` modes with compact density toggle.
- Unified toast feedback and richer KPI/status surfaces for high-signal monitoring.
- GitHub Pages docs pipeline using MkDocs Material (`docs-pages.yml`) with sitemap support.
- New docs entry page (`docs/index.md`) and crawler-friendly `docs/robots.txt`.

### Changed
- Backend now serves built frontend assets from `app/frontend/dist` (with source fallback).
- Job/Location/Setup/Diagnostics workflows migrated to the new component-based UI.
- Docs updated for frontend source/build flow and contributor setup.

### Fixed
- Menubar `Check Updates` now reports actual update status instead of blindly opening releases.
- LaunchAgent mismatch handling improved in `start-ui.sh` and `status-ui.sh` to avoid starting from the wrong checkout.

## [0.4.0] - 2026-03-14

### Added
- Location Manager screen with reusable remote/local profile libraries.
- Location compose engine (`matrix` and `zip` modes) to preview/create many jobs at once.
- Location APIs:
  - `GET /api/locations`
  - `POST /api/locations/remote`
  - `POST /api/locations/local`
  - `PUT /api/locations/remote/{id}`
  - `PUT /api/locations/local/{id}`
  - `DELETE /api/locations/remote/{id}`
  - `DELETE /api/locations/local/{id}`
  - `POST /api/locations/compose`
- Example location profile file: `profiles/locations.example.json`.

### Changed
- Information architecture expanded to include dedicated `Locations` navigation area.
- Diagnostics payload now includes location profile state.

### Safety
- Location payload validation enforces absolute paths and one-way-safe host/path constraints.
- In-use location deletion is blocked when referenced by existing jobs.

## [0.3.1] - 2026-03-14

### Added
- In-app update flow: `Check Updates` status/action in header.
- Backend update endpoints: `GET /api/app/version` and `GET /api/app/update-check`.
- Setup Center updater action (`Update App`) for macOS/Linux/Windows.
- Update helper scripts: `bin/update-app.sh` and `bin/update-app.ps1`.

### Changed
- Full visual redesign pass for cleaner, more minimal dashboard usability.
- Improved control hierarchy and readability in dense operational screens.
- Update checks now support git-channel comparison (`local vs origin`) before release API fallback.

### Fixed
- UX friction around discovering how to upgrade app builds.

## [0.3.0] - 2026-03-14

### Added
- Global service pause/resume control for auto-sync and retry loops.
- Two production themes: `Terminal` and `Fancy`.
- Basic/Advanced/Expert editor modes and command preview endpoint.
- Rsync compatibility detection with capability-aware command building.
- Security hardening headers and origin checks for mutating API routes.
- CI pipeline with Ruff, mypy, frontend lint, unit/integration tests, and smoke boot.
- Backend integration tests for retry flow and lifecycle replay.
- Setup/ops docs: migration notes, UX writing guide, and security audit.

### Changed
- Retry classification now uses both exit-code and output-pattern analysis.
- Service status includes global pause state.
- Connectivity probes are suspended when global service pause is enabled.
- Job profile boot now starts empty by default (no sample job auto-copy).

### Fixed
- Compatibility issue where newer rsync flags could fail on limited implementations.
- Retry false negatives caused by relying only on simple log-tail matching.
- Documentation mismatch around default preloaded jobs.

## [0.2.0] - 2026-03-14

### Added
- Setup Center (one-click installer actions).
- Run history panel and persisted events/runs.
- Menu bar controller label `rsync.wa`.
- Cross-platform helper installers.
