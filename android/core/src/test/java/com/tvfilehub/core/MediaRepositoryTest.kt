package com.tvfilehub.core

import com.tvfilehub.core.database.dao.MediaDao
import com.tvfilehub.core.database.entities.ResumePointEntity
import com.tvfilehub.core.network.ServerApi
import com.tvfilehub.core.repository.MediaRepositoryImpl
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class MediaRepositoryTest {

    private lateinit var serverApi: ServerApi
    private lateinit var mediaDao: MediaDao
    private lateinit var repository: MediaRepositoryImpl

    @Before
    fun setup() {
        serverApi = mockk()
        mediaDao = mockk(relaxed = true)
        repository = MediaRepositoryImpl(serverApi, mediaDao)
    }

    @Test
    fun testSaveResumePointSavesCorrectly() = runTest {
        repository.saveResumePoint(
            key = "movie_123",
            title = "Sample Movie",
            streamUrl = "http://192.168.0.14:8080/files/sample.mp4",
            positionSec = 120L,
            durationSec = 3600L
        )

        coVerify {
            mediaDao.saveResumePoint(match {
                it.mediaKey == "movie_123" && it.positionSeconds == 120L && it.durationSeconds == 3600L
            })
        }
    }

    @Test
    fun testSaveResumePointDeletesWhenNearEnd() = runTest {
        // When within 15 seconds of the end, resume point should be cleared
        repository.saveResumePoint(
            key = "movie_123",
            title = "Sample Movie",
            streamUrl = "http://192.168.0.14:8080/files/sample.mp4",
            positionSec = 3590L,
            durationSec = 3600L
        )

        coVerify {
            mediaDao.deleteResumePoint("movie_123")
        }
    }

    @Test
    fun testGetResumePositionReturnsPosition() = runTest {
        val fakeEntity = ResumePointEntity(
            mediaKey = "movie_123",
            title = "Sample Movie",
            streamUrl = "http://example.com",
            positionSeconds = 450L,
            durationSeconds = 1800L
        )
        coEvery { mediaDao.getResumePoint("movie_123") } returns fakeEntity

        val pos = repository.getResumePosition("movie_123")
        assertEquals(450L, pos)
    }
}
