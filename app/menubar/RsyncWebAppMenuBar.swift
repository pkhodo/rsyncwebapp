import AppKit
import Foundation

final class MenuBarController: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private let uiURL = URL(string: "http://rsync.localhost:8787")!
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

    @objc private func openUI() {
        _ = runShell("cd \(repoPath.escapedShell) && ./bin/start-ui.sh")
        NSWorkspace.shared.open(uiURL)
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

    @objc private func showStatus() {
        let result = runShell("cd \(repoPath.escapedShell) && ./bin/status-ui.sh")
        showAlert("Rsync Web App Status", result.1.isEmpty ? "Exit code: \(result.0)" : result.1)
    }

    @objc private func checkUpdates() {
        NSWorkspace.shared.open(releasesURL)
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
