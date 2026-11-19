package com.tvfilehub.core

import com.tvfilehub.core.common.cleanMediaTitle
import com.tvfilehub.core.common.formatTime
import org.junit.Assert.assertEquals
import org.junit.Test

class StringExtensionsTest {

    @Test
    fun testCleanMediaTitleRemovesDomainPrefix() {
        val raw = "www.1TamilMV.insure - Lakshmikanthan Kolai Vazhakku (2026) Tamil TRUE WEB-DL - 1080p.mkv"
        val expected = "Lakshmikanthan Kolai Vazhakku (2026) Tamil TRUE WEB-DL - 1080p"
        assertEquals(expected, raw.cleanMediaTitle())
    }

    @Test
    fun testCleanMediaTitleRemovesTorrentExtension() {
        val raw = "www.1TamilMV.io - The Court (2026) S01 EP (41-44).torrent"
        val expected = "The Court (2026) S01 EP (41-44)"
        assertEquals(expected, raw.cleanMediaTitle())
    }

    @Test
    fun testFormatTime() {
        assertEquals("00:00", 0L.formatTime())
        assertEquals("01:05", 65L.formatTime())
        assertEquals("01:00:00", 3600L.formatTime())
        assertEquals("02:15:30", 8130L.formatTime())
    }
}
