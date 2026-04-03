#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "Building CCProxyHelper..."
swiftc -O -o CCProxyHelper CCProxyHelper.swift -framework Cocoa
echo "✅ Built: menubar/CCProxyHelper"
echo ""
echo "Run with: ./menubar/CCProxyHelper --server https://your-server.com"
