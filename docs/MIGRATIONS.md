# Migration Notes

## 0.2.x -> 0.3.0

### Behavioral changes
- The app no longer auto-copies `profiles/jobs.example.json` into `profiles/jobs.json` on first boot.
- Service-level pause now blocks job starts and network retry probing until resumed.
- Connectivity probes are skipped while service pause is active.
- Rsync command generation is capability-aware; unsupported flags are no longer forced.

### Action for existing users
1. Back up existing `profiles/jobs.json`.
2. Start app and validate each job in **Dry Run** mode once.
3. If you depend on custom `extra_args`, ensure they do not use blocked safety-overriding flags.
4. Verify CI prerequisites if contributing:
   - Python tooling (`ruff`, `mypy`)
   - Node tooling (`eslint`)

### Compatibility
- `openrsync` and older rsync builds are supported with a reduced flag set.
- Some advanced progress details may be unavailable on limited rsync implementations.
