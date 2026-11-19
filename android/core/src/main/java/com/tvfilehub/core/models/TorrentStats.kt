package com.tvfilehub.core.models

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class TorrentStats(
    @Json(name = "name") val name: String = "",
    @Json(name = "progress") val progress: Double = 0.0,
    @Json(name = "speed") val speed: String = "0 B/s",
    @Json(name = "upload_speed") val uploadSpeed: String = "0 B/s",
    @Json(name = "completedMB") val completedMB: Double = 0.0,
    @Json(name = "totalMB") val totalMB: Double = 0.0,
    @Json(name = "peers") val peers: Int = 0,
    @Json(name = "pieces") val pieces: String = "",
    @Json(name = "status") val status: String = ""
)
