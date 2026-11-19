package com.tvfilehub.core.repository

import com.tvfilehub.core.common.AppResult
import com.tvfilehub.core.models.FileUploadResponse
import com.tvfilehub.core.network.ServerApi
import com.tvfilehub.core.network.ServerWebSocketClient
import com.tvfilehub.core.network.WebSocketEvent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File

interface FileTransferRepository {
    fun uploadFile(file: File): Flow<AppResult<FileUploadResponse>>
    suspend fun getStorageTarget(): AppResult<String>
    val webSocketEvents: Flow<WebSocketEvent>
    fun connectWebSocket()
    fun disconnectWebSocket()
    fun sendWebSocketMessage(message: String): Boolean
}

class FileTransferRepositoryImpl(
    private val serverApi: ServerApi,
    private val webSocketClient: ServerWebSocketClient
) : FileTransferRepository {

    override val webSocketEvents: Flow<WebSocketEvent>
        get() = webSocketClient.events

    override fun connectWebSocket() {
        webSocketClient.connect()
    }

    override fun disconnectWebSocket() {
        webSocketClient.disconnect()
    }

    override fun sendWebSocketMessage(message: String): Boolean {
        return webSocketClient.sendMessage(message)
    }

    override fun uploadFile(file: File): Flow<AppResult<FileUploadResponse>> = flow {
        emit(AppResult.Loading)
        try {
            val reqFile = file.asRequestBody("application/octet-stream".toMediaTypeOrNull())
            val body = MultipartBody.Part.createFormData("file", file.name, reqFile)
            val response = serverApi.uploadFile(body)
            emit(AppResult.Success(response))
        } catch (e: Exception) {
            emit(AppResult.Error(e, "Upload failed: ${e.localizedMessage}"))
        }
    }

    override suspend fun getStorageTarget(): AppResult<String> {
        return try {
            val res = serverApi.getStorageTarget()
            AppResult.Success(res.target)
        } catch (e: Exception) {
            AppResult.Error(e, e.localizedMessage ?: "Failed to get storage target")
        }
    }
}
