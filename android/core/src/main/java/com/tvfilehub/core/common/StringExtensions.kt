package com.tvfilehub.core.common

import java.util.Locale

fun String?.cleanMediaTitle(): String {
    if (this.isNullOrBlank()) return "Media Stream"
    var clean = this.trim()
    // Remove web domain prefixes like "www.1TamilMV.insure - "
    clean = clean.replace(Regex("""^www\.[a-zA-Z0-9-]+\.[a-zA-Z0-9.-]+\s*-\s*""", RegexOption.IGNORE_CASE), "")
    // Remove extensions
    clean = clean.replace(Regex("""\.(torrent|mkv|mp4|avi|mov|webm|ts)$""", RegexOption.IGNORE_CASE), "")
    return clean.ifBlank { "Media Stream" }
}

fun Long.formatTime(): String {
    val totalSeconds = this.coerceAtLeast(0L)
    val hours = totalSeconds / 3600
    val minutes = (totalSeconds % 3600) / 60
    val seconds = totalSeconds % 60
    return if (hours > 0) {
        String.format(Locale.US, "%02d:%02d:%02d", hours, minutes, seconds)
    } else {
        String.format(Locale.US, "%02d:%02d", minutes, seconds)
    }
}
