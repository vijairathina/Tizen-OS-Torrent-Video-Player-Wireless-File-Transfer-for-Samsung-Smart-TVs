package com.tvfilehub.core

import com.tvfilehub.core.common.AppResult
import com.tvfilehub.core.models.DownloadItem
import com.tvfilehub.core.models.DownloadsDashboardResponse
import com.tvfilehub.core.models.GenericStatusResponse
import com.tvfilehub.core.models.SystemStatus
import com.tvfilehub.core.network.ServerApi
import com.tvfilehub.core.repository.TorrentRepositoryImpl
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.last
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class TorrentRepositoryTest {

    private lateinit var serverApi: ServerApi
    private lateinit var repository: TorrentRepositoryImpl

    @Before
    fun setup() {
        serverApi = mockk()
        repository = TorrentRepositoryImpl(serverApi)
    }

    @Test
    fun testGetDownloadsDashboardSuccess() = runTest {
        val fakeMovies = listOf(
            DownloadItem(id = "1", name = "Test.mkv", cleanTitle = "Test Movie", completed = true)
        )
        val fakeResponse = DownloadsDashboardResponse(
            systemStatus = SystemStatus(mode = "idle"),
            availableMovies = fakeMovies,
            currentlyDownloading = emptyList()
        )
        coEvery { serverApi.getDownloads() } returns fakeResponse

        val result = repository.getDownloadsDashboard().last()
        assertTrue(result is AppResult.Success)
        val data = (result as AppResult.Success).data
        assertEquals(1, data.availableMovies.size)
        assertEquals("Test Movie", data.availableMovies[0].cleanTitle)
    }

    @Test
    fun testStartTorrentSuccess() = runTest {
        val expected = GenericStatusResponse(status = "started", streamUrl = "http://192.168.0.14:8889/0")
        coEvery { serverApi.startTorrent("sample.torrent", null, false, null, null) } returns expected

        val result = repository.startTorrent(file = "sample.torrent", downloadOnly = false)
        assertTrue(result is AppResult.Success)
        assertEquals("started", (result as AppResult.Success).data.status)
        assertEquals("http://192.168.0.14:8889/0", result.data.streamUrl)
    }

    @Test
    fun testSetLowPriority() = runTest {
        val expected = GenericStatusResponse(status = "low_priority_set", success = true)
        coEvery { serverApi.setLowPriority("sample.torrent") } returns expected

        val result = repository.setLowPriority("sample.torrent")
        assertTrue(result is AppResult.Success)
        assertTrue((result as AppResult.Success).data.success)
        coVerify(exactly = 1) { serverApi.setLowPriority("sample.torrent") }
    }
}
