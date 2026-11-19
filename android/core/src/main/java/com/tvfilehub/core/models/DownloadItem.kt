package com.tvfilehub.core.models

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class DownloadItem(
    @Json(name = "id") val id: String,
    @Json(name = "name") val name: String,
    @Json(name = "clean_title") val cleanTitle: String,
    @Json(name = "size") val size: Long = 0L,
    @Json(name = "size_formatted") val sizeFormatted: String = "",
    @Json(name = "priority") val priority: String = "Normal",
    @Json(name = "priority_badge") val priorityBadge: String = "",
    @Json(name = "is_active_stream") val isActiveStream: Boolean = false,
    @Json(name = "status") val status: String = "",
    @Json(name = "progress") val progress: Double = 0.0,
    @Json(name = "speed") val speed: String = "0 B/s",
    @Json(name = "upload_speed") val uploadSpeed: String = "0 B/s",
    @Json(name = "downloaded") val downloaded: String = "0 B",
    @Json(name = "total") val total: String = "",
    @Json(name = "peers") val peers: Int = 0,
    @Json(name = "time_remaining") val timeRemaining: String = "",
    @Json(name = "completed") val completed: Boolean = false,
    @Json(name = "is_paused") val isPaused: Boolean = false,
    @Json(name = "is_downloading") val isDownloading: Boolean = false,
    @Json(name = "stream_url") val streamUrl: String? = null,
    @Json(name = "total_episodes") val totalEpisodes: Int = 0,
    @Json(name = "episodes") val episodes: List<TorrentEpisode> = emptyList(),
    val storageSource: StorageSource = StorageSource.SERVER,
    val localFilePath: String? = null
) {
    val isCompletedOrReady: Boolean get() = completed || progress >= 100.0 || storageSource != StorageSource.SERVER
    val progressInt: Int get() = progress.toInt().coerceIn(0, 100)
    val effectivePlayUrl: String get() = localFilePath ?: streamUrl ?: ""
    val hasMultipleEpisodes: Boolean get() = totalEpisodes > 1 || episodes.size > 1
}
