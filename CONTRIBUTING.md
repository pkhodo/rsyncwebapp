# Contributing

Thanks for contributing to Rsync Web App.

## Development Setup

1. Clone the repository.
2. Start the app:

```bash
./bin/start-ui.sh
```

3. Open:

```bash
http://rsync.localhost:8787
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
ruff check app tests
mypy app/backend/server.py tests/test_backend.py
python3 -m unittest discover -s tests -v
```

- Frontend lint:

```bash
npm install
npm run lint:frontend
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
