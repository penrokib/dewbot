import Foundation

// Stable identifier used for both the macOS LaunchAgent label and Nix-managed defaults suite.
// nix-dewbot writes app defaults into this suite to survive app bundle identifier churn.
let launchdLabel = "ai.dewbot.mac"
let gatewayLaunchdLabel = "ai.dewbot.gateway"
let onboardingVersionKey = "dewbot.onboardingVersion"
let onboardingSeenKey = "dewbot.onboardingSeen"
let currentOnboardingVersion = 7
let pauseDefaultsKey = "dewbot.pauseEnabled"
let iconAnimationsEnabledKey = "dewbot.iconAnimationsEnabled"
let swabbleEnabledKey = "dewbot.swabbleEnabled"
let swabbleTriggersKey = "dewbot.swabbleTriggers"
let voiceWakeTriggerChimeKey = "dewbot.voiceWakeTriggerChime"
let voiceWakeSendChimeKey = "dewbot.voiceWakeSendChime"
let showDockIconKey = "dewbot.showDockIcon"
let defaultVoiceWakeTriggers = ["dewbot"]
let voiceWakeMaxWords = 32
let voiceWakeMaxWordLength = 64
let voiceWakeMicKey = "dewbot.voiceWakeMicID"
let voiceWakeMicNameKey = "dewbot.voiceWakeMicName"
let voiceWakeLocaleKey = "dewbot.voiceWakeLocaleID"
let voiceWakeAdditionalLocalesKey = "dewbot.voiceWakeAdditionalLocaleIDs"
let voicePushToTalkEnabledKey = "dewbot.voicePushToTalkEnabled"
let talkEnabledKey = "dewbot.talkEnabled"
let iconOverrideKey = "dewbot.iconOverride"
let connectionModeKey = "dewbot.connectionMode"
let remoteTargetKey = "dewbot.remoteTarget"
let remoteIdentityKey = "dewbot.remoteIdentity"
let remoteProjectRootKey = "dewbot.remoteProjectRoot"
let remoteCliPathKey = "dewbot.remoteCliPath"
let canvasEnabledKey = "dewbot.canvasEnabled"
let cameraEnabledKey = "dewbot.cameraEnabled"
let systemRunPolicyKey = "dewbot.systemRunPolicy"
let systemRunAllowlistKey = "dewbot.systemRunAllowlist"
let systemRunEnabledKey = "dewbot.systemRunEnabled"
let locationModeKey = "dewbot.locationMode"
let locationPreciseKey = "dewbot.locationPreciseEnabled"
let peekabooBridgeEnabledKey = "dewbot.peekabooBridgeEnabled"
let deepLinkKeyKey = "dewbot.deepLinkKey"
let modelCatalogPathKey = "dewbot.modelCatalogPath"
let modelCatalogReloadKey = "dewbot.modelCatalogReload"
let cliInstallPromptedVersionKey = "dewbot.cliInstallPromptedVersion"
let heartbeatsEnabledKey = "dewbot.heartbeatsEnabled"
let debugPaneEnabledKey = "dewbot.debugPaneEnabled"
let debugFileLogEnabledKey = "dewbot.debug.fileLogEnabled"
let appLogLevelKey = "dewbot.debug.appLogLevel"
let voiceWakeSupported: Bool = ProcessInfo.processInfo.operatingSystemVersion.majorVersion >= 26
