# Contributing

Thanks for contributing to Rsync Web App.

## Development Setup

1. Clone the repository.
2. Install frontend tooling and build assets:

```bash
npm install
npm run build:frontend
```

3. Start the app:

```bash
./bin/start-ui.sh
```

4. Open:

```bash
http://rsync.localhost:<port>
```

Use the URL printed by `./bin/start-ui.sh` (`8787` by default, auto-fallback if occupied).

Optional live frontend dev (with API proxy to `127.0.0.1:8787`):

```bash
npm run dev:frontend
```

## Guidelines

- Keep changes small and focused.
- Preserve one-way safety guarantees (`remote -> local`).
- Avoid adding shell injection paths from UI inputs.
- Prefer explicit validation for any new job fields.
- Update docs when behavior changes.

## Verification Before PR

- Backend compiles:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile app/backend/server.py
```

- Python quality checks:

```bash
./bin/python-quality.sh
```

This script uses a repo-local virtualenv (`.venv-quality`) so you do not need global `ruff`/`mypy` installs.

- Frontend lint:

```bash
npm install
npm run lint:frontend
npm run build:frontend
```

- Docs build:

```bash
python3 -m venv .venv-docs
source .venv-docs/bin/activate
pip install -r requirements-docs.txt
mkdocs build --strict
```

- Shell scripts parse:

```bash
bash -n bin/*.sh
```

- Manual smoke test:
  - create a dry-run job
  - run `Test Conn`
  - run `Preview Deletes`
  - start/pause/resume/cancel

## Pull Requests

- Include a clear summary of user-facing changes.
- Call out security implications.
- Include screenshots for UI updates.
- Use issue and PR templates for consistency.

## Maintainer Defaults

- Keep `main` protected (required checks, linear history, no force-push).
- Keep `enforce_admins` disabled so solo maintainers can ship urgent hotfixes.
- Label beginner-friendly tasks with `good first issue`.
