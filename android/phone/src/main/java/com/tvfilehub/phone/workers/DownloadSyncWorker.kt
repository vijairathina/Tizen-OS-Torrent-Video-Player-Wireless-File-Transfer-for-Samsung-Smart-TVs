package com.tvfilehub.phone.workers

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.tvfilehub.core.database.AppDatabase
import com.tvfilehub.core.database.entities.CachedMediaEntity
import com.tvfilehub.core.network.ApiClient

class DownloadSyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        return try {
            val response = ApiClient.serverApi.getDownloads()
            val database = AppDatabase.getInstance(applicationContext)

            val entities = response.availableMovies.map { m ->
                CachedMediaEntity(
                    id = m.id,
                    name = m.name,
                    cleanTitle = m.cleanTitle,
                    sizeBytes = m.size,
                    sizeFormatted = m.sizeFormatted,
                    streamUrl = m.streamUrl ?: "",
                    isCompleted = m.completed
                )
            }
            database.mediaDao().insertCachedMedia(entities)

            // Notify if newly completed downloads exist
            val newlyCompleted = response.availableMovies.filter { it.completed }
            if (newlyCompleted.isNotEmpty()) {
                showNotification("Server Downloads", "${newlyCompleted.size} movies ready for streaming!")
            }

            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    private fun showNotification(title: String, message: String) {
        val manager = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channelId = "tvhub_downloads_channel"

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "TV Hub Downloads",
                NotificationManager.IMPORTANCE_LOW
            )
            manager.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(applicationContext, channelId)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle(title)
            .setContentText(message)
            .setAutoCancel(true)
            .build()

        manager.notify(101, notification)
    }
}
