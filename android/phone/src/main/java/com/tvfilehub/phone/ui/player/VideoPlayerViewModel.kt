package com.tvfilehub.phone.ui.player

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tvfilehub.core.common.AppResult
import com.tvfilehub.core.models.DownloadItem
import com.tvfilehub.core.repository.TorrentRepository
import com.tvfilehub.core.services.DirectMediaDownloader
import com.tvfilehub.core.services.DownloadState
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

enum class PlayerSubtab {
    AVAILABLE,
    DOWNLOADING
}

data class VideoPlayerUiState(
    val activeSubtab: PlayerSubtab = PlayerSubtab.AVAILABLE,
    val isLoading: Boolean = false,
    val availableMovies: List<DownloadItem> = emptyList(),
    val currentlyDownloading: List<DownloadItem> = emptyList(),
    val localDownloadProgress: Map<String, Int> = emptyMap(),
    val systemStatus: com.tvfilehub.core.models.SystemStatus = com.tvfilehub.core.models.SystemStatus(),
    val errorMessage: String? = null
)

class VideoPlayerViewModel(
    private val torrentRepository: TorrentRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(VideoPlayerUiState())
    val uiState: StateFlow<VideoPlayerUiState> = _uiState.asStateFlow()

    private var pollJob: Job? = null

    init {
        loadData()
        startPolling()
    }

    fun downloadToLocal(context: Context, movie: DownloadItem) {
        val streamUrl = movie.streamUrl ?: return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                localDownloadProgress = _uiState.value.localDownloadProgress + (movie.id to 0)
            )
            DirectMediaDownloader.downloadMediaFile(
                context = context,
                url = streamUrl,
                fileName = movie.name
            ).collect { state ->
                when (state) {
                    is DownloadState.Progress -> {
                        _uiState.value = _uiState.value.copy(
                            localDownloadProgress = _uiState.value.localDownloadProgress + (movie.id to state.percent)
                        )
                    }
                    is DownloadState.Completed -> {
                        _uiState.value = _uiState.value.copy(
                            localDownloadProgress = _uiState.value.localDownloadProgress - movie.id
                        )
                        loadData()
                    }
                    is DownloadState.Failed -> {
                        _uiState.value = _uiState.value.copy(
                            localDownloadProgress = _uiState.value.localDownloadProgress - movie.id,
                            errorMessage = "Download failed: ${state.error}"
                        )
                    }
                }
            }
        }
    }

    fun setSubtab(subtab: PlayerSubtab) {
        _uiState.value = _uiState.value.copy(activeSubtab = subtab)
    }

    fun loadData() {
        viewModelScope.launch {
            torrentRepository.getDownloadsDashboard().collect { result ->
                when (result) {
                    is AppResult.Success -> {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            availableMovies = result.data.availableMovies,
                            currentlyDownloading = result.data.currentlyDownloading,
                            systemStatus = result.data.systemStatus,
                            errorMessage = null
                        )
                    }
                    is AppResult.Error -> {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            errorMessage = if (_uiState.value.availableMovies.isEmpty()) result.message else null
                        )
                    }
                    is AppResult.Loading -> {
                        if (_uiState.value.availableMovies.isEmpty() && _uiState.value.currentlyDownloading.isEmpty()) {
                            _uiState.value = _uiState.value.copy(isLoading = true)
                        }
                    }
                }
            }
        }
    }

    fun fetchEpisodes(item: DownloadItem, onResult: (List<com.tvfilehub.core.models.TorrentEpisode>) -> Unit) {
        if (item.episodes.isNotEmpty()) {
            onResult(item.episodes)
            return
        }
        viewModelScope.launch {
            when (val res = torrentRepository.getTorrentFiles(item.name)) {
                is AppResult.Success -> {
                    onResult(res.data.episodes)
                }
                else -> {
                    onResult(emptyList())
                }
            }
        }
    }

    fun playEpisode(
        item: DownloadItem,
        episode: com.tvfilehub.core.models.TorrentEpisode,
        onPlayReady: (streamUrl: String, title: String) -> Unit
    ) {
        viewModelScope.launch {
            torrentRepository.startTorrent(
                file = item.name,
                fileIdx = episode.index,
                episode = episode.name
            )
            val host = com.tvfilehub.core.network.ApiClient.hostInterceptor.getServerHost()
            val streamUrl = if (episode.streamUrl.isNotBlank()) {
                episode.streamUrl
            } else if (episode.isDownloaded) {
                "http://$host:8080/files/${java.net.URLEncoder.encode(episode.name, "UTF-8")}"
            } else {
                "http://$host:8889/${episode.index}"
            }
            val title = if (episode.name.isNotBlank()) episode.name else "${item.cleanTitle} - Episode ${episode.index + 1}"
            onPlayReady(streamUrl, title)
            loadData()
        }
    }

    private fun startPolling() {
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            while (isActive) {
                delay(3000)
                torrentRepository.getDownloadsDashboard().collect { result ->
                    if (result is AppResult.Success) {
                        _uiState.value = _uiState.value.copy(
                            availableMovies = result.data.availableMovies,
                            currentlyDownloading = result.data.currentlyDownloading
                        )
                    }
                }
            }
        }
    }

    fun prioritizeTorrent(fileName: String, onPlayReady: ((streamUrl: String, title: String) -> Unit)? = null) {
        viewModelScope.launch {
            val res = torrentRepository.prioritize(fileName)
            if (onPlayReady != null && res is AppResult.Success) {
                val streamUrl = res.data.streamUrl 
                    ?: "http://${com.tvfilehub.core.network.ApiClient.hostInterceptor.getServerHost()}:${com.tvfilehub.core.common.Constants.DEFAULT_TORRENT_STREAM_PORT}/"
                onPlayReady(streamUrl, fileName)
            }
            loadData()
        }
    }

    fun togglePauseTorrent(item: DownloadItem) {
        viewModelScope.launch {
            if (item.isPaused) {
                torrentRepository.resumeTorrent(item.name)
            } else {
                torrentRepository.pauseTorrent(item.name)
            }
            loadData()
        }
    }

    fun playDownloadingItem(item: DownloadItem, onPlayReady: (streamUrl: String, title: String) -> Unit) {
        viewModelScope.launch {
            val directUrl = item.streamUrl
            if (!directUrl.isNullOrBlank() && item.priority == "Highest") {
                onPlayReady(directUrl, item.cleanTitle)
                return@launch
            }
            // Prioritize torrent on server to ensure HTTP streaming is running
            when (val res = torrentRepository.prioritize(item.name)) {
                is AppResult.Success -> {
                    val streamUrl = res.data.streamUrl 
                        ?: item.streamUrl 
                        ?: "http://${com.tvfilehub.core.network.ApiClient.hostInterceptor.getServerHost()}:${com.tvfilehub.core.common.Constants.DEFAULT_TORRENT_STREAM_PORT}/"
                    onPlayReady(streamUrl, item.cleanTitle)
                }
                is AppResult.Error -> {
                    val fallbackUrl = item.streamUrl 
                        ?: "http://${com.tvfilehub.core.network.ApiClient.hostInterceptor.getServerHost()}:${com.tvfilehub.core.common.Constants.DEFAULT_TORRENT_STREAM_PORT}/"
                    onPlayReady(fallbackUrl, item.cleanTitle)
                }
                else -> {}
            }
            loadData()
        }
    }

    fun setLowPriority(fileName: String) {
        viewModelScope.launch {
            torrentRepository.setLowPriority(fileName)
            loadData()
        }
    }

    fun setNormalPriority(fileName: String) {
        viewModelScope.launch {
            torrentRepository.setNormalPriority(fileName)
            loadData()
        }
    }

    fun deleteDownload(fileName: String) {
        viewModelScope.launch {
            torrentRepository.deleteFile(fileName)
            loadData()
        }
    }

    fun startFromUrlOrMagnet(urlOrMagnet: String) {
        viewModelScope.launch {
            if (urlOrMagnet.startsWith("magnet:", ignoreCase = true)) {
                torrentRepository.startTorrent(magnet = urlOrMagnet)
            } else {
                torrentRepository.startTorrent(file = urlOrMagnet)
            }
            loadData()
        }
    }

    override fun onCleared() {
        super.onCleared()
        pollJob?.cancel()
    }
}
