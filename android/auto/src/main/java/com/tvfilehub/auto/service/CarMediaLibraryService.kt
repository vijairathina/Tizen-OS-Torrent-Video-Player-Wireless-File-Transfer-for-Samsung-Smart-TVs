package com.tvfilehub.auto.service

import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.tvfilehub.core.database.AppDatabase
import com.tvfilehub.core.network.ApiClient
import com.tvfilehub.core.services.LocalMediaScanner
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.firstOrNull

@OptIn(UnstableApi::class)
class CarMediaLibraryService : MediaLibraryService() {

    private var player: ExoPlayer? = null
    private var mediaLibrarySession: MediaLibrarySession? = null
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun onCreate() {
        super.onCreate()

        player = ExoPlayer.Builder(this).build()

        val callback = object : MediaLibrarySession.Callback {
            override fun onGetLibraryRoot(
                session: MediaLibrarySession,
                browser: MediaSession.ControllerInfo,
                params: LibraryParams?
            ): ListenableFuture<LibraryResult<MediaItem>> {
                val rootItem = MediaItem.Builder()
                    .setMediaId(ROOT_ID)
                    .setMediaMetadata(
                        MediaMetadata.Builder()
                            .setIsBrowsable(true)
                            .setIsPlayable(false)
                            .setTitle("LinkPlay")
                            .build()
                    )
                    .build()
                return Futures.immediateFuture(LibraryResult.ofItem(rootItem, params))
            }

            override fun onGetChildren(
                session: MediaLibrarySession,
                browser: MediaSession.ControllerInfo,
                parentId: String,
                page: Int,
                pageSize: Int,
                params: LibraryParams?
            ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
                return serviceScope.future {
                    when (parentId) {
                        ROOT_ID -> {
                            val categories = ImmutableList.of(
                                buildBrowsableItem(CATEGORY_LOCAL, "Downloads & Local Storage", "Media files saved on this phone"),
                                buildBrowsableItem(CATEGORY_COMPLETED, "Completed Media on Server", "Audio & Video library ready to stream"),
                                buildBrowsableItem(CATEGORY_CONTINUE, "Continue Watching", "Recent media playback")
                            )
                            LibraryResult.ofItemList(categories, params)
                        }

                        CATEGORY_LOCAL -> {
                            val items = fetchLocalMediaItems()
                            LibraryResult.ofItemList(ImmutableList.copyOf(items), params)
                        }

                        CATEGORY_COMPLETED -> {
                            val items = fetchCompletedMediaItems()
                            LibraryResult.ofItemList(ImmutableList.copyOf(items), params)
                        }

                        CATEGORY_CONTINUE -> {
                            val items = fetchContinueWatchingItems()
                            LibraryResult.ofItemList(ImmutableList.copyOf(items), params)
                        }

                        else -> LibraryResult.ofItemList(ImmutableList.of(), params)
                    }
                }
            }

            override fun onGetItem(
                session: MediaLibrarySession,
                browser: MediaSession.ControllerInfo,
                mediaId: String
            ): ListenableFuture<LibraryResult<MediaItem>> {
                return serviceScope.future {
                    when (mediaId) {
                        ROOT_ID -> LibraryResult.ofItem(
                            buildBrowsableItem(ROOT_ID, "LinkPlay", "Library"),
                            null
                        )
                        CATEGORY_LOCAL -> LibraryResult.ofItem(
                            buildBrowsableItem(CATEGORY_LOCAL, "Downloads & Local Storage", "Media files saved on this phone"),
                            null
                        )
                        CATEGORY_COMPLETED -> LibraryResult.ofItem(
                            buildBrowsableItem(CATEGORY_COMPLETED, "Completed Media on Server", "Audio & Video library ready to stream"),
                            null
                        )
                        CATEGORY_CONTINUE -> LibraryResult.ofItem(
                            buildBrowsableItem(CATEGORY_CONTINUE, "Continue Watching", "Recent media playback"),
                            null
                        )
                        else -> {
                            val item = buildPlayableItem(mediaId, "Media Item", "LinkPlay")
                            LibraryResult.ofItem(item, null)
                        }
                    }
                }
            }

            override fun onAddMediaItems(
                mediaSession: MediaSession,
                controller: MediaSession.ControllerInfo,
                mediaItems: MutableList<MediaItem>
            ): ListenableFuture<MutableList<MediaItem>> {
                val updatedItems = mediaItems.map { item ->
                    val uri = item.requestMetadata.mediaUri ?: Uri.parse(item.mediaId)
                    item.buildUpon()
                        .setUri(uri)
                        .setMediaMetadata(item.mediaMetadata)
                        .build()
                }.toMutableList()
                return Futures.immediateFuture(updatedItems)
            }
        }

        mediaLibrarySession = MediaLibrarySession.Builder(this, player!!, callback)
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? {
        return mediaLibrarySession
    }

    private fun fetchLocalMediaItems(): List<MediaItem> {
        return try {
            val localItems = LocalMediaScanner.scanAllMedia(applicationContext)
            localItems.map { item ->
                val playUrl = if (item.effectivePlayUrl.startsWith("file://") || item.effectivePlayUrl.startsWith("http://")) {
                    item.effectivePlayUrl
                } else {
                    "file://${item.effectivePlayUrl}"
                }
                buildPlayableItem(
                    id = playUrl,
                    title = item.cleanTitle,
                    subtitle = "${item.sizeFormatted} • ${item.priorityBadge}"
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private suspend fun fetchCompletedMediaItems(): List<MediaItem> {
        return try {
            val response = ApiClient.serverApi.getDownloads()
            val serverItems = response.availableMovies.map { movie ->
                val streamUrl = movie.streamUrl ?: "http://${ApiClient.hostInterceptor.getServerHost()}:8080/files/${movie.name}"
                buildPlayableItem(
                    id = streamUrl,
                    title = movie.cleanTitle,
                    subtitle = "${movie.sizeFormatted} • Server Media"
                )
            }
            if (serverItems.isEmpty()) {
                fetchLocalMediaItems()
            } else {
                serverItems
            }
        } catch (e: Exception) {
            fetchLocalMediaItems()
        }
    }

    private suspend fun fetchContinueWatchingItems(): List<MediaItem> {
        return try {
            val database = AppDatabase.getInstance(applicationContext)
            val entities = database.mediaDao().getAllResumePoints().firstOrNull() ?: emptyList()
            entities.map { resume ->
                buildPlayableItem(
                    id = resume.streamUrl.ifBlank { resume.mediaKey },
                    title = resume.title.ifBlank { resume.mediaKey.substringAfterLast("/").substringBeforeLast(".") },
                    subtitle = "Resume at ${formatSeconds(resume.positionSeconds)}"
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun formatSeconds(seconds: Long): String {
        val mins = seconds / 60
        val secs = seconds % 60
        return "%d:%02d".format(mins, secs)
    }

    private fun buildBrowsableItem(id: String, title: String, subtitle: String): MediaItem {
        return MediaItem.Builder()
            .setMediaId(id)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setIsBrowsable(true)
                    .setIsPlayable(false)
                    .setTitle(title)
                    .setSubtitle(subtitle)
                    .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)
                    .build()
            )
            .build()
    }

    private fun buildPlayableItem(id: String, title: String, subtitle: String): MediaItem {
        return MediaItem.Builder()
            .setMediaId(id)
            .setRequestMetadata(
                MediaItem.RequestMetadata.Builder()
                    .setMediaUri(Uri.parse(id))
                    .build()
            )
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setIsBrowsable(false)
                    .setIsPlayable(true)
                    .setTitle(title)
                    .setArtist("LinkPlay")
                    .setSubtitle(subtitle)
                    .setMediaType(MediaMetadata.MEDIA_TYPE_VIDEO)
                    .build()
            )
            .build()
    }

    override fun onDestroy() {
        mediaLibrarySession?.run {
            player.release()
            release()
            mediaLibrarySession = null
        }
        serviceScope.cancel()
        super.onDestroy()
    }

    companion object {
        const val ROOT_ID = "root_linkplay"
        const val CATEGORY_LOCAL = "category_local"
        const val CATEGORY_COMPLETED = "category_completed"
        const val CATEGORY_CONTINUE = "category_continue"
    }
}

// Coroutine Future Helper for MediaLibrarySession
private fun <T> CoroutineScope.future(block: suspend () -> T): ListenableFuture<T> {
    val future = com.google.common.util.concurrent.SettableFuture.create<T>()
    launch {
        try {
            future.set(block())
        } catch (e: Throwable) {
            future.setException(e)
        }
    }
    return future
}
