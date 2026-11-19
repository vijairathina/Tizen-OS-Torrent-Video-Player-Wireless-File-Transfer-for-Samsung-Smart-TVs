package com.tvfilehub.core.repository

import android.content.Context
import com.tvfilehub.core.common.AppResult
import com.tvfilehub.core.database.dao.MediaDao
import com.tvfilehub.core.database.entities.CachedMediaEntity
import com.tvfilehub.core.database.entities.ResumePointEntity
import com.tvfilehub.core.models.DownloadItem
import com.tvfilehub.core.models.OperatingMode
import com.tvfilehub.core.models.StorageSource
import com.tvfilehub.core.network.ServerApi
import com.tvfilehub.core.services.LocalMediaScanner
import com.tvfilehub.core.services.ServerHealthTracker
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.flow

interface MediaRepository {
    fun getAvailableMovies(): Flow<AppResult<List<DownloadItem>>>
    fun getContinueWatching(): Flow<List<ResumePointEntity>>
    suspend fun saveResumePoint(key: String, title: String, streamUrl: String, positionSec: Long, durationSec: Long)
    suspend fun getResumePosition(key: String): Long
    suspend fun deleteResumePoint(key: String)
}

class MediaRepositoryImpl(
    private val serverApi: ServerApi,
    private val mediaDao: MediaDao,
    private val context: Context? = null,
    private val healthTracker: ServerHealthTracker? = null
) : MediaRepository {

    override fun getAvailableMovies(): Flow<AppResult<List<DownloadItem>>> = flow {
        val localItems = context?.let { LocalMediaScanner.scanAllMedia(it) } ?: emptyList()
        val isManualOffline = healthTracker?.manualOfflineMode?.value ?: false

        // Emit cached data first so UI is immediately populated
        val cached = try {
            mediaDao.getAllCachedMedia().firstOrNull()?.map { c ->
                DownloadItem(
                    id = c.id,
                    name = c.name,
                    cleanTitle = c.cleanTitle,
                    size = c.sizeBytes,
                    sizeFormatted = c.sizeFormatted,
                    completed = c.isCompleted,
                    streamUrl = c.streamUrl,
                    storageSource = StorageSource.SERVER
                )
            } ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
        val initialList = (localItems + cached).distinctBy { it.name }
        if (initialList.isNotEmpty()) {
            emit(AppResult.Success(initialList))
        } else {
            emit(AppResult.Loading)
        }

        if (isManualOffline) {
            return@flow
        }

        try {
            val response = serverApi.getDownloads()
            healthTracker?.onServerSuccess()
            val movies = response.availableMovies
            // Cache to local database
            val entities = movies.map { m ->
                CachedMediaEntity(
                    id = m.id,
                    name = m.name,
                    cleanTitle = m.cleanTitle,
                    sizeBytes = m.size,
                    sizeFormatted = m.sizeFormatted,
                    streamUrl = m.streamUrl ?: "",
                    isCompleted = m.completed
                )
            }
            mediaDao.clearCachedMedia()
            mediaDao.insertCachedMedia(entities)
            val combined = (localItems + movies).distinctBy { it.name }
            emit(AppResult.Success(combined))
        } catch (e: Exception) {
            val cached = try {
                mediaDao.getAllCachedMedia().firstOrNull()?.map { c ->
                    DownloadItem(
                        id = c.id,
                        name = c.name,
                        cleanTitle = c.cleanTitle,
                        size = c.sizeBytes,
                        sizeFormatted = c.sizeFormatted,
                        completed = c.isCompleted,
                        streamUrl = c.streamUrl,
                        storageSource = StorageSource.SERVER
                    )
                } ?: emptyList()
            } catch (_: Exception) {
                emptyList()
            }
            val fallback = (localItems + cached).distinctBy { it.name }
            if (fallback.isNotEmpty()) {
                emit(AppResult.Success(fallback))
            } else {
                emit(AppResult.Error(e, "Failed to load movies: ${e.localizedMessage}"))
            }
        }
    }

    override fun getContinueWatching(): Flow<List<ResumePointEntity>> {
        return mediaDao.getAllResumePoints()
    }

    override fun toString(): String {
        return "MediaRepositoryImpl(serverApi=$serverApi)"
    }

    override suspend fun saveResumePoint(
        key: String,
        title: String,
        streamUrl: String,
        positionSec: Long,
        durationSec: Long
    ) {
        if (key.isBlank() || positionSec < 5) return
        // If within 15 seconds of the end, remove resume marker
        if (durationSec > 30 && (durationSec - positionSec) < 15) {
            mediaDao.deleteResumePoint(key)
        } else {
            val entity = ResumePointEntity(
                mediaKey = key,
                title = title,
                streamUrl = streamUrl,
                positionSeconds = positionSec,
                durationSeconds = durationSec,
                updatedAt = System.currentTimeMillis()
            )
            mediaDao.saveResumePoint(entity)
        }
    }

    override suspend fun getResumePosition(key: String): Long {
        return mediaDao.getResumePoint(key)?.positionSeconds ?: 0L
    }

    override suspend fun deleteResumePoint(key: String) {
        mediaDao.deleteResumePoint(key)
    }
}
