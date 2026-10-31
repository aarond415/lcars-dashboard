import AppKit
import WebKit

// Main window hosting the dashboard in a WKWebView.
// Dashboard files are bundled in Contents/Resources/web and served by LocalServer
// on http://127.0.0.1 (see LocalServer.swift for why).
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, NSMenuItemValidation {

    private var window: NSWindow!
    private var webView: WKWebView!
    private let gmail = GmailAuth()
    private let bridge = AppBridge()
    private let server = LocalServer(root: Bundle.main.resourceURL!.appendingPathComponent("web"))

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()

        let config = WKWebViewConfiguration()

        // Let the dashboard know it is running inside the app, and capture
        // errors so the self-test can report them.
        let bootstrap = """
        window.LCARS_NATIVE = true;
        window.__lcarsErrors = [];
        window.addEventListener('error', e => window.__lcarsErrors.push(String(e.message)));
        window.addEventListener('unhandledrejection', e => window.__lcarsErrors.push(String(e.reason)));
        """
        config.userContentController.addUserScript(
            WKUserScript(source: bootstrap, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.add(gmail, name: GmailAuth.messageName)
        config.userContentController.add(bridge, name: AppBridge.messageName)
        config.preferences.isElementFullscreenEnabled = true   // full-screen ISS video

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.underPageBackgroundColor = .black
        if #available(macOS 13.3, *) { webView.isInspectable = true }
        gmail.webView = webView

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false)
        window.title = "LCARS"
        window.titlebarAppearsTransparent = true
        window.backgroundColor = .black
        window.appearance = NSAppearance(named: .darkAqua)
        window.minSize = NSSize(width: 960, height: 640)
        window.contentView = webView
        bridge.window = window
        window.center()
        window.setFrameAutosaveName("LCARSMainWindow")
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        server.start { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let baseURL):
                self.webView.load(URLRequest(url: baseURL.appendingPathComponent("index.html")))
                if ProcessInfo.processInfo.environment["LCARS_SELFTEST"] != nil {
                    SelfTest.run(on: self.webView)
                }
            case .failure(let error):
                let alert = NSAlert(error: error)
                alert.messageText = "LCARS could not start its local web server."
                alert.runModal()
                NSApp.terminate(nil)
            }
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    // ── NAVIGATION ──

    // Dashboard pages stay in the app; links to the web open in the default browser.
    func webView(_ webView: WKWebView,
                 decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url,
              action.targetFrame?.isMainFrame ?? true,
              !(url.host == "127.0.0.1" && url.port == Int(server.port)),
              url.scheme != "about" else {
            decisionHandler(.allow)
            return
        }
        NSWorkspace.shared.open(url)
        decisionHandler(.cancel)
    }

    // window.open / target="_blank"
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    // ── MENU ──

    @objc private func reloadDashboard(_ sender: Any?) {
        webView.reload()
    }

    // The dashboard owns display-mode state (js/display.js); it calls back
    // through AppBridge to go full screen and keep the display awake.
    @objc private func toggleDisplayMode(_ sender: Any?) {
        webView.evaluateJavaScript("window.lcarsToggleDisplayMode && window.lcarsToggleDisplayMode()")
    }

    @objc private func toggleOpenAtLogin(_ sender: Any?) {
        bridge.toggleOpenAtLogin()
    }

    func validateMenuItem(_ item: NSMenuItem) -> Bool {
        if item.action == #selector(toggleOpenAtLogin(_:)) {
            item.state = bridge.opensAtLogin ? .on : .off
        }
        return true
    }

    private func buildMenu() {
        let main = NSMenu()

        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About LCARS", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Open at Login", action: #selector(toggleOpenAtLogin(_:)), keyEquivalent: "").target = self
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide LCARS", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = appMenu.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit LCARS", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        main.addItem(submenu: appMenu, title: "LCARS")

        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        main.addItem(submenu: editMenu, title: "Edit")

        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(withTitle: "Reload Dashboard", action: #selector(reloadDashboard(_:)), keyEquivalent: "r").target = self
        let display = viewMenu.addItem(withTitle: "Display Mode", action: #selector(toggleDisplayMode(_:)), keyEquivalent: "d")
        display.keyEquivalentModifierMask = [.command, .shift]
        display.target = self
        let fullScreen = viewMenu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fullScreen.keyEquivalentModifierMask = [.command, .control]
        main.addItem(submenu: viewMenu, title: "View")

        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        main.addItem(submenu: windowMenu, title: "Window")
        NSApp.windowsMenu = windowMenu

        NSApp.mainMenu = main
    }
}

private extension NSMenu {
    func addItem(submenu: NSMenu, title: String) {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.submenu = submenu
        addItem(item)
    }
}
