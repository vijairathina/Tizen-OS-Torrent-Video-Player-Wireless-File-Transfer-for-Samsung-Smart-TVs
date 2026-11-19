package com.tvfilehub.tv.navigation

import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import com.tvfilehub.core.common.AppResult
import com.tvfilehub.core.common.Constants
import com.tvfilehub.core.common.NetworkUtils
import com.tvfilehub.core.database.entities.ResumePointEntity
import com.tvfilehub.core.models.DownloadItem
import com.tvfilehub.core.models.FileNode
import com.tvfilehub.core.models.OperatingMode
import com.tvfilehub.core.network.ApiClient
import com.tvfilehub.core.network.WebSocketEvent
import com.tvfilehub.core.services.LocalMediaScanner
import com.tvfilehub.tv.TvApp
import com.tvfilehub.tv.receiver.TvEmbeddedReceiverServer
import com.tvfilehub.tv.ui.components.TvHeaderBar
import com.tvfilehub.tv.ui.dialogs.TvAdBlockGuideDialog
import com.tvfilehub.tv.ui.dialogs.TvSettingsDialog
import com.tvfilehub.tv.ui.dialogs.TvUrlStreamDialog
import com.tvfilehub.tv.ui.home.TvHomeScreen
import com.tvfilehub.tv.ui.manager.TvFileManagerScreen
import com.tvfilehub.tv.ui.player.TvPlaybackActivity
import com.tvfilehub.tv.ui.player.TvPlayerHubScreen
import com.tvfilehub.tv.ui.receiver.TvReceiverScreen
import com.tvfilehub.tv.ui.theme.TvBackground
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

@Composable
fun TvNavHost() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val prefs = remember { context.getSharedPreferences("tvfilehub_tv_prefs", Context.MODE_PRIVATE) }

    val operatingMode by TvApp.instance.serverHealthTracker.operatingMode.collectAsState()
    val manualOffline by TvApp.instance.serverHealthTracker.manualOfflineMode.collectAsState()
    val isOfflineMode = operatingMode != OperatingMode.ONLINE_BRIDGE
    val localIp = remember { NetworkUtils.getLocalIpAddress() }

    var currentDestination by remember { mutableStateOf(TvDestination.Home) }
    var availableMovies by remember { mutableStateOf<List<DownloadItem>>(emptyList()) }
    var downloadingMovies by remember { mutableStateOf<List<DownloadItem>>(emptyList()) }
    var continueWatching by remember { mutableStateOf<List<ResumePointEntity>>(emptyList()) }
    var storageFiles by remember { mutableStateOf<List<FileNode>>(emptyList()) }
    var receivedHistory by remember { mutableStateOf<List<String>>(emptyList()) }

    var serverIp by remember {
        mutableStateOf(prefs.getString(Constants.PREF_KEY_SERVER_IP, Constants.DEFAULT_SERVER_HOST) ?: Constants.DEFAULT_SERVER_HOST)
    }
    var storageMode by remember {
        mutableStateOf(prefs.getString(Constants.PREF_KEY_STORAGE_MODE, Constants.STORAGE_MODE_USB) ?: Constants.STORAGE_MODE_USB)
    }

    val refreshDashboard = {
        scope.launch {
            TvApp.instance.torrentRepository.getDownloadsDashboard().collect { res ->
                if (res is AppResult.Success) {
                    availableMovies = res.data.availableMovies
                    downloadingMovies = res.data.currentlyDownloading
                    storageFiles = res.data.availableMovies.map { m ->
                        FileNode(
                            name = m.name,
                            path = m.effectivePlayUrl,
                            isDirectory = false,
                            size = m.size,
                            sizeFormatted = m.sizeFormatted,
                            extension = m.name.substringAfterLast('.', "")
                        )
                    }
                }
            }
        }
    }

    val tvReceiverServer = remember {
        TvEmbeddedReceiverServer(context) { receivedFile ->
            scope.launch(Dispatchers.Main) {
                receivedHistory = listOf(receivedFile.name) + receivedHistory
                Toast.makeText(context, "📥 Received: ${receivedFile.name}", Toast.LENGTH_LONG).show()
                refreshDashboard()
            }
        }
    }

    // Configure and start embedded server when receiver screen is shown or in offline mode
    LaunchedEffect(isOfflineMode, currentDestination, storageMode) {
        val targetDir = if (storageMode == Constants.STORAGE_MODE_USB) {
            LocalMediaScanner.getMountedUsbDirectories(context).firstOrNull() ?: LocalMediaScanner.getLocalMoviesDirectory(context)
        } else {
            LocalMediaScanner.getLocalMoviesDirectory(context)
        }
        tvReceiverServer.targetDirectory = targetDir
        tvReceiverServer.start()
    }

    DisposableEffect(Unit) {
        onDispose {
            tvReceiverServer.stop()
        }
    }

    var showUrlDialog by remember { mutableStateOf(false) }
    var showSettingsDialog by remember { mutableStateOf(false) }
    var showAdBlockDialog by remember { mutableStateOf(false) }

    // Polling and Database Observers
    LaunchedEffect(Unit) {
        refreshDashboard()
        TvApp.instance.fileTransferRepository.connectWebSocket()

        // Observe Continue Watching
        launch {
            TvApp.instance.mediaRepository.getContinueWatching().collect { list ->
                continueWatching = list
            }
        }

        // Observe WebSocket incoming files
        launch {
            TvApp.instance.fileTransferRepository.webSocketEvents.collect { event ->
                if (event is WebSocketEvent.FileUploadComplete) {
                    receivedHistory = listOf(event.filename) + receivedHistory
                    refreshDashboard()
                }
            }
        }

        // Periodic 3s poll
        launch {
            while (isActive) {
                delay(3000)
                refreshDashboard()
            }
        }
    }

    val playMedia = { streamUrl: String, title: String, startPosSec: Long ->
        val intent = Intent(context, TvPlaybackActivity::class.java).apply {
            putExtra(TvPlaybackActivity.EXTRA_STREAM_URL, streamUrl)
            putExtra(TvPlaybackActivity.EXTRA_TITLE, title)
            putExtra(TvPlaybackActivity.EXTRA_START_POS, startPosSec * 1000)
        }
        context.startActivity(intent)
    }

    Box(modifier = Modifier.fillMaxSize().background(TvBackground)) {
        Column(modifier = Modifier.fillMaxSize()) {
            TvHeaderBar(
                currentDestination = currentDestination,
                onSelectDestination = { currentDestination = it },
                onBoostClick = {
                    Toast.makeText(context, "⚡ TV Memory Boosted! Cache cleared.", Toast.LENGTH_SHORT).show()
                }
            )

            Box(modifier = Modifier.weight(1f)) {
                when (currentDestination) {
                    TvDestination.Home -> TvHomeScreen(
                        featuredMovie = availableMovies.firstOrNull(),
                        continueWatching = continueWatching,
                        serverIp = serverIp,
                        onNavigate = { currentDestination = it },
                        onPlayMedia = { url, title, pos -> playMedia(url, title, pos) },
                        onOpenAdBlockModal = { showAdBlockDialog = true }
                    )

                    TvDestination.Player -> TvPlayerHubScreen(
                        availableMovies = availableMovies,
                        currentlyDownloading = downloadingMovies,
                        onPlayMovie = { url, title -> playMedia(url, title, 0L) },
                        onPrioritize = { fileName ->
                            scope.launch {
                                TvApp.instance.torrentRepository.prioritize(fileName)
                                refreshDashboard()
                            }
                        },
                        onSetLowPriority = { fileName ->
                            scope.launch {
                                TvApp.instance.torrentRepository.setLowPriority(fileName)
                                refreshDashboard()
                            }
                        },
                        onSetNormalPriority = { fileName ->
                            scope.launch {
                                TvApp.instance.torrentRepository.setNormalPriority(fileName)
                                refreshDashboard()
                            }
                        },
                        onDelete = { fileName ->
                            scope.launch {
                                TvApp.instance.torrentRepository.deleteFile(fileName)
                                refreshDashboard()
                            }
                        },
                        onRefresh = { refreshDashboard() },
                        onOpenUrlDialog = { showUrlDialog = true },
                        onOpenStorageDialog = { currentDestination = TvDestination.FileManager },
                        onOpenSettingsDialog = { showSettingsDialog = true }
                    )

                    TvDestination.Receiver -> TvReceiverScreen(
                        serverIp = serverIp,
                        localIp = localIp,
                        receiverPort = tvReceiverServer.activePort,
                        isOfflineMode = isOfflineMode,
                        storageTarget = if (storageMode == "usb") "USB Drive" else if (storageMode == "local") "TV Flash" else "Server",
                        receivedFiles = receivedHistory,
                        onClearHistory = { receivedHistory = emptyList() },
                        onToggleStorageTarget = {
                            val nextMode = if (storageMode == "usb") "local" else "usb"
                            storageMode = nextMode
                            prefs.edit().putString(Constants.PREF_KEY_STORAGE_MODE, nextMode).apply()
                            tvReceiverServer.targetDirectory = if (nextMode == "usb") {
                                LocalMediaScanner.getMountedUsbDirectories(context).firstOrNull() ?: LocalMediaScanner.getLocalMoviesDirectory(context)
                            } else {
                                LocalMediaScanner.getLocalMoviesDirectory(context)
                            }
                        },
                        onOpenSettings = { showSettingsDialog = true }
                    )

                    TvDestination.FileManager -> TvFileManagerScreen(
                        files = storageFiles,
                        onPlayMedia = { url, title -> playMedia(url, title, 0L) },
                        onRefresh = { refreshDashboard() }
                    )
                }
            }
        }

        // Dialogs
        if (showUrlDialog) {
            TvUrlStreamDialog(
                onDismiss = { showUrlDialog = false },
                onSubmit = { url ->
                    scope.launch {
                        if (url.startsWith("magnet:", ignoreCase = true)) {
                            TvApp.instance.torrentRepository.startTorrent(magnet = url)
                        } else {
                            TvApp.instance.torrentRepository.startTorrent(file = url)
                        }
                        refreshDashboard()
                    }
                    showUrlDialog = false
                }
            )
        }

        if (showSettingsDialog) {
            TvSettingsDialog(
                currentServerIp = serverIp,
                currentStorageMode = storageMode,
                currentManualOffline = manualOffline,
                onSaveServerIp = { newIp ->
                    serverIp = newIp
                    prefs.edit().putString(Constants.PREF_KEY_SERVER_IP, newIp).apply()
                    ApiClient.updateServerAddress(newIp)
                },
                onSaveStorageMode = { newMode ->
                    storageMode = newMode
                    prefs.edit().putString(Constants.PREF_KEY_STORAGE_MODE, newMode).apply()
                },
                onSaveManualOffline = { enabled ->
                    prefs.edit().putBoolean("pref_manual_offline_mode", enabled).apply()
                    TvApp.instance.serverHealthTracker.setManualOffline(enabled)
                    refreshDashboard()
                },
                onDismiss = { showSettingsDialog = false }
            )
        }

        if (showAdBlockDialog) {
            TvAdBlockGuideDialog(
                onDismiss = { showAdBlockDialog = false }
            )
        }
    }
}
