package com.tvfilehub.tv

import android.app.Application
import android.content.Context
import com.tvfilehub.core.common.Constants
import com.tvfilehub.core.database.AppDatabase
import com.tvfilehub.core.network.ApiClient
import com.tvfilehub.core.network.ServerWebSocketClient
import com.tvfilehub.core.repository.*
import com.tvfilehub.core.services.ServerHealthTracker

class TvApp : Application() {

    lateinit var database: AppDatabase
        private set

    lateinit var mediaRepository: MediaRepository
        private set

    lateinit var torrentRepository: TorrentRepository
        private set

    lateinit var fileTransferRepository: FileTransferRepository
        private set

    lateinit var webSocketClient: ServerWebSocketClient
        private set

    lateinit var serverHealthTracker: ServerHealthTracker
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this

        serverHealthTracker = ServerHealthTracker()
        val prefs = getSharedPreferences("tvfilehub_tv_prefs", Context.MODE_PRIVATE)
        val savedServerIp = prefs.getString(Constants.PREF_KEY_SERVER_IP, Constants.DEFAULT_SERVER_HOST) ?: Constants.DEFAULT_SERVER_HOST
        ApiClient.updateServerAddress(savedServerIp)

        val isManualOffline = prefs.getBoolean("pref_manual_offline_mode", false)
        serverHealthTracker.setManualOffline(isManualOffline)
        serverHealthTracker.startMonitoring { ApiClient.getBaseUrl() }

        database = AppDatabase.getInstance(this)
        mediaRepository = MediaRepositoryImpl(ApiClient.serverApi, database.mediaDao(), this, serverHealthTracker)
        torrentRepository = TorrentRepositoryImpl(ApiClient.serverApi, this, serverHealthTracker)
        webSocketClient = ServerWebSocketClient()
        fileTransferRepository = FileTransferRepositoryImpl(ApiClient.serverApi, webSocketClient)
    }

    companion object {
        lateinit var instance: TvApp
            private set
    }
}
