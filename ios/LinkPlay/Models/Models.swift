//
//  Models.swift
//  LinkPlay iOS
//
//  Data models matching the LinkPlay Companion Server API specifications.
//

import Foundation

public struct ServerDownloadsResponse: Codable {
    public let availableMovies: [MovieItem]
    public let currentlyDownloading: [TorrentDownloadItem]
    public let systemStatus: SystemStatusInfo?
    
    enum CodingKeys: String, CodingKey {
        case availableMovies = "available_movies"
        case currentlyDownloading = "currently_downloading"
        case systemStatus = "system_status"
    }
}

public struct MovieItem: Identifiable, Codable, Hashable {
    public var id: String { name }
    public let name: String
    public let cleanTitle: String
    public let size: Int64
    public let sizeFormatted: String
    public let streamUrl: String?
    public let isUsb: Bool?
    public let storageLabel: String?
    
    enum CodingKeys: String, CodingKey {
        case name
        case cleanTitle = "clean_title"
        case size
        case sizeFormatted = "size_formatted"
        case streamUrl = "stream_url"
        case isUsb = "is_usb"
        case storageLabel = "storage_label"
    }
}

public struct TorrentDownloadItem: Identifiable, Codable, Hashable {
    public let id: String
    public let name: String
    public let cleanTitle: String
    public let priority: String
    public let priorityBadge: String
    public let isActiveStream: Bool
    public let status: String
    public let progress: Double
    public let speed: String
    public let uploadSpeed: String
    public let downloaded: String
    public let total: String
    public let peers: Int
    public let timeRemaining: String
    public let completed: Bool
    public let streamUrl: String?
    public let isPaused: Bool?
    public let isLowPriority: Bool?
    
    enum CodingKeys: String, CodingKey {
        case id
        case name
        case cleanTitle = "clean_title"
        case priority
        case priorityBadge = "priority_badge"
        case isActiveStream = "is_active_stream"
        case status
        case progress
        case speed
        case uploadSpeed = "upload_speed"
        case downloaded
        case total
        case peers
        case timeRemaining = "time_remaining"
        case completed
        case streamUrl = "stream_url"
        case isPaused = "is_paused"
        case isLowPriority = "is_low_priority"
    }
}

public struct EpisodeItem: Identifiable, Codable, Hashable {
    public var id: Int { index }
    public let index: Int
    public let name: String
    public let cleanName: String
    public let size: Int64
    public let sizeFormatted: String
    public let streamUrl: String
    public let isSelected: Bool?
    
    enum CodingKeys: String, CodingKey {
        case index
        case name
        case cleanName = "clean_name"
        case size
        case sizeFormatted = "size_formatted"
        case streamUrl = "stream_url"
        case isSelected = "is_selected"
    }
}

public struct EpisodesResponse: Codable {
    public let success: Bool
    public let torrentName: String?
    public let files: [EpisodeItem]
    
    enum CodingKeys: String, CodingKey {
        case success
        case torrentName = "torrent_name"
        case files
    }
}

public struct SystemStatusInfo: Codable {
    public let mode: String?
    public let modeLabel: String?
    public let activeStreams: Int?
    public let transferCount: Int?
    
    enum CodingKeys: String, CodingKey {
        case mode
        case modeLabel = "mode_label"
        case activeStreams = "active_streams"
        case transferCount = "transfer_count"
    }
}
