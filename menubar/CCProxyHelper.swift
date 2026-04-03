#!/usr/bin/env swift
// CC Proxy — macOS menubar helper
// Handles OAuth login locally and uploads the token to the proxy server.
// Build: swiftc -o CCProxyHelper menubar/CCProxyHelper.swift -framework Cocoa
// Run:   ./CCProxyHelper --server https://cc.swedexpress.store

import Cocoa
import Foundation
import CryptoKit

// MARK: - Config

let CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
let AUTHORIZE_URL = "https://platform.claude.com/v1/oauth/authorize"
let TOKEN_URL = "https://platform.claude.com/v1/oauth/token"
let SCOPES = "user:inference user:profile user:sessions:claude_code user:mcp_servers user:file_upload"
let LISTEN_PORT: UInt16 = 18943

var serverURL = "https://cc.swedexpress.store"
var apiKey = ""

// Parse args
for (i, arg) in CommandLine.arguments.enumerated() {
    if arg == "--server", i + 1 < CommandLine.arguments.count {
        serverURL = CommandLine.arguments[i + 1]
    }
    if arg == "--key", i + 1 < CommandLine.arguments.count {
        apiKey = CommandLine.arguments[i + 1]
    }
}

// MARK: - PKCE

func randomBase64URL(_ count: Int) -> String {
    var bytes = [UInt8](repeating: 0, count: count)
    _ = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
    return Data(bytes).base64EncodedString()
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
}

func sha256Base64URL(_ input: String) -> String {
    let hash = SHA256.hash(data: Data(input.utf8))
    return Data(hash).base64EncodedString()
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
}

// MARK: - App Delegate

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var codeVerifier = ""

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "⚡"
        
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Connect to Anthropic", action: #selector(startOAuth), keyEquivalent: "c"))
        menu.addItem(NSMenuItem(title: "Extract from Keychain", action: #selector(extractAndUpload), keyEquivalent: "e"))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q"))
        statusItem.menu = menu
    }

    @objc func startOAuth() {
        codeVerifier = randomBase64URL(32)
        let codeChallenge = sha256Base64URL(codeVerifier)
        let redirectURI = "http://127.0.0.1:\(LISTEN_PORT)/callback"
        let state = randomBase64URL(16)

        var components = URLComponents(string: AUTHORIZE_URL)!
        components.queryItems = [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: CLIENT_ID),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "scope", value: SCOPES),
            URLQueryItem(name: "code_challenge", value: codeChallenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
        ]

        startLocalServer(redirectURI: redirectURI)
        NSWorkspace.shared.open(components.url!)
        setStatus("⏳")
    }

    @objc func extractAndUpload() {
        setStatus("⏳")
        DispatchQueue.global().async {
            // Try Keychain
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/usr/bin/security")
            task.arguments = ["find-generic-password", "-a", NSUserName(), "-s", "Claude Code-credentials", "-w"]
            let pipe = Pipe()
            task.standardOutput = pipe
            task.standardError = FileHandle.nullDevice
            
            var json = ""
            do {
                try task.run()
                task.waitUntilExit()
                json = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            } catch {}

            // Fallback to file
            if json.isEmpty {
                let path = NSHomeDirectory() + "/.claude/.credentials.json"
                json = (try? String(contentsOfFile: path, encoding: .utf8)) ?? ""
            }

            guard !json.isEmpty,
                  let data = json.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let oauth = obj["claudeAiOauth"] as? [String: Any],
                  let refreshToken = oauth["refreshToken"] as? String else {
                DispatchQueue.main.async { self.showAlert("No credentials found. Run 'claude' first."); self.setStatus("⚡") }
                return
            }

            self.uploadToken(refreshToken)
        }
    }

    func startLocalServer(redirectURI: String) {
        DispatchQueue.global().async {
            let server = try! ServerSocket(port: LISTEN_PORT)
            let client = server.accept()
            let request = client.read()
            
            guard let code = self.extractCode(from: request) else {
                client.send(httpResponse("❌ No authorization code received."))
                client.close(); server.close()
                DispatchQueue.main.async { self.setStatus("⚡") }
                return
            }

            client.send(httpResponse("✅ Token received! You can close this tab."))
            client.close(); server.close()

            self.exchangeCode(code, redirectURI: redirectURI)
        }
    }

    func extractCode(from request: String) -> String? {
        guard let url = request.split(separator: " ").dropFirst().first,
              let components = URLComponents(string: String(url)),
              let code = components.queryItems?.first(where: { $0.name == "code" })?.value else { return nil }
        return code
    }

    func exchangeCode(_ code: String, redirectURI: String) {
        let body: [String: String] = [
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": codeVerifier,
            "client_id": CLIENT_ID,
            "redirect_uri": redirectURI,
        ]

        var req = URLRequest(url: URL(string: TOKEN_URL)!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try! JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: req) { data, _, error in
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let refreshToken = json["refresh_token"] as? String else {
                DispatchQueue.main.async { self.showAlert("OAuth token exchange failed."); self.setStatus("⚡") }
                return
            }
            self.uploadToken(refreshToken)
        }.resume()
    }

    func uploadToken(_ token: String) {
        var codeReq = URLRequest(url: URL(string: "\(serverURL)/api/oauth/generate-code")!)
        codeReq.httpMethod = "POST"
        codeReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !apiKey.isEmpty { codeReq.setValue(apiKey, forHTTPHeaderField: "x-api-key") }

        URLSession.shared.dataTask(with: codeReq) { data, _, _ in
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let code = json["code"] as? String else {
                DispatchQueue.main.async { self.showAlert("Failed to get upload code from server."); self.setStatus("⚡") }
                return
            }

            var req = URLRequest(url: URL(string: "\(serverURL)/api/oauth/upload")!)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try! JSONSerialization.data(withJSONObject: ["token": token, "code": code])

            URLSession.shared.dataTask(with: req) { data, _, _ in
                let ok = (try? JSONSerialization.jsonObject(with: data ?? Data()) as? [String: Any])?["ok"] as? Bool ?? false
                DispatchQueue.main.async {
                    if ok {
                        self.setStatus("✅")
                        self.showNotification("Token uploaded successfully")
                        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.setStatus("⚡") }
                    } else {
                        self.showAlert("Failed to upload token to server.")
                        self.setStatus("⚡")
                    }
                }
            }.resume()
        }.resume()
    }

    func setStatus(_ s: String) { statusItem.button?.title = s }

    func showAlert(_ msg: String) {
        let alert = NSAlert()
        alert.messageText = "CC Proxy"
        alert.informativeText = msg
        alert.runModal()
    }

    func showNotification(_ msg: String) {
        let alert = NSAlert()
        alert.messageText = "CC Proxy"
        alert.informativeText = msg
        alert.alertStyle = .informational
        alert.runModal()
    }

    @objc func quit() { NSApp.terminate(nil) }
}

// MARK: - Minimal TCP server for OAuth callback

class ServerSocket {
    private var fd: Int32
    init(port: UInt16) throws {
        fd = socket(AF_INET, SOCK_STREAM, 0)
        var opt: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &opt, socklen_t(MemoryLayout<Int32>.size))
        var addr = sockaddr_in(sin_len: UInt8(MemoryLayout<sockaddr_in>.size), sin_family: sa_family_t(AF_INET),
                               sin_port: port.bigEndian, sin_addr: in_addr(s_addr: INADDR_LOOPBACK.bigEndian), sin_zero: (0,0,0,0,0,0,0,0))
        _ = withUnsafePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
        listen(fd, 1)
    }
    func accept() -> ClientSocket {
        ClientSocket(fd: Darwin.accept(fd, nil, nil))
    }
    func close() { Darwin.close(fd) }
}

class ClientSocket {
    private var fd: Int32
    init(fd: Int32) { self.fd = fd }
    func read() -> String {
        var buf = [UInt8](repeating: 0, count: 4096)
        let n = Darwin.read(fd, &buf, buf.count)
        return n > 0 ? String(bytes: buf[..<n], encoding: .utf8) ?? "" : ""
    }
    func send(_ s: String) {
        _ = s.withCString { Darwin.write(fd, $0, strlen($0)) }
    }
    func close() { Darwin.close(fd) }
}

func httpResponse(_ body: String) -> String {
    let html = "<html><body style='font-family:system-ui;text-align:center;padding:60px'><h2>\(body)</h2></body></html>"
    return "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: \(html.utf8.count)\r\nConnection: close\r\n\r\n\(html)"
}

// MARK: - Main

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
