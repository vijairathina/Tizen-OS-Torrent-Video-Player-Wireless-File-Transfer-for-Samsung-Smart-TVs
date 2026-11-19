package com.tvfilehub.core.services

import com.tvfilehub.core.models.OperatingMode
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

class ServerHealthTracker(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .build()
) {
    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private var pollingJob: Job? = null

    private val _isServerOnline = MutableStateFlow(true)
    val isServerOnline: StateFlow<Boolean> = _isServerOnline.asStateFlow()

    private val _manualOfflineMode = MutableStateFlow(false)
    val manualOfflineMode: StateFlow<Boolean> = _manualOfflineMode.asStateFlow()

    private val _operatingMode = MutableStateFlow(OperatingMode.ONLINE_BRIDGE)
    val operatingMode: StateFlow<OperatingMode> = _operatingMode.asStateFlow()

    fun onServerSuccess() {
        if (!_isServerOnline.value) {
            _isServerOnline.value = true
            updateOperatingMode()
        }
    }

    fun setManualOffline(enabled: Boolean) {
        _manualOfflineMode.value = enabled
        updateOperatingMode()
    }

    fun startMonitoring(serverBaseUrl: () -> String) {
        pollingJob?.cancel()
        pollingJob = scope.launch {
            while (isActive) {
                val url = serverBaseUrl()
                val reachable = probeServer(url)
                _isServerOnline.value = reachable
                updateOperatingMode()
                delay(8000)
            }
        }
    }

    fun stopMonitoring() {
        pollingJob?.cancel()
        pollingJob = null
    }

    private fun updateOperatingMode() {
        _operatingMode.value = when {
            _manualOfflineMode.value -> OperatingMode.OFFLINE_MANUAL
            !_isServerOnline.value -> OperatingMode.OFFLINE_FALLBACK
            else -> OperatingMode.ONLINE_BRIDGE
        }
    }

    private fun probeServer(baseUrl: String): Boolean {
        if (baseUrl.isBlank()) return false
        return try {
            val endpoint = if (baseUrl.endsWith("/")) "${baseUrl}status" else "$baseUrl/status"
            val req = Request.Builder().url(endpoint).build()
            client.newCall(req).execute().use { resp ->
                resp.isSuccessful
            }
        } catch (_: Exception) {
            false
        }
    }
}
