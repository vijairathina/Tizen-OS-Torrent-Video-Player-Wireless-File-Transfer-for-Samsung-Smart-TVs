package com.tvfilehub.core.common

import java.util.Locale

object ByteFormatter {
    private val UNITS = arrayOf("B", "KB", "MB", "GB", "TB", "PB")

    fun format(bytes: Long): String {
        if (bytes <= 0L) return "0 B"
        var value = bytes.toDouble()
        var unitIndex = 0
        while (value >= 1024.0 && unitIndex < UNITS.size - 1) {
            value /= 1024.0
            unitIndex++
        }
        return String.format(Locale.US, "%.2f %s", value, UNITS[unitIndex])
    }

    fun parseFormattedBytes(formatted: String?): Long {
        if (formatted.isNullOrBlank()) return 0L
        val clean = formatted.trim()
        val regex = Regex("""^([\d.]+)\s*([A-Za-z]+)$""")
        val match = regex.find(clean) ?: return 0L
        val (numStr, unitStr) = match.destructured
        val num = numStr.toDoubleOrNull() ?: return 0L
        val multiplier = when (unitStr.uppercase(Locale.US)) {
            "KB" -> 1024L
            "MB" -> 1024L * 1024L
            "GB" -> 1024L * 1024L * 1024L
            "TB" -> 1024L * 1024L * 1024L * 1024L
            else -> 1L
        }
        return (num * multiplier).toLong()
    }
}
