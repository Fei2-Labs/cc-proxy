import SwiftUI
import CryptoKit
import Foundation

// MARK: - Constants

let CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
let AUTHORIZE_URL = "https://platform.claude.com/v1/oauth/authorize"
let TOKEN_URL = "https://platform.claude.com/v1/oauth/token"
let SCOPES = "user:inference user:profile user:sessions:claude_code user:mcp_servers user:file_upload"
let LISTEN_PORT: UInt16 = 18943

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

// MARK: - OAuth Manager

class OAuthManager: NSObject, ObservableObject, URLSessionDelegate {
    @Published var status: String = "idle" // idle, listening, exchanging, uploading, success, error
    @Published var message: String = ""
    @Published var serverStatus: String = "unknown" // unknown, connected, expired, not_configured

    var serverURL: String = ""
    var apiKey: String = ""
    private var codeVerifier = ""
    private var serverFD: Int32 = -1

    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = true
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    // Allow any HTTPS cert (for self-signed/custom domains)
    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        if let trust = challenge.protectionSpace.serverTrust {
            completionHandler(.useCredential, URLCredential(trust: trust))
        } else {
            completionHandler(.performDefaultHandling, nil)
        }
    }

    func checkServerStatus() {
        guard !serverURL.isEmpty else { return }
        guard let url = URL(string: "\(serverURL)/_health") else { return }
        self.session.dataTask(with: url) { data, _, _ in
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let oauth = json["oauth"] as? String else {
                DispatchQueue.main.async { self.serverStatus = "unknown" }
                return
            }
            DispatchQueue.main.async {
                self.serverStatus = oauth == "valid" ? "connected" : "expired"
            }
        }.resume()
    }

    func startOAuth() {
        codeVerifier = randomBase64URL(32)
        let codeChallenge = sha256Base64URL(codeVerifier)
        let redirectURI = "http://127.0.0.1:\(LISTEN_PORT)/callback"

        var components = URLComponents(string: AUTHORIZE_URL)!
        components.queryItems = [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: CLIENT_ID),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "scope", value: SCOPES),
            URLQueryItem(name: "code_challenge", value: codeChallenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: randomBase64URL(16)),
        ]

        status = "listening"
        message = "Waiting for browser login..."

        startLocalServer(redirectURI: redirectURI)
        NSWorkspace.shared.open(components.url!)
    }

    func extractFromKeychain() {
        status = "exchanging"
        message = "Reading Keychain..."

        DispatchQueue.global().async {
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
                json = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            } catch {}

            if json.isEmpty {
                let path = NSHomeDirectory() + "/.claude/.credentials.json"
                json = (try? String(contentsOfFile: path, encoding: .utf8)) ?? ""
            }

            guard !json.isEmpty,
                  let data = json.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let oauth = obj["claudeAiOauth"] as? [String: Any],
                  let token = oauth["refreshToken"] as? String else {
                DispatchQueue.main.async {
                    self.status = "error"
                    self.message = "No credentials found. Run 'claude' in Terminal first."
                }
                return
            }

            self.uploadToken(token)
        }
    }

    private func startLocalServer(redirectURI: String) {
        DispatchQueue.global().async {
            let fd = socket(AF_INET, SOCK_STREAM, 0)
            self.serverFD = fd
            var opt: Int32 = 1
            setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &opt, socklen_t(MemoryLayout<Int32>.size))

            var addr = sockaddr_in(
                sin_len: UInt8(MemoryLayout<sockaddr_in>.size),
                sin_family: sa_family_t(AF_INET),
                sin_port: LISTEN_PORT.bigEndian,
                sin_addr: in_addr(s_addr: UInt32(0x7f000001).bigEndian),
                sin_zero: (0,0,0,0,0,0,0,0)
            )
            _ = withUnsafePointer(to: &addr) {
                $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
                }
            }
            listen(fd, 1)

            let clientFD = Darwin.accept(fd, nil, nil)
            var buf = [UInt8](repeating: 0, count: 4096)
            let n = Darwin.read(clientFD, &buf, buf.count)
            let request = n > 0 ? String(bytes: buf[..<n], encoding: .utf8) ?? "" : ""

            // Extract code
            var code: String?
            if let urlStr = request.split(separator: " ").dropFirst().first,
               let comps = URLComponents(string: String(urlStr)) {
                code = comps.queryItems?.first(where: { $0.name == "code" })?.value
            }

            let html: String
            if code != nil {
                html = "<html><body style='font-family:system-ui;text-align:center;padding:60px;background:#111;color:#fff'><h2>✅ Success! You can close this tab.</h2></body></html>"
            } else {
                html = "<html><body style='font-family:system-ui;text-align:center;padding:60px;background:#111;color:#fff'><h2>❌ Login failed</h2></body></html>"
            }
            let resp = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: \(html.utf8.count)\r\nConnection: close\r\n\r\n\(html)"
            _ = resp.withCString { Darwin.write(clientFD, $0, strlen($0)) }
            Darwin.close(clientFD)
            Darwin.close(fd)

            guard let authCode = code else {
                DispatchQueue.main.async { self.status = "error"; self.message = "No authorization code received" }
                return
            }

            self.exchangeCode(authCode, redirectURI: redirectURI)
        }
    }

    private func exchangeCode(_ code: String, redirectURI: String) {
        DispatchQueue.main.async { self.status = "exchanging"; self.message = "Exchanging token..." }

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

        self.session.dataTask(with: req) { data, _, _ in
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let refreshToken = json["refresh_token"] as? String else {
                DispatchQueue.main.async { self.status = "error"; self.message = "Token exchange failed" }
                return
            }
            self.uploadToken(refreshToken)
        }.resume()
    }

    private func uploadToken(_ token: String) {
        DispatchQueue.main.async { self.status = "uploading"; self.message = "Uploading to server..." }

        var codeReq = URLRequest(url: URL(string: "\(serverURL)/api/oauth/generate-code")!)
        codeReq.httpMethod = "POST"
        codeReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !apiKey.isEmpty { codeReq.setValue(apiKey, forHTTPHeaderField: "x-api-key") }

        self.session.dataTask(with: codeReq) { data, resp, err in
            let statusCode = (resp as? HTTPURLResponse)?.statusCode ?? 0
            let body = String(data: data ?? Data(), encoding: .utf8) ?? "nil"
            let errMsg = err?.localizedDescription ?? "none"
            let urlStr = codeReq.url?.absoluteString ?? "nil"
            let hdrs = codeReq.allHTTPHeaderFields ?? [:]
            
            print("[CCProxy] generate-code request:")
            print("  URL: \(urlStr)")
            print("  Headers: \(hdrs)")
            print("  Status: \(statusCode)")
            print("  Error: \(errMsg)")
            print("  Body: \(body)")
            
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let uploadCode = json["code"] as? String else {
                DispatchQueue.main.async {
                    self.status = "error"
                    self.message = "Code failed (\(statusCode)) err: \(errMsg) url: \(urlStr)"
                }
                return
            }

            var req = URLRequest(url: URL(string: "\(self.serverURL)/api/oauth/upload")!)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try! JSONSerialization.data(withJSONObject: ["token": token, "code": uploadCode])

            self.session.dataTask(with: req) { data, _, _ in
                let result = (try? JSONSerialization.jsonObject(with: data ?? Data()) as? [String: Any]) ?? [:]
                let ok = result["ok"] as? Bool ?? false
                let reinit = result["reinit"] as? String ?? ""
                DispatchQueue.main.async {
                    if ok && reinit == "success" {
                        self.status = "success"
                        self.message = "Connected!"
                        self.serverStatus = "connected"
                    } else if ok {
                        self.status = "error"
                        self.message = "Token saved but refresh failed. Run 'claude' to login fresh."
                    } else {
                        self.status = "error"
                        self.message = "Upload failed"
                    }
                }
            }.resume()
        }.resume()
    }
}

// MARK: - Settings Storage

class AppSettings: ObservableObject {
    @Published var serverURL: String
    @Published var apiKey: String
    @Published var configured: Bool

    init() {
        let url = UserDefaults.standard.string(forKey: "serverURL") ?? "https://cc.swedexpress.store"
        let key = UserDefaults.standard.string(forKey: "apiKey") ?? ""
        serverURL = url
        apiKey = key
        configured = !url.isEmpty && !key.isEmpty
    }

    func save() {
        UserDefaults.standard.set(serverURL, forKey: "serverURL")
        UserDefaults.standard.set(apiKey, forKey: "apiKey")
        configured = !serverURL.isEmpty && !apiKey.isEmpty
    }

    func reset() {
        configured = false
    }
}

// MARK: - Views

struct SetupView: View {
    @EnvironmentObject var settings: AppSettings

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "shield.lefthalf.filled")
                .font(.system(size: 40))
                .foregroundColor(.accentColor)

            Text("CC Proxy").font(.title2).bold()

            VStack(alignment: .leading, spacing: 8) {
                Text("Server URL").font(.caption).foregroundColor(.secondary)
                TextField("https://cc.swedexpress.store", text: $settings.serverURL)
                    .textFieldStyle(.roundedBorder)

                Text("Server Key").font(.caption).foregroundColor(.secondary)
                SecureField("Same as ADMIN_PASSWORD on server", text: $settings.apiKey)
                    .textFieldStyle(.roundedBorder)
            }

            Button("Save") {
                settings.save()
            }
            .buttonStyle(.borderedProminent)
            .disabled(settings.serverURL.trimmingCharacters(in: .whitespaces).isEmpty || settings.apiKey.trimmingCharacters(in: .whitespaces).isEmpty)

            Button("Quit") { NSApp.terminate(nil) }
                .buttonStyle(.plain)
                .foregroundColor(.secondary)
                .font(.caption)
        }
        .padding(24)
        .frame(width: 320)
    }
}

struct MainView: View {
    @EnvironmentObject var settings: AppSettings
    @StateObject var oauth = OAuthManager()

    var body: some View {
        VStack(spacing: 16) {
            // Status
            HStack {
                Circle()
                    .fill(statusColor)
                    .frame(width: 10, height: 10)
                Text(statusLabel).font(.headline)
                Spacer()
                Button(action: { settings.reset() }) {
                    Image(systemName: "gear").foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
            }

            if !oauth.message.isEmpty {
                Text(oauth.message)
                    .font(.caption)
                    .foregroundColor(oauth.status == "error" ? .red : .secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Divider()

            // Actions
            Button(action: {
                oauth.serverURL = settings.serverURL
                oauth.apiKey = settings.apiKey
                oauth.extractFromKeychain()
            }) {
                Label("Sync Token", systemImage: "key")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(oauth.status == "exchanging" || oauth.status == "uploading")

            Divider()

            Button(action: { NSApp.terminate(nil) }) {
                Label("Quit", systemImage: "xmark.circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
        .padding(24)
        .frame(width: 320)
        .onAppear {
            oauth.serverURL = settings.serverURL
            oauth.apiKey = settings.apiKey
            oauth.checkServerStatus()
        }
    }

    var statusColor: Color {
        switch oauth.serverStatus {
        case "connected": return .green
        case "expired": return .yellow
        default: return .gray
        }
    }

    var statusLabel: String {
        switch oauth.serverStatus {
        case "connected": return "Connected"
        case "expired": return "Token Expired"
        default: return "Not Connected"
        }
    }
}

// MARK: - App

@main
struct CCProxyApp: App {
    @StateObject var settings = AppSettings()

    var body: some Scene {
        MenuBarExtra("CC Proxy", systemImage: "shield.lefthalf.filled.badge.checkmark") {
            if settings.configured {
                MainView().environmentObject(settings)
            } else {
                SetupView().environmentObject(settings)
            }
        }
        .menuBarExtraStyle(.window)
    }
}
