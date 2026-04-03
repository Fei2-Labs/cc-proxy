import SwiftUI
import UserNotifications
import Foundation

let DEFAULT_SERVER = "https://cc.swedexpress.store"

// MARK: - Status Monitor

class StatusMonitor: NSObject, ObservableObject, URLSessionDelegate, UNUserNotificationCenterDelegate {
    @Published var status: String = "idle"
    @Published var message: String = ""
    @Published var oauthStatus: String = "checking..."
    @Published var iconName: String = "shield.lefthalf.filled.badge.checkmark"

    private var timer: Timer?
    private var lastNotifiedExpired = false

    private lazy var session: URLSession = {
        URLSession(configuration: .default, delegate: self, delegateQueue: nil)
    }()

    func urlSession(_ s: URLSession, didReceive c: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        if let t = c.protectionSpace.serverTrust { completionHandler(.useCredential, URLCredential(trust: t)) }
        else { completionHandler(.performDefaultHandling, nil) }
    }

    var serverURL: String { UserDefaults.standard.string(forKey: "serverURL") ?? DEFAULT_SERVER }
    var apiKey: String { UserDefaults.standard.string(forKey: "apiKey") ?? "" }

    func startPolling() {
        guard timer == nil else { return }
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
        checkStatus()
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            self?.checkStatus()
        }
    }

    // Show notification even when app is in foreground
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
    }

    func checkStatus() {
        guard let url = URL(string: "\(serverURL)/_health") else { return }
        session.dataTask(with: url) { data, _, _ in
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let oauth = json["oauth"] as? String else {
                DispatchQueue.main.async {
                    self.oauthStatus = "⚠️ Server unreachable"
                    self.iconName = "shield.lefthalf.filled.slash"
                }
                return
            }
            DispatchQueue.main.async {
                if oauth == "valid" {
                    self.oauthStatus = "✅ Connected"
                    self.iconName = "shield.lefthalf.filled.badge.checkmark"
                    self.lastNotifiedExpired = false
                } else {
                    self.oauthStatus = "⚠️ Token expired"
                    self.iconName = "shield.lefthalf.filled.slash"
                    if !self.lastNotifiedExpired {
                        self.lastNotifiedExpired = true
                        self.sendNotification()
                    }
                }
            }
        }.resume()
    }

    private func sendNotification() {
        let content = UNMutableNotificationContent()
        content.title = "CC Proxy"
        content.body = "OAuth token expired. Open CC Proxy and sync a new token."
        content.sound = .default
        let req = UNNotificationRequest(identifier: "token-expired", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(req)
    }

    func syncToken() {
        status = "working"
        message = "Reading Keychain..."

        DispatchQueue.global().async {
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/usr/bin/security")
            task.arguments = ["find-generic-password", "-a", NSUserName(), "-s", "Claude Code-credentials", "-w"]
            let pipe = Pipe()
            task.standardOutput = pipe
            task.standardError = FileHandle.nullDevice

            var json = ""
            do { try task.run(); task.waitUntilExit()
                json = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
                    .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            } catch {}

            if json.isEmpty {
                json = (try? String(contentsOfFile: NSHomeDirectory() + "/.claude/.credentials.json", encoding: .utf8)) ?? ""
            }

            guard !json.isEmpty,
                  let data = json.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let oauth = obj["claudeAiOauth"] as? [String: Any],
                  let token = oauth["refreshToken"] as? String else {
                DispatchQueue.main.async { self.status = "error"; self.message = "No credentials. Run 'claude' first." }
                return
            }

            DispatchQueue.main.async { self.message = "Uploading..." }

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

                var req = URLRequest(url: URL(string: "\(self.serverURL)/api/oauth/upload")!)
                req.httpMethod = "POST"
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                req.httpBody = try! JSONSerialization.data(withJSONObject: ["token": token, "code": code])

                self.session.dataTask(with: req) { data, _, _ in
                    let result = (try? JSONSerialization.jsonObject(with: data ?? Data()) as? [String: Any]) ?? [:]
                    let ok = result["ok"] as? Bool ?? false
                    DispatchQueue.main.async {
                        if ok {
                            self.status = "success"; self.message = "Token synced!"
                            self.checkStatus()
                        } else {
                            self.status = "error"; self.message = "Upload failed. Run 'claude' to refresh login."
                        }
                    }
                }.resume()
            }.resume()
        }
    }
}

// MARK: - View

struct MainView: View {
    @EnvironmentObject var monitor: StatusMonitor
    @State var showSettings = false
    @State var serverURL = UserDefaults.standard.string(forKey: "serverURL") ?? DEFAULT_SERVER
    @State var apiKey = UserDefaults.standard.string(forKey: "apiKey") ?? ""

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
                    TextField("URL", text: $serverURL).textFieldStyle(.roundedBorder).font(.caption)
                    Text("Key").font(.caption).foregroundColor(.secondary)
                    SecureField("ADMIN_PASSWORD", text: $apiKey).textFieldStyle(.roundedBorder).font(.caption)
                    Button("Save") {
                        UserDefaults.standard.set(serverURL, forKey: "serverURL")
                        UserDefaults.standard.set(apiKey, forKey: "apiKey")
                        showSettings = false
                        monitor.checkStatus()
                    }.buttonStyle(.borderedProminent).font(.caption)
                    .disabled(serverURL.isEmpty || apiKey.isEmpty)
                }
            }

            Divider()

            Text(monitor.oauthStatus).font(.caption).foregroundColor(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

            if !monitor.message.isEmpty {
                Text(monitor.message).font(.caption)
                    .foregroundColor(monitor.status == "error" ? .red : .secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button(action: { monitor.syncToken() }) {
                Label("Sync Token", systemImage: "arrow.triangle.2.circlepath")
                    .frame(maxWidth: .infinity)
            }.buttonStyle(.borderedProminent)
            .disabled(monitor.status == "working")

            Button("Quit") { NSApp.terminate(nil) }
                .buttonStyle(.plain).foregroundColor(.secondary).font(.caption)
        }
        .padding(16).frame(width: 280)
        .onAppear { monitor.startPolling() }
    }
}

// MARK: - App

@main
struct CCProxyApp: App {
    @StateObject var monitor = StatusMonitor()

    var body: some Scene {
        MenuBarExtra("CC Proxy", systemImage: monitor.iconName) {
            MainView().environmentObject(monitor)
        }
        .menuBarExtraStyle(.window)
        .onChange(of: monitor.iconName) { _, _ in }
    }

    init() {}
}
