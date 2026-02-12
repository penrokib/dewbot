import Foundation

public enum DewBotCameraCommand: String, Codable, Sendable {
    case list = "camera.list"
    case snap = "camera.snap"
    case clip = "camera.clip"
}

public enum DewBotCameraFacing: String, Codable, Sendable {
    case back
    case front
}

public enum DewBotCameraImageFormat: String, Codable, Sendable {
    case jpg
    case jpeg
}

public enum DewBotCameraVideoFormat: String, Codable, Sendable {
    case mp4
}

public struct DewBotCameraSnapParams: Codable, Sendable, Equatable {
    public var facing: DewBotCameraFacing?
    public var maxWidth: Int?
    public var quality: Double?
    public var format: DewBotCameraImageFormat?
    public var deviceId: String?
    public var delayMs: Int?

    public init(
        facing: DewBotCameraFacing? = nil,
        maxWidth: Int? = nil,
        quality: Double? = nil,
        format: DewBotCameraImageFormat? = nil,
        deviceId: String? = nil,
        delayMs: Int? = nil)
    {
        self.facing = facing
        self.maxWidth = maxWidth
        self.quality = quality
        self.format = format
        self.deviceId = deviceId
        self.delayMs = delayMs
    }
}

public struct DewBotCameraClipParams: Codable, Sendable, Equatable {
    public var facing: DewBotCameraFacing?
    public var durationMs: Int?
    public var includeAudio: Bool?
    public var format: DewBotCameraVideoFormat?
    public var deviceId: String?

    public init(
        facing: DewBotCameraFacing? = nil,
        durationMs: Int? = nil,
        includeAudio: Bool? = nil,
        format: DewBotCameraVideoFormat? = nil,
        deviceId: String? = nil)
    {
        self.facing = facing
        self.durationMs = durationMs
        self.includeAudio = includeAudio
        self.format = format
        self.deviceId = deviceId
    }
}
