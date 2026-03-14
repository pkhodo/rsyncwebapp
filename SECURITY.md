# Security Policy

## Supported Versions

Security fixes are applied to the latest `main` branch.

## Reporting a Vulnerability

Please report security issues privately to the maintainers before public disclosure.

Include:

- impact summary
- reproduction steps
- affected files/endpoints
- suggested mitigation (if available)

## Security Design Notes

- App binds to `127.0.0.1` by default.
- Write APIs enforce localhost-origin checks.
- Directory listing is disabled.
- Security headers are applied (CSP, no-sniff, frame deny, no-referrer).
- UI inputs are validated before building rsync commands.
- One-way semantics are enforced in backend validation.
- Dangerous rsync flags that can violate one-way expectations are blocked.
- SSH is executed in batch mode with timeout controls.

See [docs/SECURITY-AUDIT.md](./docs/SECURITY-AUDIT.md) for latest audit notes.
