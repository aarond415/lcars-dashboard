// swift-tools-version:5.10
// LCARS — native macOS wrapper for the dashboard.
// Open this file in Xcode to edit, or run ./build.sh to produce LCARS.app.

import PackageDescription

let package = Package(
    name: "LCARS",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "LCARS", path: "Sources/LCARS"),
    ],
    swiftLanguageVersions: [.v5]
)
