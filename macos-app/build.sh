#!/bin/bash
set -e
cd "$(dirname "$0")"

APP="CCProxy.app"
BINARY="$APP/Contents/MacOS/CCProxy"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# Generate icon if needed
if [ ! -f CCProxy.icns ]; then
    python3 generate_icon.py
    mkdir -p icon.iconset
    for size in 16 32 64 128 256 512; do
        sips -z $size $size icon_1024.png --out icon.iconset/icon_${size}x${size}.png > /dev/null 2>&1
        double=$((size * 2))
        sips -z $double $double icon_1024.png --out icon.iconset/icon_${size}x${size}@2x.png > /dev/null 2>&1
    done
    cp icon_1024.png icon.iconset/icon_512x512@2x.png
    iconutil -c icns icon.iconset -o CCProxy.icns
    rm -rf icon.iconset
fi

cp CCProxy.icns "$APP/Contents/Resources/AppIcon.icns"

# Info.plist
cat > "$APP/Contents/Info.plist" << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>CC Proxy</string>
    <key>CFBundleDisplayName</key>
    <string>CC Proxy</string>
    <key>CFBundleIdentifier</key>
    <string>com.ccproxy.helper</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleExecutable</key>
    <string>CCProxy</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>LSUIElement</key>
    <true/>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsArbitraryLoads</key>
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

# Create DMG for distribution
echo "Creating DMG..."
rm -f CCProxy.dmg
hdiutil create -volname "CC Proxy" -srcfolder "$APP" -ov -format UDZO CCProxy.dmg 2>/dev/null

echo ""
echo "✅ Built: $APP"
echo "✅ DMG:   CCProxy.dmg"
echo ""
echo "Install:  open CCProxy.dmg → drag to Applications"
echo "Or:       cp -r $APP /Applications/"
