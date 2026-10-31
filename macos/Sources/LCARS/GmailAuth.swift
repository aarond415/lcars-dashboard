import AppKit
import AuthenticationServices
import CryptoKit
import WebKit

// Native Google sign-in for the COMM tab.
//
// Google blocks its sign-in pop-up inside embedded web views, so the app signs
// in through the system authentication sheet instead (OAuth code flow + PKCE,
// using an "iOS" type OAuth client ID, which has no client secret). The refresh
// token is kept in the Keychain so later launches sign in silently.
//
// JS → native:  webkit.messageHandlers.lcarsGmail.postMessage({ action, clientId, scopes })
//               action: "signIn" (interactive) | "refresh" (silent) | "signOut"
// native → JS:  window.lcarsGmailNative.onResult({ access_token, expires_in } | { error })
final class GmailAuth: NSObject, WKScriptMessageHandler, ASWebAuthenticationPresentationContextProviding {

    static let messageName = "lcarsGmail"

    weak var webView: WKWebView?
    private var session: ASWebAuthenticationSession?

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let action = body["action"] as? String,
              let clientId = body["clientId"] as? String, !clientId.isEmpty else { return }
        let scopes = body["scopes"] as? String ?? ""

        switch action {
        case "signIn":  signIn(clientId: clientId, scopes: scopes)
        case "refresh": refresh(clientId: clientId)
        case "signOut": Keychain.delete(account: clientId)
        default: break
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        webView?.window ?? NSApp.keyWindow ?? NSWindow()
    }

    // ── INTERACTIVE SIGN-IN ──

    private func signIn(clientId: String, scopes: String) {
        // Google's redirect for installed apps is the reversed client ID.
        let callbackScheme = clientId.split(separator: ".").reversed().joined(separator: ".")
        let redirectURI = "\(callbackScheme):/oauth2redirect"
        let verifier = Self.randomURLSafeString()
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncoded()
        let state = Self.randomURLSafeString()

        var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        components.queryItems = [
            .init(name: "client_id", value: clientId),
            .init(name: "redirect_uri", value: redirectURI),
            .init(name: "response_type", value: "code"),
            .init(name: "scope", value: scopes),
            .init(name: "code_challenge", value: challenge),
            .init(name: "code_challenge_method", value: "S256"),
            .init(name: "state", value: state),
        ]

        let session = ASWebAuthenticationSession(url: components.url!, callbackURLScheme: callbackScheme) { [weak self] callbackURL, error in
            guard let self else { return }
            self.session = nil
            if let error {
                let cancelled = (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin
                self.send(error: cancelled ? "cancelled" : error.localizedDescription)
                return
            }
            let items = URLComponents(url: callbackURL!, resolvingAgainstBaseURL: false)?.queryItems ?? []
            guard items.first(where: { $0.name == "state" })?.value == state,
                  let code = items.first(where: { $0.name == "code" })?.value else {
                self.send(error: items.first(where: { $0.name == "error" })?.value ?? "invalid_callback")
                return
            }
            self.requestToken(clientId: clientId, params: [
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirectURI,
                "code_verifier": verifier,
            ])
        }
        session.presentationContextProvider = self
        self.session = session
        session.start()
    }

    // ── SILENT REFRESH ──

    private func refresh(clientId: String) {
        guard let refreshToken = Keychain.read(account: clientId) else {
            send(error: "needs_auth")
            return
        }
        requestToken(clientId: clientId, params: [
            "grant_type": "refresh_token",
            "refresh_token": refreshToken,
        ])
    }

    // ── TOKEN ENDPOINT ──

    private func requestToken(clientId: String, params: [String: String]) {
        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var form = URLComponents()
        form.queryItems = (params.merging(["client_id": clientId]) { a, _ in a })
            .map { URLQueryItem(name: $0.key, value: $0.value) }
        request.httpBody = form.percentEncodedQuery?
            .replacingOccurrences(of: "+", with: "%2B")
            .data(using: .utf8)

        URLSession.shared.dataTask(with: request) { [weak self] data, _, error in
            DispatchQueue.main.async {
                guard let self else { return }
                guard let data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    self.send(error: error?.localizedDescription ?? "token_request_failed")
                    return
                }
                guard let accessToken = json["access_token"] as? String else {
                    let err = json["error"] as? String ?? "token_request_failed"
                    if err == "invalid_grant" { Keychain.delete(account: clientId) }
                    self.send(error: err == "invalid_grant" ? "needs_auth" : err)
                    return
                }
                if let refreshToken = json["refresh_token"] as? String {
                    Keychain.save(refreshToken, account: clientId)
                }
                self.send(["access_token": accessToken, "expires_in": json["expires_in"] as? Int ?? 3600])
            }
        }.resume()
    }

    // ── BRIDGE ──

    private func send(error: String) {
        send(["error": error])
    }

    private func send(_ payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.lcarsGmailNative && window.lcarsGmailNative.onResult(\(json))")
    }

    private static func randomURLSafeString() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).base64URLEncoded()
    }
}

private extension Data {
    func base64URLEncoded() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
