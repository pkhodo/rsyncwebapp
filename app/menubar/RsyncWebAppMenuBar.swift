import AppKit
import Foundation

final class MenuBarController: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private let defaultPort = 8787
    private let releasesURL = URL(string: "https://github.com/pkhodo/rsyncwebapp/releases/latest")!
    private let repoPath: String

    override init() {
        let configURL = Bundle.main.bundleURL.appendingPathComponent("Contents/Resources/repo-path.txt")
        let configuredPath = try? String(contentsOf: configURL, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        self.repoPath = (configuredPath?.isEmpty == false) ? configuredPath! : FileManager.default.homeDirectoryForCurrentUser.path
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        configureStatusButton()
        statusItem.menu = buildMenu()
    }

    private func configureStatusButton() {
        guard let button = statusItem.button else { return }
        button.title = "rsync.wa"
        button.font = NSFont.monospacedSystemFont(ofSize: NSFont.systemFontSize - 1, weight: .semibold)
        if let image = NSImage(systemSymbolName: "arrow.triangle.2.circlepath.circle", accessibilityDescription: "Rsync Web App") {
            image.isTemplate = true
            button.image = image
            button.imagePosition = .imageLeft
        }
    }

    private func makeMenuItem(
        title: String,
        action: Selector,
        keyEquivalent: String,
        symbol: String
    ) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: keyEquivalent)
        item.target = self
        if let image = NSImage(systemSymbolName: symbol, accessibilityDescription: title) {
            image.isTemplate = true
            item.image = image
        }
        return item
    }

    private func buildMenu() -> NSMenu {
        let menu = NSMenu()
        menu.addItem(makeMenuItem(title: "Open UI", action: #selector(openUI), keyEquivalent: "o", symbol: "safari"))
        menu.addItem(.separator())
        menu.addItem(makeMenuItem(title: "Start Service", action: #selector(startService), keyEquivalent: "s", symbol: "play.fill"))
        menu.addItem(makeMenuItem(title: "Stop Service", action: #selector(stopService), keyEquivalent: "x", symbol: "stop.fill"))
        menu.addItem(makeMenuItem(title: "Restart Service", action: #selector(restartService), keyEquivalent: "r", symbol: "arrow.clockwise"))
        menu.addItem(makeMenuItem(title: "Reinstall LaunchAgent", action: #selector(reinstallLaunchAgent), keyEquivalent: "l", symbol: "arrow.triangle.2.circlepath"))
        menu.addItem(makeMenuItem(title: "Status", action: #selector(showStatus), keyEquivalent: "i", symbol: "info.circle"))
        menu.addItem(.separator())
        menu.addItem(makeMenuItem(title: "Check Updates", action: #selector(checkUpdates), keyEquivalent: "u", symbol: "arrow.triangle.2.circlepath"))
        menu.addItem(makeMenuItem(title: "Update App", action: #selector(updateApp), keyEquivalent: "U", symbol: "square.and.arrow.down"))
        menu.addItem(.separator())
        menu.addItem(makeMenuItem(title: "Quit Menu App", action: #selector(quit), keyEquivalent: "q", symbol: "power"))
        return menu
    }

    private func runShell(_ command: String) -> (Int32, String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = ["-lc", command]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        do {
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: data, encoding: .utf8) ?? ""
            return (process.terminationStatus, output)
        } catch {
            return (-1, "Failed to execute command: \(error)")
        }
    }

    private func showAlert(_ title: String, _ text: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = text
        alert.alertStyle = .informational
        alert.runModal()
    }

    private func showUpdateAlert(title: String, text: String, releaseURL: URL?) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = text
        alert.alertStyle = .informational
        if releaseURL != nil {
            alert.addButton(withTitle: "Open Release Page")
            alert.addButton(withTitle: "Close")
            let response = alert.runModal()
            if response == .alertFirstButtonReturn, let url = releaseURL {
                NSWorkspace.shared.open(url)
            }
        } else {
            alert.runModal()
        }
    }

    private func activePort() -> Int {
        let portFile = URL(fileURLWithPath: repoPath).appendingPathComponent("state/ui-port")
        guard
            let raw = try? String(contentsOf: portFile, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines),
            let value = Int(raw),
            (1...65535).contains(value)
        else {
            return defaultPort
        }
        return value
    }

    private func uiURL() -> URL {
        return URL(string: "http://rsync.localhost:\(activePort())")!
    }

    @objc private func openUI() {
        _ = runShell("cd \(repoPath.escapedShell) && ./bin/start-ui.sh")
        NSWorkspace.shared.open(uiURL())
    }

    @objc private func startService() {
        let result = runShell("cd \(repoPath.escapedShell) && ./bin/start-ui.sh")
        showAlert("Start Service", result.1.isEmpty ? "Exit code: \(result.0)" : result.1)
    }

    @objc private func stopService() {
        let result = runShell("cd \(repoPath.escapedShell) && ./bin/stop-ui.sh")
        showAlert("Stop Service", result.1.isEmpty ? "Exit code: \(result.0)" : result.1)
    }

    @objc private func restartService() {
        let command = "cd \(repoPath.escapedShell) && ./bin/stop-ui.sh && ./bin/start-ui.sh"
        let result = runShell(command)
        showAlert("Restart Service", result.1.isEmpty ? "Exit code: \(result.0)" : result.1)
    }

    @objc private func reinstallLaunchAgent() {
        let result = runShell("cd \(repoPath.escapedShell) && ./bin/install-launchagent.sh")
        showAlert("Reinstall LaunchAgent", result.1.isEmpty ? "Exit code: \(result.0)" : result.1)
    }

    @objc private func showStatus() {
        let result = runShell("cd \(repoPath.escapedShell) && ./bin/status-ui.sh")
        showAlert("Rsync Web App Status", result.1.isEmpty ? "Exit code: \(result.0)" : result.1)
    }

    @objc private func checkUpdates() {
        let port = activePort()
        let result = runShell("curl -fsS --max-time 8 http://127.0.0.1:\(port)/api/app/update-check?force=1")
        if result.0 != 0 || result.1.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            showUpdateAlert(
                title: "Check Updates",
                text: "Could not reach the local service on port \(port).\nStart the service first, then retry.",
                releaseURL: releasesURL
            )
            return
        }

        guard
            let data = result.1.data(using: .utf8),
            let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let update = payload["update"] as? [String: Any]
        else {
            showUpdateAlert(
                title: "Check Updates",
                text: "Received an invalid update response from the local service.",
                releaseURL: releasesURL
            )
            return
        }

        let ok = (update["ok"] as? Bool) ?? false
        if !ok {
            let error = (update["error"] as? String) ?? "Unknown error"
            showUpdateAlert(
                title: "Check Updates",
                text: "Update check failed.\n\(error)",
                releaseURL: releasesURL
            )
            return
        }

        let channel = (update["channel"] as? String) ?? "unknown"
        let updateAvailable = (update["update_available"] as? Bool) ?? false

        if channel == "git" || channel == "github_commit" {
            let branch = (update["target_branch"] as? String) ?? ((update["branch"] as? String) ?? "main")
            let localCommit = (update["local_commit"] as? String) ?? "unknown"
            let remoteCommit = (update["remote_commit"] as? String) ?? "unknown"
            let currentBranch = (update["current_branch"] as? String) ?? ""
            let sourceLabel = channel == "git" ? "Git" : "GitHub API"
            let branchDetail = currentBranch.isEmpty ? branch : "\(branch) (current: \(currentBranch))"
            if updateAvailable {
                showUpdateAlert(
                    title: "Update Available",
                    text: "\(sourceLabel) commit channel (\(branchDetail)) has a newer commit.\nLocal: \(localCommit)\nRemote: \(remoteCommit)\nUse 'Update App' to pull latest changes.",
                    releaseURL: nil
                )
            } else {
                showUpdateAlert(
                    title: "Up To Date",
                    text: "\(sourceLabel) commit channel (\(branchDetail)) is up to date.\nCommit: \(localCommit)",
                    releaseURL: nil
                )
            }
            return
        }

        if channel == "release" {
            let latestVersion = (update["latest_version"] as? String) ?? ""
            let releaseURLText = (update["release_url"] as? String) ?? ""
            let releaseLink = URL(string: releaseURLText.isEmpty ? releasesURL.absoluteString : releaseURLText)
            if updateAvailable {
                let versionLabel = latestVersion.isEmpty ? "A new release is available." : "Version \(latestVersion) is available."
                showUpdateAlert(
                    title: "Update Available",
                    text: "\(versionLabel)\nOpen the release page to download it.",
                    releaseURL: releaseLink
                )
            } else {
                let versionLabel = latestVersion.isEmpty ? "No newer release detected." : "Latest release: \(latestVersion)"
                showUpdateAlert(
                    title: "Up To Date",
                    text: versionLabel,
                    releaseURL: nil
                )
            }
            return
        }

        showUpdateAlert(
            title: "Check Updates",
            text: "Update check completed, but channel information was not recognized.",
            releaseURL: releasesURL
        )
    }

    @objc private func updateApp() {
        let result = runShell("cd \(repoPath.escapedShell) && ./bin/update-app.sh")
        showAlert("Update App", result.1.isEmpty ? "Exit code: \(result.0)" : result.1)
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }
}

private extension String {
    var escapedShell: String {
        return self.replacingOccurrences(of: "'", with: "'\\''")
            .withSingleQuotes
    }

    var withSingleQuotes: String {
        return "'" + self + "'"
    }
}

let app = NSApplication.shared
let delegate = MenuBarController()
app.delegate = delegate
app.run()
