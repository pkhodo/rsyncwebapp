# Rsync Web App

Local-first web dashboard for one-way `rsync` jobs (`remote -> local`) with retries, logs, previews, setup helpers, and high-signal operations UI.

## 60-Second Start

1. Get the app folder on your machine:
   - Download ZIP: [https://github.com/pkhodo/rsyncwebapp](https://github.com/pkhodo/rsyncwebapp) -> `Code` -> `Download ZIP`, then unzip.
   - Or git clone:

```bash
git clone https://github.com/pkhodo/rsyncwebapp.git
cd rsyncwebapp
```

2. Start it with one click:
   - macOS: double-click `bin/get-started.command`
   - Windows: double-click `bin/get-started-windows.bat`
   - Linux:

```bash
./bin/quickstart.sh
```

3. Open `http://rsync.localhost:8787`
4. In the UI, complete **First-Run Wizard** and create your first job.

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
- In-app diagnostics copy button for support/debug sharing

## Safety Defaults

- Enforces absolute remote and local paths
- Enforces one-way semantics (`server:/remote/path` -> local path)
- Mirror mode requires explicit delete confirmation in the editor
- Blocks dangerous rsync options that can break one-way behavior
- Guards write APIs to same-origin localhost contexts
- Runs on `127.0.0.1` by default

## No-CLI Workflow

After opening the UI once, use **First-Run Wizard** and **Setup Center**:

- First-Run Wizard walks through dependency check, first job, SSH reachability, and first dry-run.
- Setup Center installs platform-specific helpers:
- macOS: dependencies, autostart, menu bar, desktop shortcuts
- Linux: autostart (systemd user service), desktop launchers
- Windows: dependencies, desktop shortcuts, and one-click quickstart

Use **Copy Diagnostics** in the top action bar if you need to share service state/log context.

You can also run installers directly from `bin/` if preferred.

## Updating The App

No manual git workflow is required for most users:

- Click **Check Updates** in the header to see if a newer release exists.
- In **Setup Center**, run **Update App**:
  - If this is a git clone, it performs a safe fast-forward update.
  - If this is a ZIP install, it opens the latest release download page.
- Update helpers are:
  - macOS/Linux: `./bin/update-app.sh`
  - Windows: `.\bin\update-app.ps1`

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

Sign menu bar app (optional for distribution outside your own machine):

```bash
./bin/sign-menubar.sh "Developer ID Application: YOUR NAME (TEAMID)"
```

Desktop shortcuts:

```bash
./bin/install-desktop-shortcuts.sh
```

## Documentation

- [Web App Guide](./docs/WEB-APP.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Migration Notes](./docs/MIGRATIONS.md)
- [Apple Signing](./docs/APPLE-SIGNING.md)
- [UX Voice Guide](./docs/UX-VOICE.md)
- [Security Audit](./docs/SECURITY-AUDIT.md)
- [Changelog](./CHANGELOG.md)
- [Legal Notice](./NOTICE.md)
- [Contributing](./CONTRIBUTING.md)
- [Security Policy](./SECURITY.md)

## License

MIT. See [LICENSE](./LICENSE).
