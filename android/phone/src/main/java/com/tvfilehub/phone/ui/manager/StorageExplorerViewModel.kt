package com.tvfilehub.phone.ui.manager

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tvfilehub.core.common.AppResult
import com.tvfilehub.core.models.DownloadItem
import com.tvfilehub.core.models.FileNode
import com.tvfilehub.core.repository.MediaRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class StorageExplorerUiState(
    val currentPath: String = "/Server/Media/",
    val fileNodes: List<FileNode> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null
)

class StorageExplorerViewModel(
    private val mediaRepository: MediaRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(StorageExplorerUiState())
    val uiState: StateFlow<StorageExplorerUiState> = _uiState.asStateFlow()

    init {
        loadMediaFiles()
    }

    fun loadMediaFiles() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            mediaRepository.getAvailableMovies().collect { result ->
                when (result) {
                    is AppResult.Success -> {
                        val nodes = result.data.map { item ->
                            val ext = item.name.substringAfterLast('.', "")
                            FileNode(
                                name = item.name,
                                path = item.effectivePlayUrl,
                                isDirectory = false,
                                size = item.size,
                                sizeFormatted = item.sizeFormatted,
                                extension = ext
                            )
                        }
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            fileNodes = nodes
                        )
                    }
                    is AppResult.Error -> {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            errorMessage = result.message
                        )
                    }
                    is AppResult.Loading -> {
                        _uiState.value = _uiState.value.copy(isLoading = true)
                    }
                }
            }
        }
    }
}
