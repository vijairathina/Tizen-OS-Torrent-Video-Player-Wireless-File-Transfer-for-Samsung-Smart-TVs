package com.tvfilehub.core.services

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

sealed class DownloadState {
    data class Progress(val percent: Int, val downloadedBytes: Long, val totalBytes: Long) : DownloadState()
    data class Completed(val file: File) : DownloadState()
    data class Failed(val error: String) : DownloadState()
}

object DirectMediaDownloader {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    fun downloadMediaFile(
        context: Context,
        url: String,
        fileName: String,
        targetDir: File = LocalMediaScanner.getLocalMoviesDirectory(context)
    ): Flow<DownloadState> = flow {
        try {
            if (!targetDir.exists()) targetDir.mkdirs()
            val destination = File(targetDir, fileName)
            val tempFile = File(targetDir, "$fileName.downloading")

            val request = Request.Builder().url(url).build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    emit(DownloadState.Failed("Server returned HTTP ${response.code}"))
                    return@flow
                }
                val body = response.body ?: run {
                    emit(DownloadState.Failed("Empty response body"))
                    return@flow
                }
                val totalBytes = body.contentLength()
                var downloadedBytes = 0L

                body.byteStream().use { input ->
                    FileOutputStream(tempFile).use { output ->
                        val buffer = ByteArray(64 * 1024)
                        var read: Int
                        var lastPercent = -1
                        while (input.read(buffer).also { read = it } != -1) {
                            output.write(buffer, 0, read)
                            downloadedBytes += read
                            if (totalBytes > 0) {
                                val percent = ((downloadedBytes * 100) / totalBytes).toInt()
                                if (percent != lastPercent) {
                                    lastPercent = percent
                                    emit(DownloadState.Progress(percent, downloadedBytes, totalBytes))
                                }
                            }
                        }
                        output.flush()
                    }
                }
                if (destination.exists()) destination.delete()
                tempFile.renameTo(destination)
                emit(DownloadState.Completed(destination))
            }
        } catch (e: Exception) {
            emit(DownloadState.Failed(e.localizedMessage ?: "Download failed"))
        }
    }.flowOn(Dispatchers.IO)
}
