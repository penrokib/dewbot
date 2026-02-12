import Foundation

public enum DewBotChatTransportEvent: Sendable {
    case health(ok: Bool)
    case tick
    case chat(DewBotChatEventPayload)
    case agent(DewBotAgentEventPayload)
    case seqGap
}

public protocol DewBotChatTransport: Sendable {
    func requestHistory(sessionKey: String) async throws -> DewBotChatHistoryPayload
    func sendMessage(
        sessionKey: String,
        message: String,
        thinking: String,
        idempotencyKey: String,
        attachments: [DewBotChatAttachmentPayload]) async throws -> DewBotChatSendResponse

    func abortRun(sessionKey: String, runId: String) async throws
    func listSessions(limit: Int?) async throws -> DewBotChatSessionsListResponse

    func requestHealth(timeoutMs: Int) async throws -> Bool
    func events() -> AsyncStream<DewBotChatTransportEvent>

    func setActiveSessionKey(_ sessionKey: String) async throws
}

extension DewBotChatTransport {
    public func setActiveSessionKey(_: String) async throws {}

    public func abortRun(sessionKey _: String, runId _: String) async throws {
        throw NSError(
            domain: "DewBotChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "chat.abort not supported by this transport"])
    }

    public func listSessions(limit _: Int?) async throws -> DewBotChatSessionsListResponse {
        throw NSError(
            domain: "DewBotChatTransport",
            code: 0,
            userInfo: [NSLocalizedDescriptionKey: "sessions.list not supported by this transport"])
    }
}
