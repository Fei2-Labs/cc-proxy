import SwiftUI
import CryptoKit
import Foundation

// MARK: - Config

let DEFAULT_SERVER = "https://cc.swedexpress.store"

// MARK: - OAuth Manager

class OAuthManager: NSObject, ObservableObject, URLSessionDelegate {
    @Published var status: String = "idle"
    @Published var message: String = ""
    @Published var serverStatus: String = "checking..."

    private lazy var session: URLSession = {
        URLSession(configuration: .default, delegate: self, delegateQueue: nil)
    }()

    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        if let trust = challenge.protectionSpace.serverTrust {
            completionHandler(.useCredential, URLCredential(trust: trust))
        } else {
            completionHandler(.performDefaultHandling, nil)
        }
    }

    var serverURL: String {
        UserDefaults.standard.string(forKey: "serverURL") ?? DEFAULT_SERVER
    }
    var apiKey: String {
        UserDefaults.standard.string(forKey: "apiKey") ?? ""
    }

    func checkStatus() {
        guard let url = URL(string: "\(serverURL)/_health") else { return }
        session.dataTask(with: url) { data, _, _ in
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let oauth = json["oauth"] as? String else {
                DispatchQueue.main.async { self.serverStatus = "unreachable" }
                return
            }
            DispatchQueue.main.async {
                self.serverStatus = oauth == "valid" ? "✅ Connected" : "⚠️ Token expired"
            }
        }.resume()
    }

    func syncToken() {
        status = "working"
        message = "Reading Keychain..."

        DispatchQueue.global().async {
            // Extract token
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
                    self.message = "No credentials found. Run 'claude' first."
                }
                return
            }

            DispatchQueue.main.async { self.message = "Uploading..." }

            // Get upload code
            var codeReq = URLRequest(url: URL(string: "\(self.serverURL)/api/oauth/generate-code")!)
            codeReq.httpMethod = "POST"
            codeReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
            codeReq.setValue(self.apiKey, forHTTPHeaderField: "x-api-key")

            self.session.dataTask(with: codeReq) { data, resp, err in
                let sc = (resp as? HTTPURLResponse)?.statusCode ?? 0
                guard let data = data,
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let code = json["code"] as? String else {
                    let e = err?.localizedDescription ?? "status \(sc)"
                    DispatchQueue.main.async { self.status = "error"; self.message = "Server error: \(e)" }
                    return
                }

                // Upload token
                var req = URLRequest(url: URL(string: "\(self.serverURL)/api/oauth/upload")!)
                req.httpMethod = "POST"
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                req.httpBody = try! JSONSerialization.data(withJSONObject: ["token": token, "code": code])

                self.session.dataTask(with: req) { data, _, _ in
                    let result = (try? JSONSerialization.jsonObject(with: data ?? Data()) as? [String: Any]) ?? [:]
                    let ok = result["ok"] as? Bool ?? false
                    DispatchQueue.main.async {
                        if ok {
                            self.status = "success"
                            self.message = "Token synced!"
                            self.checkStatus()
                        } else {
                            self.status = "error"
                            self.message = "Upload failed. Run 'claude' to refresh login."
                        }
                    }
                }.resume()
            }.resume()
        }
    }
}

// MARK: - View

struct MainView: View {
    @StateObject var oauth = OAuthManager()
    @State var serverURL: String = UserDefaults.standard.string(forKey: "serverURL") ?? DEFAULT_SERVER
    @State var apiKey: String = UserDefaults.standard.string(forKey: "apiKey") ?? ""
    @State var showSettings = false

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Text("CC Proxy").font(.headline)
                Spacer()
                Button(action: { showSettings.toggle() }) {
                    Image(systemName: "gear").foregroundColor(.secondary)
                }.buttonStyle(.plain)
            }

            if showSettings {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Server").font(.caption).foregroundColor(.secondary)
                    TextField("URL", text: $serverURL)
                        .textFieldStyle(.roundedBorder).font(.caption)
                    Text("Key").font(.caption).foregroundColor(.secondary)
                    SecureField("ADMIN_PASSWORD", text: $apiKey)
                        .textFieldStyle(.roundedBorder).font(.caption)
                    Button("Save") {
                        UserDefaults.standard.set(serverURL, forKey: "serverURL")
                        UserDefaults.standard.set(apiKey, forKey: "apiKey")
                        showSettings = false
                        oauth.checkStatus()
                    }
                    .buttonStyle(.borderedProminent).font(.caption)
                    .disabled(serverURL.isEmpty || apiKey.isEmpty)
                }
            }

            Divider()

            Text(oauth.serverStatus)
                .font(.caption)
                .foregroundColor(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

            if !oauth.message.isEmpty {
                Text(oauth.message)
                    .font(.caption)
                    .foregroundColor(oauth.status == "error" ? .red : .secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button(action: { oauth.syncToken() }) {
                Label("Sync Token", systemImage: "arrow.triangle.2.circlepath")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(oauth.status == "working")

            Button("Quit") { NSApp.terminate(nil) }
                .buttonStyle(.plain)
                .foregroundColor(.secondary)
                .font(.caption)
        }
        .padding(16)
        .frame(width: 280)
        .onAppear { oauth.checkStatus() }
    }
}

// MARK: - App

@main
struct CCProxyApp: App {
    var body: some Scene {
        MenuBarExtra("CC Proxy", systemImage: "shield.lefthalf.filled.badge.checkmark") {
            MainView()
        }
        .menuBarExtraStyle(.window)
    }
}
