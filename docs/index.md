# rsync.wa Documentation

`rsync.wa` is a local-first operations console for one-way `rsync` workflows (`remote -> local`) with strong safety defaults, retry behavior, diagnostics, and setup helpers.

## 60-Second Start

1. Get the app:
   - Git clone:

```bash
git clone https://github.com/pkhodo/rsyncwebapp.git
cd rsyncwebapp
```

2. Start:
   - macOS: double-click `bin/get-started.command`
   - Windows: double-click `bin/get-started-windows.bat`
   - Linux:

```bash
./bin/quickstart.sh
```

3. Open:

```text
http://rsync.localhost:8787
```

## Documentation Map

- [Web App Guide](WEB-APP.md)
- [Architecture](ARCHITECTURE.md)
- [Migrations](MIGRATIONS.md)
- [Security Audit](SECURITY-AUDIT.md)
- [UX Voice](UX-VOICE.md)
- [Apple Signing](APPLE-SIGNING.md)

## Safety Model

- One-way default semantics (`remote -> local`)
- Absolute path validation for remote and local
- Mirror mode requires explicit delete confirmation
- Dangerous rsync args blocked
- API bound to localhost by default

## Support Data Locations

- Jobs: `profiles/jobs.json`
- Locations: `profiles/locations.json`
- Runtime metadata: `state/rsync-webapp.db`
- Service state: `state/service-settings.json`
- Logs: `state/logs/`
