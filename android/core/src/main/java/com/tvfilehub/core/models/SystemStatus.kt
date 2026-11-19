package com.tvfilehub.core.models

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class SystemStatus(
    @Json(name = "mode") val mode: String = "idle",
    @Json(name = "mode_label") val modeLabel: String = "Idle Mode",
    @Json(name = "active_stream") val activeStream: String? = null,
    @Json(name = "active_bg_download") val activeBgDownload: String? = null,
    @Json(name = "total_available") val totalAvailable: Int = 0,
    @Json(name = "total_downloading") val totalDownloading: Int = 0,
    @Json(name = "seeding_status") val seedingStatus: String = "",
    @Json(name = "api_endpoint") val apiEndpoint: String = "",
    @Json(name = "host_ip") val hostIp: String = "192.168.0.14",
    @Json(name = "port") val port: Int = 8080
)

@JsonClass(generateAdapter = true)
data class DownloadsDashboardResponse(
    @Json(name = "system_status") val systemStatus: SystemStatus = SystemStatus(),
    @Json(name = "available_movies") val availableMovies: List<DownloadItem> = emptyList(),
    @Json(name = "currently_downloading") val currentlyDownloading: List<DownloadItem> = emptyList()
)
