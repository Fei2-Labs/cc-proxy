#!/bin/bash
set -e
cd "$(dirname "$0")"

APP="CCProxy.app"
BINARY="$APP/Contents/MacOS/CCProxy"

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# Info.plist
cat > "$APP/Contents/Info.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>CC Proxy</string>
    <key>CFBundleIdentifier</key>
    <string>com.ccproxy.helper</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleExecutable</key>
    <string>CCProxy</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsLocalNetworking</key>
        <true/>
    </dict>
</dict>
</plist>
EOF

echo "Building CCProxy.app..."
swiftc -O \
    -o "$BINARY" \
    CCProxy/CCProxyApp.swift \
    -framework Cocoa \
    -framework SwiftUI \
    -parse-as-library

echo "✅ Built: macos-app/$APP"
echo ""
echo "Run:  open macos-app/$APP"
echo "Or:   cp -r macos-app/$APP /Applications/"
