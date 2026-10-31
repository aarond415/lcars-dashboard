import AppKit
import WebKit

// Run with LCARS_SELFTEST=1 to print a JSON health report of the loaded
// dashboard to stdout and quit. Used to check a build without clicking around.
enum SelfTest {

    static func run(on webView: WKWebView) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) {
            let js = """
            (() => {
              let storage = false;
              try { localStorage.setItem('__lcars_test', '1'); storage = localStorage.getItem('__lcars_test') === '1'; localStorage.removeItem('__lcars_test'); } catch {}
              const text = id => (document.getElementById(id)?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 160);
              return JSON.stringify({
                origin: location.origin,
                tabs: [...document.querySelectorAll('.sidebar-block')].map(b => b.textContent.trim()),
                localStorage: storage,
                weather: text('weather-widget'),
                email: text('email-widget'),
                stardate: text('stardate-widget'),
                errors: window.__lcarsErrors,
              }, null, 2);
            })()
            """
            webView.evaluateJavaScript(js) { result, error in
                print(result as? String ?? "SELFTEST ERROR: \(String(describing: error))")
                NSApp.terminate(nil)
            }
        }
    }
}
