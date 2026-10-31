#!/bin/bash
# Builds LCARS.app from the Swift sources and bundles the dashboard files.
#   ./build.sh            → macos/build/LCARS.app
#   ./build.sh --install  → also copies it to /Applications
# Re-run after any change to the dashboard (index.html, config.js, css/, js/).
set -euo pipefail

cd "$(dirname "$0")"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

DASHBOARD=..
BUILD=build
APP="$BUILD/LCARS.app"

echo "▸ Compiling"
swift build -c release
BIN="$(swift build -c release --show-bin-path)/LCARS"

echo "▸ Rendering icon"
if [ ! -f "$BUILD/AppIcon.icns" ] || [ Icon/make_icon.swift -nt "$BUILD/AppIcon.icns" ]; then
  swift Icon/make_icon.swift "$BUILD/AppIcon.iconset"
  iconutil -c icns "$BUILD/AppIcon.iconset" -o "$BUILD/AppIcon.icns"
fi

echo "▸ Assembling $APP"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"
cp "$BIN" "$APP/Contents/MacOS/LCARS"
cp Resources/Info.plist "$APP/Contents/Info.plist"
cp "$BUILD/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
cp -R "$DASHBOARD/index.html" "$DASHBOARD/config.js" "$DASHBOARD/css" "$DASHBOARD/js" "$APP/Contents/Resources/web/"

echo "▸ Signing (ad-hoc)"
codesign --force --sign - "$APP"

if [ "${1:-}" = "--install" ]; then
  echo "▸ Installing to /Applications"
  rm -rf /Applications/LCARS.app
  cp -R "$APP" /Applications/LCARS.app
fi

echo "✓ Done"
