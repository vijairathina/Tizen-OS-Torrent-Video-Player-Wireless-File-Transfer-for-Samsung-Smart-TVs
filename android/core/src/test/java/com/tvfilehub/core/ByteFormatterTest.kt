package com.tvfilehub.core

import com.tvfilehub.core.common.ByteFormatter
import org.junit.Assert.assertEquals
import org.junit.Test

class ByteFormatterTest {

    @Test
    fun testZeroBytes() {
        assertEquals("0 B", ByteFormatter.format(0L))
        assertEquals("0 B", ByteFormatter.format(-100L))
    }

    @Test
    fun testKilobytesFormatting() {
        assertEquals("1.00 KB", ByteFormatter.format(1024L))
        assertEquals("1.50 KB", ByteFormatter.format(1536L))
    }

    @Test
    fun testMegabytesFormatting() {
        assertEquals("1.00 MB", ByteFormatter.format(1024L * 1024L))
        assertEquals("250.00 MB", ByteFormatter.format(250L * 1024L * 1024L))
    }

    @Test
    fun testGigabytesFormatting() {
        assertEquals("1.73 GB", ByteFormatter.format((1.73 * 1024 * 1024 * 1024).toLong()))
    }

    @Test
    fun testParseFormattedBytes() {
        assertEquals(1024L, ByteFormatter.parseFormattedBytes("1 KB"))
        assertEquals(1024L * 1024L, ByteFormatter.parseFormattedBytes("1.0 MB"))
        assertEquals(2L * 1024L * 1024L * 1024L, ByteFormatter.parseFormattedBytes("2 GB"))
    }
}
