package com.tvfilehub.phone.ui.transfer

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tvfilehub.core.common.AppResult
import com.tvfilehub.core.network.WebSocketEvent
import com.tvfilehub.core.repository.FileTransferRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream

data class UploadTask(
    val fileName: String,
    val isUploading: Boolean = false,
    val isSuccess: Boolean = false,
    val error: String? = null
)

data class FileTransferUiState(
    val storageTarget: String = "Detecting storage...",
    val currentUpload: UploadTask? = null,
    val recentTransfers: List<String> = emptyList(),
    val isWebSocketOnline: Boolean = false
)

class FileTransferViewModel(
    private val repository: FileTransferRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(FileTransferUiState())
    val uiState: StateFlow<FileTransferUiState> = _uiState.asStateFlow()

    init {
        repository.connectWebSocket()
        observeWebSocketEvents()
        fetchStorageTarget()
    }

    private fun sanitizeTarget(target: String): String {
        return target.replace("Server (Pi / Zero TV Memory)", "Server Storage (Zero TV Memory)")
            .replace("Pi", "Server")
    }

    private fun fetchStorageTarget() {
        viewModelScope.launch {
            val res = repository.getStorageTarget()
            if (res is AppResult.Success) {
                _uiState.value = _uiState.value.copy(storageTarget = sanitizeTarget(res.data))
            }
        }
    }

    private fun observeWebSocketEvents() {
        viewModelScope.launch {
            repository.webSocketEvents.collect { event ->
                when (event) {
                    is WebSocketEvent.ConnectionState -> {
                        _uiState.value = _uiState.value.copy(isWebSocketOnline = event.isConnected)
                    }
                    is WebSocketEvent.StorageTargetUpdate -> {
                        _uiState.value = _uiState.value.copy(storageTarget = sanitizeTarget(event.target))
                    }
                    is WebSocketEvent.FileUploadComplete -> {
                        val updated = listOf(event.filename) + _uiState.value.recentTransfers
                        _uiState.value = _uiState.value.copy(recentTransfers = updated.take(20))
                    }
                    else -> {}
                }
            }
        }
    }

    fun uploadFromUri(context: Context, uri: Uri) {
        viewModelScope.launch {
            val file = copyUriToTempFile(context, uri) ?: return@launch
            _uiState.value = _uiState.value.copy(
                currentUpload = UploadTask(fileName = file.name, isUploading = true)
            )

            repository.uploadFile(file).collect { result ->
                when (result) {
                    is AppResult.Success -> {
                        _uiState.value = _uiState.value.copy(
                            currentUpload = UploadTask(fileName = file.name, isUploading = false, isSuccess = true)
                        )
                        file.delete()
                    }
                    is AppResult.Error -> {
                        _uiState.value = _uiState.value.copy(
                            currentUpload = UploadTask(fileName = file.name, isUploading = false, error = result.message)
                        )
                        file.delete()
                    }
                    is AppResult.Loading -> {
                        _uiState.value = _uiState.value.copy(
                            currentUpload = UploadTask(fileName = file.name, isUploading = true)
                        )
                    }
                }
            }
        }
    }

    private fun copyUriToTempFile(context: Context, uri: Uri): File? {
        return try {
            var fileName = "upload_${System.currentTimeMillis()}"
            context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (cursor.moveToFirst() && nameIndex >= 0) {
                    fileName = cursor.getString(nameIndex)
                }
            }
            val tempFile = File(context.cacheDir, fileName)
            context.contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(tempFile).use { output ->
                    input.copyTo(output)
                }
            }
            tempFile
        } catch (e: Exception) {
            null
        }
    }

    override fun onCleared() {
        super.onCleared()
        repository.disconnectWebSocket()
    }
}
