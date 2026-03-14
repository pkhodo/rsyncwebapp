# Rsync Web App

Local-first web dashboard for one-way `rsync` jobs (`remote -> local`) with retries, logs, previews, setup helpers, and high-signal operations UI.

## Highlights

- Browser UI at `http://rsync.localhost:8787`
- Job editor with Basic / Advanced / Expert modes
- Two curated themes: `Terminal` and `Fancy`
- Dry run, delete preview, test connection
- Pause/resume/cancel/start controls
- Auto-retry when network/SSH is unavailable
- Global service pause (`Pause Auto-Sync`) for ZTNA downtime periods
- Service health + service logs in UI
- System readiness + rsync capability checks
- Setup Center with one-click installers per detected OS
- Run history timeline (runs + events) per job
- Compact command-center mode with KPI cards
- Optional macOS LaunchAgent + menu bar controller

## Safety Defaults

- Enforces absolute remote and local paths
- Enforces one-way semantics (`server:/remote/path` -> local path)
- Blocks dangerous rsync options that can break one-way behavior
- Guards write APIs to same-origin localhost contexts
- Runs on `127.0.0.1` by default

## Quick Start

```bash
cd /path/to/rsyncwebapp
./bin/quickstart.sh
```

Then configure your own jobs in the UI.  
No project-specific paths or servers are preloaded.

macOS Finder users can also double-click:

```bash
bin/get-started.command
```

This quickstart flow installs/verifies required dependencies (`python3`, `ssh`, `rsync`) before starting the app.

## Publish To GitHub

```bash
cd /path/to/rsyncwebapp
./bin/publish-github.sh rsyncwebapp public
```

Requires `gh` and prior `gh auth login`.

## Quality Gates

- CI: Ruff + mypy + frontend ESLint + test + smoke boot
- Local tests: `python -m unittest discover -s tests -v`

## No-CLI Workflow

After opening the UI once, use **Setup Center** to install platform-specific helpers:

- macOS: autostart, menu bar, desktop shortcuts
- Linux: autostart (systemd user service), desktop launchers
- Windows: desktop shortcuts (PowerShell)

You can also run installers directly from `bin/` if preferred.

## Optional macOS Convenience

Autostart on login:

```bash
./bin/install-launchagent.sh
```

Menu bar app:

```bash
./bin/install-menubar.sh
```

The menu bar item appears as `rsync.wa` with native macOS symbol icons.

Desktop shortcuts:

```bash
./bin/install-desktop-shortcuts.sh
```

## Documentation

- [Web App Guide](./docs/WEB-APP.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Migration Notes](./docs/MIGRATIONS.md)
- [UX Voice Guide](./docs/UX-VOICE.md)
- [Security Audit](./docs/SECURITY-AUDIT.md)
- [Changelog](./CHANGELOG.md)
- [Legal Notice](./NOTICE.md)
- [Contributing](./CONTRIBUTING.md)
- [Security Policy](./SECURITY.md)

## License

MIT. See [LICENSE](./LICENSE).
