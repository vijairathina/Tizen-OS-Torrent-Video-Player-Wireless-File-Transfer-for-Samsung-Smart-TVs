package com.tvfilehub.phone.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tvfilehub.core.common.AppResult
import com.tvfilehub.core.database.entities.ResumePointEntity
import com.tvfilehub.core.models.DownloadItem
import com.tvfilehub.core.models.SystemStatus
import com.tvfilehub.core.repository.MediaRepository
import com.tvfilehub.core.repository.TorrentRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SpotlightMedia(
    val title: String,
    val streamUrl: String,
    val resumePositionSec: Long = 0L,
    val durationSec: Long = 0L,
    val isResume: Boolean = false,
    val sizeFormatted: String = "",
    val badge: String = "LATEST DOWNLOAD",
    val originalItem: DownloadItem? = null
)

data class HomeUiState(
    val isLoading: Boolean = false,
    val spotlight: SpotlightMedia? = null,
    val continueWatching: List<ResumePointEntity> = emptyList(),
    val recentMedia: List<DownloadItem> = emptyList(),
    val availableCount: Int = 0,
    val downloadingCount: Int = 0,
    val systemStatus: SystemStatus = SystemStatus(),
    val errorMessage: String? = null
)

class HomeViewModel(
    private val mediaRepository: MediaRepository,
    private val torrentRepository: TorrentRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private var lastAvailableMovies: List<DownloadItem> = emptyList()
    private var lastContinueWatching: List<ResumePointEntity> = emptyList()

    init {
        loadDashboard()
        observeContinueWatching()
    }

    fun loadDashboard() {
        viewModelScope.launch {
            if (lastAvailableMovies.isEmpty() && lastContinueWatching.isEmpty()) {
                _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            }
            torrentRepository.getDownloadsDashboard().collect { result ->
                when (result) {
                    is AppResult.Success -> {
                        val data = result.data
                        lastAvailableMovies = data.availableMovies
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            availableCount = data.availableMovies.size,
                            downloadingCount = data.currentlyDownloading.size,
                            systemStatus = data.systemStatus,
                            errorMessage = null
                        )
                        recomputeSpotlight()
                    }
                    is AppResult.Error -> {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            errorMessage = if (lastAvailableMovies.isEmpty()) result.message else null
                        )
                    }
                    is AppResult.Loading -> {
                        if (lastAvailableMovies.isEmpty() && lastContinueWatching.isEmpty()) {
                            _uiState.value = _uiState.value.copy(isLoading = true)
                        }
                    }
                }
            }
        }
    }

    private fun observeContinueWatching() {
        viewModelScope.launch {
            mediaRepository.getContinueWatching().collect { list ->
                lastContinueWatching = list
                recomputeSpotlight()
            }
        }
    }

    private fun recomputeSpotlight() {
        val resumeItem = lastContinueWatching.firstOrNull()
        val spotlight = if (resumeItem != null && resumeItem.positionSeconds > 5) {
            SpotlightMedia(
                title = resumeItem.title,
                streamUrl = resumeItem.streamUrl,
                resumePositionSec = resumeItem.positionSeconds,
                durationSec = resumeItem.durationSeconds,
                isResume = true,
                badge = "CONTINUE WATCHING"
            )
        } else if (lastAvailableMovies.isNotEmpty()) {
            val latest = lastAvailableMovies.first()
            SpotlightMedia(
                title = latest.cleanTitle,
                streamUrl = latest.effectivePlayUrl,
                sizeFormatted = latest.sizeFormatted,
                isResume = false,
                badge = if (latest.isDownloading) "DOWNLOADING" else "LATEST DOWNLOAD",
                originalItem = latest
            )
        } else {
            null
        }

        _uiState.value = _uiState.value.copy(
            spotlight = spotlight,
            continueWatching = lastContinueWatching,
            recentMedia = lastAvailableMovies.take(10)
        )
    }
}
