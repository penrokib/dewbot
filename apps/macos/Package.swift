// swift-tools-version: 6.2
// Package manifest for the DewBot macOS companion (menu bar app + IPC library).

import PackageDescription

let package = Package(
    name: "DewBot",
    platforms: [
        .macOS(.v15),
    ],
    products: [
        .library(name: "DewBotIPC", targets: ["DewBotIPC"]),
        .library(name: "DewBotDiscovery", targets: ["DewBotDiscovery"]),
        .executable(name: "DewBot", targets: ["DewBot"]),
        .executable(name: "dewbot-mac", targets: ["DewBotMacCLI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/orchetect/MenuBarExtraAccess", exact: "1.2.2"),
        .package(url: "https://github.com/swiftlang/swift-subprocess.git", from: "0.1.0"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.8.0"),
        .package(url: "https://github.com/sparkle-project/Sparkle", from: "2.8.1"),
        .package(url: "https://github.com/steipete/Peekaboo.git", branch: "main"),
        .package(path: "../shared/DewBotKit"),
        .package(path: "../../Swabble"),
    ],
    targets: [
        .target(
            name: "DewBotIPC",
            dependencies: [],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .target(
            name: "DewBotDiscovery",
            dependencies: [
                .product(name: "DewBotKit", package: "DewBotKit"),
            ],
            path: "Sources/DewBotDiscovery",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "DewBot",
            dependencies: [
                "DewBotIPC",
                "DewBotDiscovery",
                .product(name: "DewBotKit", package: "DewBotKit"),
                .product(name: "DewBotChatUI", package: "DewBotKit"),
                .product(name: "DewBotProtocol", package: "DewBotKit"),
                .product(name: "SwabbleKit", package: "swabble"),
                .product(name: "MenuBarExtraAccess", package: "MenuBarExtraAccess"),
                .product(name: "Subprocess", package: "swift-subprocess"),
                .product(name: "Logging", package: "swift-log"),
                .product(name: "Sparkle", package: "Sparkle"),
                .product(name: "PeekabooBridge", package: "Peekaboo"),
                .product(name: "PeekabooAutomationKit", package: "Peekaboo"),
            ],
            exclude: [
                "Resources/Info.plist",
            ],
            resources: [
                .copy("Resources/DewBot.icns"),
                .copy("Resources/DeviceModels"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .executableTarget(
            name: "DewBotMacCLI",
            dependencies: [
                "DewBotDiscovery",
                .product(name: "DewBotKit", package: "DewBotKit"),
                .product(name: "DewBotProtocol", package: "DewBotKit"),
            ],
            path: "Sources/DewBotMacCLI",
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]),
        .testTarget(
            name: "DewBotIPCTests",
            dependencies: [
                "DewBotIPC",
                "DewBot",
                "DewBotDiscovery",
                .product(name: "DewBotProtocol", package: "DewBotKit"),
                .product(name: "SwabbleKit", package: "swabble"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
                .enableExperimentalFeature("SwiftTesting"),
            ]),
    ])
