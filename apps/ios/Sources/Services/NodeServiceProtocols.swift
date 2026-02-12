import CoreLocation
import Foundation
import DewBotKit
import UIKit

protocol CameraServicing: Sendable {
    func listDevices() async -> [CameraController.CameraDeviceInfo]
    func snap(params: DewBotCameraSnapParams) async throws -> (format: String, base64: String, width: Int, height: Int)
    func clip(params: DewBotCameraClipParams) async throws -> (format: String, base64: String, durationMs: Int, hasAudio: Bool)
}

protocol ScreenRecordingServicing: Sendable {
    func record(
        screenIndex: Int?,
        durationMs: Int?,
        fps: Double?,
        includeAudio: Bool?,
        outPath: String?) async throws -> String
}

@MainActor
protocol LocationServicing: Sendable {
    func authorizationStatus() -> CLAuthorizationStatus
    func accuracyAuthorization() -> CLAccuracyAuthorization
    func ensureAuthorization(mode: DewBotLocationMode) async -> CLAuthorizationStatus
    func currentLocation(
        params: DewBotLocationGetParams,
        desiredAccuracy: DewBotLocationAccuracy,
        maxAgeMs: Int?,
        timeoutMs: Int?) async throws -> CLLocation
}

protocol DeviceStatusServicing: Sendable {
    func status() async throws -> DewBotDeviceStatusPayload
    func info() -> DewBotDeviceInfoPayload
}

protocol PhotosServicing: Sendable {
    func latest(params: DewBotPhotosLatestParams) async throws -> DewBotPhotosLatestPayload
}

protocol ContactsServicing: Sendable {
    func search(params: DewBotContactsSearchParams) async throws -> DewBotContactsSearchPayload
    func add(params: DewBotContactsAddParams) async throws -> DewBotContactsAddPayload
}

protocol CalendarServicing: Sendable {
    func events(params: DewBotCalendarEventsParams) async throws -> DewBotCalendarEventsPayload
    func add(params: DewBotCalendarAddParams) async throws -> DewBotCalendarAddPayload
}

protocol RemindersServicing: Sendable {
    func list(params: DewBotRemindersListParams) async throws -> DewBotRemindersListPayload
    func add(params: DewBotRemindersAddParams) async throws -> DewBotRemindersAddPayload
}

protocol MotionServicing: Sendable {
    func activities(params: DewBotMotionActivityParams) async throws -> DewBotMotionActivityPayload
    func pedometer(params: DewBotPedometerParams) async throws -> DewBotPedometerPayload
}

extension CameraController: CameraServicing {}
extension ScreenRecordService: ScreenRecordingServicing {}
extension LocationService: LocationServicing {}
