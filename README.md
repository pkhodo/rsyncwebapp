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

## Get App Locally

If you do not already have this folder on your machine, start here.

Option A (non-coder friendly):
1. Open [https://github.com/pkhodo/rsyncwebapp](https://github.com/pkhodo/rsyncwebapp)
2. Click `Code` -> `Download ZIP`
3. Unzip it somewhere easy, for example `~/Applications/rsyncwebapp`
4. Open that folder

Option B (git):

```bash
git clone https://github.com/pkhodo/rsyncwebapp.git
cd rsyncwebapp
```

## Quick Start

Once the folder exists locally:

macOS Finder (easiest): double-click `bin/get-started.command`

Terminal (macOS/Linux):

```bash
cd /path/to/rsyncwebapp   # folder from ZIP or git clone
./bin/quickstart.sh
```

Windows PowerShell:

```powershell
cd C:\path\to\rsyncwebapp
python .\app\backend\server.py
```

Then open: `http://rsync.localhost:8787`

Then configure your own jobs in the UI. No project-specific paths or servers are preloaded.

This quickstart flow installs/verifies required dependencies (`python3`, `ssh`, `rsync`) before starting the app.

## Quality Gates

- CI: Ruff + mypy + frontend ESLint + test + smoke boot
- Local tests: `python -m unittest discover -s tests -v`

## No-CLI Workflow

After opening the UI once, use **Setup Center** to install platform-specific helpers:

- macOS: dependencies, autostart, menu bar, desktop shortcuts
- Linux: autostart (systemd user service), desktop launchers
- Windows: desktop shortcuts (PowerShell)

You can also run installers directly from `bin/` if preferred.

## macOS Menu Bar (Recommended)

For a no-terminal workflow on macOS:

1. Open UI, then Setup Center -> **Install Dependencies**
2. Setup Center -> **Install Menu Bar**
3. Use the `rsync.wa` menu bar item for:
   - Open UI
   - Start / Stop / Restart service
   - Status check

Remove menu bar later:

```bash
./bin/uninstall-menubar.sh
```

## Optional macOS Extras

Autostart on login:

```bash
./bin/install-launchagent.sh
```

Menu bar app:

```bash
./bin/install-menubar.sh
```

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
