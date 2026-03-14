# Changelog

All notable changes to this project are documented in this file.

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
