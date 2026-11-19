package com.tvfilehub.core.services

import android.content.Context
import android.os.Environment
import androidx.core.content.ContextCompat
import com.tvfilehub.core.common.ByteFormatter
import com.tvfilehub.core.common.cleanMediaTitle
import com.tvfilehub.core.models.DownloadItem
import com.tvfilehub.core.models.StorageSource
import java.io.File
import java.util.Locale

object LocalMediaScanner {

    private val VIDEO_EXTENSIONS = setOf("mp4", "mkv", "avi", "webm", "mov", "ts", "flv", "m4v")

    fun getLocalMoviesDirectory(context: Context): File {
        val moviesDir = context.getExternalFilesDir(Environment.DIRECTORY_MOVIES)
            ?: File(context.filesDir, "movies")
        val linkPlayDir = File(moviesDir, "LinkPlay")
        if (!linkPlayDir.exists()) {
            linkPlayDir.mkdirs()
        }
        return linkPlayDir
    }

    fun getMountedUsbDirectories(context: Context): List<File> {
        val usbDirs = mutableListOf<File>()
        try {
            val externalDirs = ContextCompat.getExternalFilesDirs(context, null)
            for (dir in externalDirs) {
                if (dir != null && Environment.isExternalStorageRemovable(dir)) {
                    val usbLinkPlay = File(dir, "LinkPlay")
                    if (!usbLinkPlay.exists()) {
                        usbLinkPlay.mkdirs()
                    }
                    usbDirs.add(usbLinkPlay)
                }
            }

            // Also check standard Android TV USB mounts in /storage/
            val storageRoot = File("/storage")
            if (storageRoot.exists() && storageRoot.isDirectory) {
                storageRoot.listFiles()?.forEach { mount ->
                    if (mount.isDirectory && mount.name != "emulated" && mount.name != "self") {
                        if (mount.canRead()) {
                            usbDirs.add(mount)
                        }
                    }
                }
            }
        } catch (_: Exception) {}
        return usbDirs.distinctBy { it.absolutePath }
    }

    fun scanAllMedia(context: Context): List<DownloadItem> {
        val items = mutableListOf<DownloadItem>()

        // 1. Scan Local Storage
        val localDir = getLocalMoviesDirectory(context)
        scanDirectory(localDir, StorageSource.LOCAL_STORAGE, items)

        // 2. Scan USB Drives
        val usbDirs = getMountedUsbDirectories(context)
        for (uDir in usbDirs) {
            scanDirectory(uDir, StorageSource.USB_DRIVE, items)
        }

        return items.sortedByDescending { it.size }
    }

    private fun scanDirectory(dir: File, source: StorageSource, outList: MutableList<DownloadItem>) {
        if (!dir.exists() || !dir.isDirectory) return

        try {
            val files = dir.listFiles() ?: return
            for (file in files) {
                if (file.isFile) {
                    val ext = file.extension.lowercase(Locale.ROOT)
                    if (VIDEO_EXTENSIONS.contains(ext)) {
                        val sizeBytes = file.length()
                        val rawName = file.name
                        val clean = rawName.cleanMediaTitle()
                        val item = DownloadItem(
                            id = "local_${file.absolutePath.hashCode()}",
                            name = rawName,
                            cleanTitle = clean,
                            size = sizeBytes,
                            sizeFormatted = ByteFormatter.format(sizeBytes),
                            priority = "Local",
                            priorityBadge = source.label,
                            status = "Ready to Play",
                            progress = 100.0,
                            completed = true,
                            streamUrl = "file://${file.absolutePath}",
                            storageSource = source,
                            localFilePath = file.absolutePath
                        )
                        outList.add(item)
                    }
                } else if (file.isDirectory && !file.name.startsWith(".")) {
                    // One level deeper for folders
                    val subFiles = file.listFiles() ?: emptyArray()
                    for (sub in subFiles) {
                        if (sub.isFile) {
                            val ext = sub.extension.lowercase(Locale.ROOT)
                            if (VIDEO_EXTENSIONS.contains(ext)) {
                                val sizeBytes = sub.length()
                                val rawName = sub.name
                                val clean = rawName.cleanMediaTitle()
                                val item = DownloadItem(
                                    id = "local_${sub.absolutePath.hashCode()}",
                                    name = rawName,
                                    cleanTitle = clean,
                                    size = sizeBytes,
                                    sizeFormatted = ByteFormatter.format(sizeBytes),
                                    priority = "Local",
                                    priorityBadge = source.label,
                                    status = "Ready to Play",
                                    progress = 100.0,
                                    completed = true,
                                    streamUrl = "file://${sub.absolutePath}",
                                    storageSource = source,
                                    localFilePath = sub.absolutePath
                                )
                                outList.add(item)
                            }
                        }
                    }
                }
            }
        } catch (_: Exception) {}
    }
}
