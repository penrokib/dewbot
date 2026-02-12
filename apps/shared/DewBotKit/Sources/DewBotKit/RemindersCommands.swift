import Foundation

public enum DewBotRemindersCommand: String, Codable, Sendable {
    case list = "reminders.list"
    case add = "reminders.add"
}

public enum DewBotReminderStatusFilter: String, Codable, Sendable {
    case incomplete
    case completed
    case all
}

public struct DewBotRemindersListParams: Codable, Sendable, Equatable {
    public var status: DewBotReminderStatusFilter?
    public var limit: Int?

    public init(status: DewBotReminderStatusFilter? = nil, limit: Int? = nil) {
        self.status = status
        self.limit = limit
    }
}

public struct DewBotRemindersAddParams: Codable, Sendable, Equatable {
    public var title: String
    public var dueISO: String?
    public var notes: String?
    public var listId: String?
    public var listName: String?

    public init(
        title: String,
        dueISO: String? = nil,
        notes: String? = nil,
        listId: String? = nil,
        listName: String? = nil)
    {
        self.title = title
        self.dueISO = dueISO
        self.notes = notes
        self.listId = listId
        self.listName = listName
    }
}

public struct DewBotReminderPayload: Codable, Sendable, Equatable {
    public var identifier: String
    public var title: String
    public var dueISO: String?
    public var completed: Bool
    public var listName: String?

    public init(
        identifier: String,
        title: String,
        dueISO: String? = nil,
        completed: Bool,
        listName: String? = nil)
    {
        self.identifier = identifier
        self.title = title
        self.dueISO = dueISO
        self.completed = completed
        self.listName = listName
    }
}

public struct DewBotRemindersListPayload: Codable, Sendable, Equatable {
    public var reminders: [DewBotReminderPayload]

    public init(reminders: [DewBotReminderPayload]) {
        self.reminders = reminders
    }
}

public struct DewBotRemindersAddPayload: Codable, Sendable, Equatable {
    public var reminder: DewBotReminderPayload

    public init(reminder: DewBotReminderPayload) {
        self.reminder = reminder
    }
}
