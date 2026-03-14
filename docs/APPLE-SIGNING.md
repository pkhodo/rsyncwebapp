# Apple Signing and Notarization (Menu Bar App)

Use this only if you want to distribute the macOS menu bar helper beyond your own machine.

## Prerequisites

- Apple Developer account with Developer ID certificate
- Xcode command line tools (`xcrun`)
- Menu bar app already installed:

```bash
./bin/install-menubar.sh
```

## 1) Sign

```bash
./bin/sign-menubar.sh "Developer ID Application: YOUR NAME (TEAMID)"
```

This signs `~/Applications/RsyncWebAppMenuBar.app` with hardened runtime and verifies the signature.

## 2) Notarize and Staple

Create an app-specific keychain profile once:

```bash
xcrun notarytool store-credentials "rsyncwebapp-notary" \
  --apple-id "you@example.com" \
  --team-id "TEAMID" \
  --password "app-specific-password"
```

Then notarize:

```bash
./bin/notarize-menubar.sh "rsyncwebapp-notary"
```

The script zips the app, submits to Apple, waits for result, staples the ticket, and validates.

## Notes

- Signing/notarization is optional for local personal use.
- Do not commit private certificate details or credentials.
