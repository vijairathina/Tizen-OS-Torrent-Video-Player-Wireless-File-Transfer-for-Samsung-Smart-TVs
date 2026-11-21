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

        // 1. Scan Local App Directory
        val localDir = getLocalMoviesDirectory(context)
        scanDirectory(localDir, StorageSource.LOCAL_STORAGE, items)

        // 2. Scan Standard Public Download Directory (/sdcard/Download)
        try {
            val publicDownloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (publicDownloads != null && publicDownloads.exists()) {
                scanDirectory(publicDownloads, StorageSource.LOCAL_STORAGE, items)
                val dlLinkPlay = File(publicDownloads, "LinkPlay")
                if (dlLinkPlay.exists()) scanDirectory(dlLinkPlay, StorageSource.LOCAL_STORAGE, items)
            }
        } catch (_: Exception) {}

        // 3. Scan Standard Public Movies Directory (/sdcard/Movies)
        try {
            val publicMovies = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES)
            if (publicMovies != null && publicMovies.exists()) {
                scanDirectory(publicMovies, StorageSource.LOCAL_STORAGE, items)
            }
        } catch (_: Exception) {}

        // 4. Scan USB Drives (for Android TV)
        val usbDirs = getMountedUsbDirectories(context)
        for (uDir in usbDirs) {
            scanDirectory(uDir, StorageSource.USB_DRIVE, items)
        }

        // 5. Query Android MediaStore for local videos & audios
        scanMediaStore(context, items)

        return items.distinctBy { it.localFilePath ?: it.streamUrl }.sortedByDescending { it.size }
    }

    private fun scanMediaStore(context: Context, outList: MutableList<DownloadItem>) {
        try {
            val projection = arrayOf(
                android.provider.MediaStore.Video.Media._ID,
                android.provider.MediaStore.Video.Media.DISPLAY_NAME,
                android.provider.MediaStore.Video.Media.SIZE,
                android.provider.MediaStore.Video.Media.DATA
            )
            val cursor = context.contentResolver.query(
                android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                projection,
                null,
                null,
                "${android.provider.MediaStore.Video.Media.DATE_ADDED} DESC"
            )
            cursor?.use { c ->
                val idCol = c.getColumnIndex(android.provider.MediaStore.Video.Media._ID)
                val nameCol = c.getColumnIndex(android.provider.MediaStore.Video.Media.DISPLAY_NAME)
                val sizeCol = c.getColumnIndex(android.provider.MediaStore.Video.Media.SIZE)
                val dataCol = c.getColumnIndex(android.provider.MediaStore.Video.Media.DATA)
                while (c.moveToNext()) {
                    val id = if (idCol >= 0) c.getLong(idCol) else continue
                    val name = if (nameCol >= 0) c.getString(nameCol) ?: "Video" else "Video"
                    val size = if (sizeCol >= 0) c.getLong(sizeCol) else 0L
                    val path = if (dataCol >= 0) c.getString(dataCol) ?: "" else ""
                    val contentUri = android.content.ContentUris.withAppendedId(
                        android.provider.MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id
                    )
                    val ext = name.substringAfterLast('.', "").lowercase(Locale.ROOT)
                    if (VIDEO_EXTENSIONS.contains(ext) && size > 512 * 1024) {
                        outList.add(
                            DownloadItem(
                                id = "mediastore_$id",
                                name = name,
                                cleanTitle = name.cleanMediaTitle(),
                                size = size,
                                sizeFormatted = ByteFormatter.format(size),
                                priority = "Local",
                                priorityBadge = "Phone Media",
                                status = "Ready to Play",
                                progress = 100.0,
                                completed = true,
                                streamUrl = if (path.isNotBlank()) "file://$path" else contentUri.toString(),
                                storageSource = StorageSource.LOCAL_STORAGE,
                                localFilePath = path
                            )
                        )
                    }
                }
            }
        } catch (_: Exception) {}
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
