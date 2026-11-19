package com.tvfilehub.core.repository

import android.content.Context
import com.tvfilehub.core.common.AppResult
import com.tvfilehub.core.models.*
import com.tvfilehub.core.network.ApiClient
import com.tvfilehub.core.network.ServerApi
import com.tvfilehub.core.services.LocalMediaScanner
import com.tvfilehub.core.services.ServerHealthTracker
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import java.io.File

interface TorrentRepository {
    fun getDownloadsDashboard(): Flow<AppResult<DownloadsDashboardResponse>>
    suspend fun startTorrent(file: String? = null, magnet: String? = null, downloadOnly: Boolean? = null, fileIdx: Int? = null, episode: String? = null): AppResult<GenericStatusResponse>
    suspend fun stopTorrent(): AppResult<GenericStatusResponse>
    suspend fun prioritize(file: String): AppResult<GenericStatusResponse>
    suspend fun setLowPriority(file: String): AppResult<GenericStatusResponse>
    suspend fun setNormalPriority(file: String): AppResult<GenericStatusResponse>
    suspend fun pauseTorrent(file: String): AppResult<GenericStatusResponse>
    suspend fun resumeTorrent(file: String): AppResult<GenericStatusResponse>
    suspend fun deleteFile(file: String): AppResult<GenericStatusResponse>
    suspend fun getTorrentStats(file: String? = null): AppResult<TorrentStats>
    suspend fun getTorrentFiles(file: String): AppResult<TorrentFilesResponse>
    suspend fun getMediaInfo(file: String): AppResult<MediaInfoResponse>
}

class TorrentRepositoryImpl(
    private val serverApi: ServerApi,
    private val context: Context? = null,
    private val healthTracker: ServerHealthTracker? = null
) : TorrentRepository {

    private val dashboardAdapter by lazy {
        ApiClient.moshi.adapter(DownloadsDashboardResponse::class.java)
    }

    private fun getCachedDashboard(): DownloadsDashboardResponse? {
        return try {
            val cacheFile = context?.let { File(it.filesDir, "downloads_dashboard_cache.json") }
            if (cacheFile != null && cacheFile.exists() && cacheFile.length() > 0) {
                dashboardAdapter.fromJson(cacheFile.readText())
            } else null
        } catch (_: Exception) {
            null
        }
    }

    private fun saveCachedDashboard(response: DownloadsDashboardResponse) {
        try {
            val cacheFile = context?.let { File(it.filesDir, "downloads_dashboard_cache.json") } ?: return
            cacheFile.writeText(dashboardAdapter.toJson(response))
        } catch (_: Exception) {}
    }

    override fun getDownloadsDashboard(): Flow<AppResult<DownloadsDashboardResponse>> = flow {
        val isManualOffline = healthTracker?.manualOfflineMode?.value ?: false
        val localMovies = context?.let { LocalMediaScanner.scanAllMedia(it) } ?: emptyList()

        // 1. Immediately emit cached data if available so opening time is NEVER empty!
        val cached = getCachedDashboard()
        if (cached != null) {
            val mergedAvailable = (localMovies + cached.availableMovies).distinctBy { it.name }
            emit(AppResult.Success(cached.copy(availableMovies = mergedAvailable)))
        } else {
            emit(AppResult.Loading)
        }

        if (isManualOffline) {
            val offlineResponse = (cached ?: DownloadsDashboardResponse()).copy(
                systemStatus = SystemStatus(
                    mode = "offline",
                    modeLabel = healthTracker?.operatingMode?.value?.label ?: "Offline Standalone",
                    totalAvailable = (localMovies + (cached?.availableMovies ?: emptyList())).distinctBy { it.name }.size,
                    totalDownloading = 0,
                    hostIp = "Local Device"
                ),
                availableMovies = (localMovies + (cached?.availableMovies ?: emptyList())).distinctBy { it.name },
                currentlyDownloading = emptyList()
            )
            emit(AppResult.Success(offlineResponse))
            return@flow
        }

        try {
            val response = serverApi.getDownloads()
            healthTracker?.onServerSuccess()
            val mergedAvailable = (localMovies + response.availableMovies).distinctBy { it.name }
            val mergedResponse = response.copy(
                availableMovies = mergedAvailable,
                systemStatus = response.systemStatus.copy(
                    totalAvailable = mergedAvailable.size
                )
            )
            saveCachedDashboard(mergedResponse)
            emit(AppResult.Success(mergedResponse))
        } catch (e: Exception) {
            if (cached != null) {
                // Keep the cached list active on transient error
            } else if (localMovies.isNotEmpty()) {
                val fallbackResponse = DownloadsDashboardResponse(
                    systemStatus = SystemStatus(
                        mode = "offline",
                        modeLabel = "Offline (Server Unreachable)",
                        totalAvailable = localMovies.size,
                        totalDownloading = 0,
                        hostIp = "Local Device"
                    ),
                    availableMovies = localMovies,
                    currentlyDownloading = emptyList()
                )
                emit(AppResult.Success(fallbackResponse))
            } else {
                emit(AppResult.Error(e, "Error loading torrents: ${e.localizedMessage}"))
            }
        }
    }

    override suspend fun startTorrent(
        file: String?,
        magnet: String?,
        downloadOnly: Boolean?,
        fileIdx: Int?,
        episode: String?
    ): AppResult<GenericStatusResponse> {
        return try {
            val response = serverApi.startTorrent(file, magnet, downloadOnly, fileIdx, episode)
            AppResult.Success(response)
        } catch (e: Exception) {
            AppResult.Error(e, e.localizedMessage ?: "Failed to start torrent")
        }
    }

    override suspend fun stopTorrent(): AppResult<GenericStatusResponse> {
        return try {
            val response = serverApi.stopTorrent()
            AppResult.Success(response)
        } catch (e: Exception) {
            AppResult.Error(e, e.localizedMessage ?: "Failed to stop torrent")
        }
    }

    override suspend fun prioritize(file: String): AppResult<GenericStatusResponse> {
        return try {
            val response = serverApi.prioritize(file)
            AppResult.Success(response)
        } catch (e: Exception) {
            AppResult.Error(e, e.localizedMessage ?: "Failed to prioritize")
        }
    }

    override suspend fun setLowPriority(file: String): AppResult<GenericStatusResponse> {
        return try {
            val response = serverApi.setLowPriority(file)
            AppResult.Success(response)
        } catch (e: Exception) {
            AppResult.Error(e, e.localizedMessage ?: "Failed to set low priority")
        }
    }

    override suspend fun setNormalPriority(file: String): AppResult<GenericStatusResponse> {
        return try {
            val response = serverApi.setNormalPriority(file)
            AppResult.Success(response)
        } catch (e: Exception) {
            AppResult.Error(e, e.localizedMessage ?: "Failed to set normal priority")
        }
    }

    override suspend fun pauseTorrent(file: String): AppResult<GenericStatusResponse> {
        return try {
            val response = serverApi.pauseTorrent(file)
            AppResult.Success(response)
        } catch (e: Exception) {
            AppResult.Error(e, e.localizedMessage ?: "Failed to pause torrent")
        }
    }

    override suspend fun resumeTorrent(file: String): AppResult<GenericStatusResponse> {
        return try {
            val response = serverApi.resumeTorrent(file)
            AppResult.Success(response)
        } catch (e: Exception) {
            AppResult.Error(e, e.localizedMessage ?: "Failed to resume torrent")
        }
    }

    override suspend fun deleteFile(file: String): AppResult<GenericStatusResponse> {
        return try {
            val response = serverApi.deleteFile(file)
            AppResult.Success(response)
        } catch (e: Exception) {
            AppResult.Error(e, e.localizedMessage ?: "Failed to delete file")
        }
    }

    override suspend fun getTorrentStats(file: String?): AppResult<TorrentStats> {
        return try {
            val response = serverApi.getTorrentStats(file)
            AppResult.Success(response)
        } catch (e: Exception) {
            AppResult.Error(e, e.localizedMessage ?: "Failed to get stats")
        }
    }

    override suspend fun getTorrentFiles(file: String): AppResult<TorrentFilesResponse> {
        return try {
            val response = serverApi.getTorrentFiles(file)
            AppResult.Success(response)
        } catch (e: Exception) {
            AppResult.Error(e, e.localizedMessage ?: "Failed to parse torrent episodes")
        }
    }

    override suspend fun getMediaInfo(file: String): AppResult<MediaInfoResponse> {
        return try {
            val response = serverApi.getMediaInfo(file)
            AppResult.Success(response)
        } catch (e: Exception) {
            AppResult.Error(e, e.localizedMessage ?: "Failed to inspect audio tracks")
        }
    }
}
