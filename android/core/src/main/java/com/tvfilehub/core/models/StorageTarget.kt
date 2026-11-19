package com.tvfilehub.core.models

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class StorageTargetResponse(
    @Json(name = "target") val target: String = "USB Drive"
)

@JsonClass(generateAdapter = true)
data class GenericStatusResponse(
    @Json(name = "status") val status: String = "",
    @Json(name = "service") val service: String? = null,
    @Json(name = "streamUrl") val streamUrl: String? = null,
    @Json(name = "filename") val filename: String? = null,
    @Json(name = "file") val file: String? = null,
    @Json(name = "success") val success: Boolean = true,
    @Json(name = "isDownloaded") val isDownloaded: Boolean = false,
    @Json(name = "downloadOnly") val downloadOnly: Boolean = false
)

@JsonClass(generateAdapter = true)
data class FileUploadResponse(
    @Json(name = "ok") val ok: Boolean = false,
    @Json(name = "filename") val filename: String = "",
    @Json(name = "size") val size: Long = 0L
)

@JsonClass(generateAdapter = true)
data class AudioTrack(
    @Json(name = "index") val index: Int,
    @Json(name = "language") val language: String = "Unknown",
    @Json(name = "codec") val codec: String = "",
    @Json(name = "title") val title: String = ""
)

@JsonClass(generateAdapter = true)
data class MediaInfoResponse(
    @Json(name = "filename") val filename: String = "",
    @Json(name = "hasMultipleAudio") val hasMultipleAudio: Boolean = false,
    @Json(name = "audioTracks") val audioTracks: List<AudioTrack> = emptyList()
)

@JsonClass(generateAdapter = true)
data class TorrentEpisode(
    @Json(name = "index") val index: Int = 0,
    @Json(name = "name") val name: String = "",
    @Json(name = "path") val path: String = "",
    @Json(name = "length") val length: Long = 0L,
    @Json(name = "size") val size: Long = 0L,
    @Json(name = "sizeStr") val sizeStr: String = "",
    @Json(name = "sizeFormatted") val sizeFormatted: String = "",
    @Json(name = "isDownloaded") val isDownloaded: Boolean = false,
    @Json(name = "streamUrl") val streamUrl: String = ""
) {
    val displaySize: String get() = sizeFormatted.ifBlank { sizeStr }
}

@JsonClass(generateAdapter = true)
data class TorrentFilesResponse(
    @Json(name = "success") val success: Boolean = false,
    @Json(name = "torrentFile") val torrentFile: String = "",
    @Json(name = "totalEpisodes") val totalEpisodes: Int = 0,
    @Json(name = "episodes") val episodes: List<TorrentEpisode> = emptyList()
)

data class FileNode(
    val name: String,
    val path: String,
    val isDirectory: Boolean,
    val size: Long = 0L,
    val sizeFormatted: String = "",
    val extension: String = "",
    val lastModified: Long = 0L
)
