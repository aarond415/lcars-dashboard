// LCARS Native Bridge — talks to the macOS app when running inside it,
// and falls back to browser APIs (or does nothing) in a normal browser.
//
// JS → app:  webkit.messageHandlers.lcarsApp.postMessage({ action, ... })
//            action: "badge" | "notify" | "displayMode"
// (Handled in macos/Sources/LCARS/AppBridge.swift)

const LcarsNative = (() => {
  const handler = () => window.webkit?.messageHandlers?.lcarsApp;
  const isApp   = () => !!(window.LCARS_NATIVE && handler());

  return {
    isApp,

    // Dock badge (app only), e.g. unread email count. 0 clears it.
    badge(count) {
      if (isApp()) handler().postMessage({ action: 'badge', count: Math.max(0, count | 0) });
    },

    // System notification. In a browser, uses the Notification API if allowed.
    notify(title, body) {
      if (isApp()) {
        handler().postMessage({ action: 'notify', title, body });
      } else if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    },

    // Ask for browser notification permission — call from a click handler.
    requestPermission() {
      if (!isApp() && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    },

    // Display mode: the app goes full screen and keeps the display awake.
    displayMode(on) {
      if (isApp()) handler().postMessage({ action: 'displayMode', on: !!on });
    },
  };
})();
