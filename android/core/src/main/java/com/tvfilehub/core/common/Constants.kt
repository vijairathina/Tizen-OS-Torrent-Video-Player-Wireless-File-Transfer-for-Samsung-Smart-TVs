package com.tvfilehub.core.common

object Constants {
    const val DEFAULT_SERVER_HOST = "192.168.0.14"
    const val DEFAULT_HTTP_PORT = 8080
    const val DEFAULT_TORRENT_STREAM_PORT = 8889

    const val WS_PATH = "/ws"
    const val SSE_PATH = "/events"

    const val TIMEOUT_CONNECT_SECONDS = 10L
    const val TIMEOUT_READ_SECONDS = 15L
    const val TIMEOUT_WRITE_SECONDS = 15L

    const val PREF_KEY_SERVER_IP = "pref_server_ip"
    const val PREF_KEY_STORAGE_MODE = "pref_storage_mode"
    const val PREF_KEY_THEME = "pref_theme"
    const val PREF_KEY_AUTO_TORRENT = "pref_auto_torrent"

    const val STORAGE_MODE_LOCAL = "local"
    const val STORAGE_MODE_USB = "usb"
    const val STORAGE_MODE_SERVER = "server"

    const val PRIORITY_HIGHEST = "Highest"
    const val PRIORITY_NORMAL = "Normal"
    const val PRIORITY_LOW = "Low"
    const val PRIORITY_COMPLETED = "Completed"

    // Supported file extensions
    val VIDEO_EXTENSIONS = setOf("mp4", "mkv", "avi", "mov", "webm", "ts", "m4v")
    val AUDIO_EXTENSIONS = setOf("mp3", "aac", "flac", "wav", "ogg", "m4a")
    val SUBTITLE_EXTENSIONS = setOf("srt", "vtt")
    val TORRENT_EXTENSIONS = setOf("torrent")
}
