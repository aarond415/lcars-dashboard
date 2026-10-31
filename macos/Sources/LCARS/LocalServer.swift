import Foundation
import Network

// Serves the bundled dashboard files over http://127.0.0.1:<port>/<token>/...
//
// A real http origin (rather than a custom scheme) is needed because YouTube
// refuses to play embedded videos without a web Referer (error 153), and it
// keeps localStorage and cross-origin fetches behaving as in a browser.
// The server only listens on loopback, and every path must start with a random
// per-launch token, so other local software or web pages can't read config.js.
final class LocalServer {

    // Fixed so the page origin (and with it localStorage) stays the same across launches.
    static let preferredPort: UInt16 = 47823

    let token = UUID().uuidString.lowercased()
    private(set) var port: UInt16 = 0
    private let root: URL
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "lcars.localserver")

    init(root: URL) {
        self.root = root.standardizedFileURL
    }

    var baseURL: URL {
        URL(string: "http://127.0.0.1:\(port)/\(token)/")!
    }

    /// Starts listening, trying a few ports, and calls `ready` on the main queue.
    func start(ready: @escaping (Result<URL, Error>) -> Void, attempt: UInt16 = 0) {
        let candidate = Self.preferredPort + attempt
        let params = NWParameters.tcp
        params.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: NWEndpoint.Port(rawValue: candidate)!)
        params.allowLocalEndpointReuse = true

        do {
            let listener = try NWListener(using: params)
            listener.newConnectionHandler = { [weak self] in self?.handle($0) }
            listener.stateUpdateHandler = { [weak self] state in
                guard let self else { return }
                switch state {
                case .ready:
                    self.port = candidate
                    DispatchQueue.main.async { ready(.success(self.baseURL)) }
                case .failed(let error):
                    listener.cancel()
                    if attempt < 10 {
                        self.start(ready: ready, attempt: attempt + 1)
                    } else {
                        DispatchQueue.main.async { ready(.failure(error)) }
                    }
                default:
                    break
                }
            }
            self.listener = listener
            listener.start(queue: queue)
        } catch {
            if attempt < 10 { start(ready: ready, attempt: attempt + 1) } else { ready(.failure(error)) }
        }
    }

    // ── REQUESTS ──

    private func handle(_ connection: NWConnection) {
        connection.start(queue: queue)
        receiveRequest(on: connection, buffer: Data())
    }

    private func receiveRequest(on connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            var buffer = buffer
            if let data { buffer.append(data) }

            // Wait for the end of the request headers
            if buffer.range(of: Data("\r\n\r\n".utf8)) == nil {
                if isComplete || error != nil || buffer.count > 65_536 {
                    connection.cancel()
                } else {
                    self.receiveRequest(on: connection, buffer: buffer)
                }
                return
            }
            self.respond(to: buffer, on: connection)
        }
    }

    private func respond(to request: Data, on connection: NWConnection) {
        let requestLine = String(decoding: request.prefix(while: { $0 != 13 }), as: UTF8.self)
        let parts = requestLine.split(separator: " ")
        guard parts.count >= 2, parts[0] == "GET" || parts[0] == "HEAD" else {
            send(status: "405 Method Not Allowed", on: connection)
            return
        }

        var path = String(parts[1].split(separator: "?", maxSplits: 1).first ?? "")
        path = path.removingPercentEncoding ?? path
        let prefix = "/\(token)/"
        guard path.hasPrefix(prefix) else {
            send(status: "404 Not Found", on: connection)
            return
        }
        var relative = String(path.dropFirst(prefix.count))
        if relative.isEmpty { relative = "index.html" }

        let file = root.appendingPathComponent(relative).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/"), let body = try? Data(contentsOf: file) else {
            send(status: "404 Not Found", on: connection)
            return
        }

        let headers = [
            "HTTP/1.1 200 OK",
            "Content-Type: \(Self.mimeType(for: file.pathExtension))",
            "Content-Length: \(body.count)",
            "Cache-Control: no-cache",
            "Connection: close",
            "", "",
        ].joined(separator: "\r\n")
        var response = Data(headers.utf8)
        if parts[0] == "GET" { response.append(body) }
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }

    private func send(status: String, on connection: NWConnection) {
        let response = "HTTP/1.1 \(status)\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        connection.send(content: Data(response.utf8), completion: .contentProcessed { _ in connection.cancel() })
    }

    private static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js":   return "text/javascript; charset=utf-8"
        case "css":  return "text/css; charset=utf-8"
        case "json": return "application/json"
        case "svg":  return "image/svg+xml"
        case "png":  return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "woff2": return "font/woff2"
        default:     return "application/octet-stream"
        }
    }
}
