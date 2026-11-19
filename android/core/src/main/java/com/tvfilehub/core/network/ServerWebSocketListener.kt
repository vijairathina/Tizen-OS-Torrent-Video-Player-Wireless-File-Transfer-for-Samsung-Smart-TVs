package com.tvfilehub.core.network

import com.tvfilehub.core.models.TorrentStats
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import okhttp3.*
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class ServerWebSocketClient(
    private val okHttpClient: OkHttpClient = ApiClient.okHttpClient
) {
    private var webSocket: WebSocket? = null
    private val isConnected = AtomicBoolean(false)
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val _events = MutableSharedFlow<WebSocketEvent>(extraBufferCapacity = 64)
    val events: SharedFlow<WebSocketEvent> = _events.asSharedFlow()

    private val messageAdapter = ApiClient.moshi.adapter(RawWebSocketMessage::class.java)

    fun connect() {
        if (isConnected.get()) return

        val wsUrl = ApiClient.getWebSocketUrl()
        val request = Request.Builder().url(wsUrl).build()

        webSocket = okHttpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                isConnected.set(true)
                scope.launch {
                    _events.emit(WebSocketEvent.ConnectionState(true))
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                scope.launch {
                    try {
                        val parsed = messageAdapter.fromJson(text)
                        val event: WebSocketEvent = when (parsed?.type) {
                            "connected" -> WebSocketEvent.Connected(parsed.message ?: "Online")
                            "file_upload_start" -> WebSocketEvent.FileUploadStart(
                                parsed.fileId ?: "",
                                parsed.filename ?: "",
                                parsed.totalBytes ?: 0L
                            )
                            "file_upload_complete" -> WebSocketEvent.FileUploadComplete(
                                parsed.fileId ?: "",
                                parsed.filename ?: "",
                                parsed.totalBytes ?: 0L,
                                parsed.downloadUrl ?: ""
                            )
                            "torrent_stats_update" -> WebSocketEvent.TorrentStatsUpdate(
                                parsed.streamUrl,
                                parsed.title,
                                TorrentStats(name = parsed.title ?: "")
                            )
                            "storage_target_update" -> WebSocketEvent.StorageTargetUpdate(
                                parsed.target ?: "USB Drive"
                            )
                            "file_deleted" -> WebSocketEvent.FileDeleted(
                                parsed.filename ?: ""
                            )
                            else -> WebSocketEvent.GenericMessage(parsed?.type ?: "unknown", text)
                        }
                        _events.emit(event)
                    } catch (e: Exception) {
                        _events.emit(WebSocketEvent.GenericMessage("raw", text))
                    }
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                isConnected.set(false)
                scope.launch {
                    _events.emit(WebSocketEvent.ConnectionState(false))
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                isConnected.set(false)
                scope.launch {
                    _events.emit(WebSocketEvent.ConnectionState(false))
                }
            }
        })
    }

    fun sendMessage(text: String): Boolean {
        return webSocket?.send(text) ?: false
    }

    fun disconnect() {
        isConnected.set(false)
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
    }
}
