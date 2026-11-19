package com.tvfilehub.core.network

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import com.tvfilehub.core.models.TorrentStats

sealed class WebSocketEvent {
    data class Connected(val message: String) : WebSocketEvent()
    data class FileUploadStart(val fileId: String, val filename: String, val totalBytes: Long) : WebSocketEvent()
    data class FileUploadComplete(val fileId: String, val filename: String, val totalBytes: Long, val downloadUrl: String) : WebSocketEvent()
    data class TorrentStatsUpdate(val streamUrl: String?, val title: String?, val stats: TorrentStats?) : WebSocketEvent()
    data class StorageTargetUpdate(val target: String) : WebSocketEvent()
    data class FileDeleted(val filename: String) : WebSocketEvent()
    data class GenericMessage(val type: String, val raw: String) : WebSocketEvent()
    data class ConnectionState(val isConnected: Boolean) : WebSocketEvent()
}

@JsonClass(generateAdapter = true)
data class RawWebSocketMessage(
    @Json(name = "type") val type: String = "",
    @Json(name = "message") val message: String? = null,
    @Json(name = "fileId") val fileId: String? = null,
    @Json(name = "filename") val filename: String? = null,
    @Json(name = "totalBytes") val totalBytes: Long? = null,
    @Json(name = "downloadUrl") val downloadUrl: String? = null,
    @Json(name = "streamUrl") val streamUrl: String? = null,
    @Json(name = "title") val title: String? = null,
    @Json(name = "target") val target: String? = null
)
