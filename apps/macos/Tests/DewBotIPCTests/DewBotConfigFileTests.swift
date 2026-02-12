import Foundation
import Testing
@testable import DewBot

@Suite(.serialized)
struct DewBotConfigFileTests {
    @Test
    func configPathRespectsEnvOverride() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("dewbot-config-\(UUID().uuidString)")
            .appendingPathComponent("dewbot.json")
            .path

        await TestIsolation.withEnvValues(["DEWBOT_CONFIG_PATH": override]) {
            #expect(DewBotConfigFile.url().path == override)
        }
    }

    @MainActor
    @Test
    func remoteGatewayPortParsesAndMatchesHost() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("dewbot-config-\(UUID().uuidString)")
            .appendingPathComponent("dewbot.json")
            .path

        await TestIsolation.withEnvValues(["DEWBOT_CONFIG_PATH": override]) {
            DewBotConfigFile.saveDict([
                "gateway": [
                    "remote": [
                        "url": "ws://gateway.ts.net:19999",
                    ],
                ],
            ])
            #expect(DewBotConfigFile.remoteGatewayPort() == 19999)
            #expect(DewBotConfigFile.remoteGatewayPort(matchingHost: "gateway.ts.net") == 19999)
            #expect(DewBotConfigFile.remoteGatewayPort(matchingHost: "gateway") == 19999)
            #expect(DewBotConfigFile.remoteGatewayPort(matchingHost: "other.ts.net") == nil)
        }
    }

    @MainActor
    @Test
    func setRemoteGatewayUrlPreservesScheme() async {
        let override = FileManager().temporaryDirectory
            .appendingPathComponent("dewbot-config-\(UUID().uuidString)")
            .appendingPathComponent("dewbot.json")
            .path

        await TestIsolation.withEnvValues(["DEWBOT_CONFIG_PATH": override]) {
            DewBotConfigFile.saveDict([
                "gateway": [
                    "remote": [
                        "url": "wss://old-host:111",
                    ],
                ],
            ])
            DewBotConfigFile.setRemoteGatewayUrl(host: "new-host", port: 2222)
            let root = DewBotConfigFile.loadDict()
            let url = ((root["gateway"] as? [String: Any])?["remote"] as? [String: Any])?["url"] as? String
            #expect(url == "wss://new-host:2222")
        }
    }

    @Test
    func stateDirOverrideSetsConfigPath() async {
        let dir = FileManager().temporaryDirectory
            .appendingPathComponent("dewbot-state-\(UUID().uuidString)", isDirectory: true)
            .path

        await TestIsolation.withEnvValues([
            "DEWBOT_CONFIG_PATH": nil,
            "DEWBOT_STATE_DIR": dir,
        ]) {
            #expect(DewBotConfigFile.stateDirURL().path == dir)
            #expect(DewBotConfigFile.url().path == "\(dir)/dewbot.json")
        }
    }
}
