import AppKit
import ServiceManagement
import UserNotifications
import WebKit

// Native features the dashboard can ask for (see js/native.js):
//   { action: "badge", count }          → Dock icon badge (unread email)
//   { action: "notify", title, body }   → system notification
//   { action: "displayMode", on }       → full screen + keep the display awake
// Also owns the Open at Login setting.
final class AppBridge: NSObject, WKScriptMessageHandler, UNUserNotificationCenterDelegate {

    static let messageName = "lcarsApp"

    weak var window: NSWindow?
    private var awakeActivity: NSObjectProtocol?

    override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        switch action {
        case "badge":
            let count = body["count"] as? Int ?? 0
            NSApp.dockTile.badgeLabel = count > 0 ? String(count) : nil
        case "notify":
            notify(title: body["title"] as? String ?? "LCARS", body: body["body"] as? String ?? "")
        case "displayMode":
            setDisplayMode(body["on"] as? Bool ?? false)
        default:
            break
        }
    }

    // ── NOTIFICATIONS ──

    private func notify(title: String, body: String) {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return }
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            center.add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
        }
    }

    // Show banners even while LCARS is the frontmost app
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }

    // ── DISPLAY MODE ──

    private func setDisplayMode(_ on: Bool) {
        guard let window else { return }
        let isFullScreen = window.styleMask.contains(.fullScreen)
        if on != isFullScreen { window.toggleFullScreen(nil) }

        if on, awakeActivity == nil {
            awakeActivity = ProcessInfo.processInfo.beginActivity(
                options: [.idleDisplaySleepDisabled, .userInitiated],
                reason: "LCARS display mode")
        } else if !on, let activity = awakeActivity {
            ProcessInfo.processInfo.endActivity(activity)
            awakeActivity = nil
        }
    }

    // ── OPEN AT LOGIN ──

    var opensAtLogin: Bool {
        SMAppService.mainApp.status == .enabled
    }

    func toggleOpenAtLogin() {
        do {
            if opensAtLogin { try SMAppService.mainApp.unregister() } else { try SMAppService.mainApp.register() }
        } catch {
            let alert = NSAlert(error: error)
            alert.messageText = "Couldn't change Open at Login."
            alert.informativeText = "Make sure LCARS is in your Applications folder. \(error.localizedDescription)"
            alert.runModal()
        }
    }
}
