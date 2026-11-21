package com.tvfilehub.auto.service

import android.net.Uri
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
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

        // 1. AudioAttributes with strict handleAudioFocus = true
        // Android Auto requires this to obtain audio focus through the car head unit!
        val audioAttributes = AudioAttributes.Builder()
            .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
            .setUsage(C.USAGE_MEDIA)
            .build()

        // 2. High-resilience HTTP data source for local LAN & streaming
        val httpDataSourceFactory = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(30000)
            .setReadTimeoutMs(60000)
            .setDefaultRequestProperties(mapOf(
                "transferMode.dlna.org" to "Streaming",
                "contentFeatures.dlna.org" to "DLNA.ORG_OP=11;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000"
            ))

        val dataSourceFactory = DefaultDataSource.Factory(this, httpDataSourceFactory)
        val mediaSourceFactory = DefaultMediaSourceFactory(dataSourceFactory)

        // 3. Fast initial buffering (1000ms) so car head unit does not time out
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                /* minBufferMs = */ 2500,
                /* maxBufferMs = */ 60000,
                /* bufferForPlaybackMs = */ 1000,
                /* bufferForPlaybackAfterRebufferMs = */ 2000
            )
            .setPrioritizeTimeOverSizeThresholds(true)
            .build()

        val exo = ExoPlayer.Builder(this)
            .setMediaSourceFactory(mediaSourceFactory)
            .setLoadControl(loadControl)
            .setAudioAttributes(audioAttributes, /* handleAudioFocus = */ true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .setSeekBackIncrementMs(10000)
            .setSeekForwardIncrementMs(10000)
            .build()

        exo.addListener(object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                Log.e(TAG, "ExoPlayer playback error in car: ${error.errorCodeName} - ${error.message}", error)
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                val stateStr = when (playbackState) {
                    Player.STATE_IDLE -> "IDLE"
                    Player.STATE_BUFFERING -> "BUFFERING"
                    Player.STATE_READY -> "READY"
                    Player.STATE_ENDED -> "ENDED"
                    else -> "$playbackState"
                }
                Log.d(TAG, "Car playback state: $stateStr, playWhenReady=${exo.playWhenReady}")
            }
        })

        player = exo

        // 4. MediaLibrarySession Callback
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
                            .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)
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

            override fun onSetMediaItems(
                mediaSession: MediaSession,
                controller: MediaSession.ControllerInfo,
                mediaItems: MutableList<MediaItem>,
                startIndex: Int,
                startPositionMs: Long
            ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
                val updatedItems = resolveMediaItems(mediaItems)
                serviceScope.launch(Dispatchers.Main) {
                    player?.let { p ->
                        p.setMediaItems(updatedItems, startIndex, startPositionMs)
                        p.prepare()
                        p.playWhenReady = true
                    }
                }
                return Futures.immediateFuture(
                    MediaSession.MediaItemsWithStartPosition(updatedItems, startIndex, startPositionMs)
                )
            }

            override fun onAddMediaItems(
                mediaSession: MediaSession,
                controller: MediaSession.ControllerInfo,
                mediaItems: MutableList<MediaItem>
            ): ListenableFuture<MutableList<MediaItem>> {
                val updatedItems = resolveMediaItems(mediaItems)
                serviceScope.launch(Dispatchers.Main) {
                    player?.let { p ->
                        if (p.playbackState == Player.STATE_IDLE) {
                            p.setMediaItems(updatedItems)
                            p.prepare()
                            p.playWhenReady = true
                        }
                    }
                }
                return Futures.immediateFuture(updatedItems)
            }

            override fun onPlaybackResumption(
                mediaSession: MediaSession,
                controller: MediaSession.ControllerInfo
            ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
                val current = player?.currentMediaItem
                return if (current != null) {
                    Futures.immediateFuture(
                        MediaSession.MediaItemsWithStartPosition(
                            listOf(current),
                            player?.currentMediaItemIndex ?: 0,
                            player?.currentPosition ?: 0L
                        )
                    )
                } else {
                    super.onPlaybackResumption(mediaSession, controller)
                }
            }
        }

        mediaLibrarySession = MediaLibrarySession.Builder(this, player!!, callback)
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession? {
        return mediaLibrarySession
    }

    private fun resolveMediaItems(mediaItems: List<MediaItem>): MutableList<MediaItem> {
        return mediaItems.map { item ->
            val uri = item.requestMetadata.mediaUri
                ?: item.localConfiguration?.uri
                ?: Uri.parse(item.mediaId)

            item.buildUpon()
                .setUri(uri)
                .setMediaMetadata(
                    item.mediaMetadata.buildUpon()
                        .setIsBrowsable(false)
                        .setIsPlayable(true)
                        .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
                        .build()
                )
                .build()
        }.toMutableList()
    }

    private fun fetchLocalMediaItems(): List<MediaItem> {
        return try {
            val localItems = LocalMediaScanner.scanAllMedia(applicationContext)
            localItems.map { item ->
                val playUrl = if (item.effectivePlayUrl.startsWith("file://") ||
                    item.effectivePlayUrl.startsWith("http://") ||
                    item.effectivePlayUrl.startsWith("content://")) {
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
            Log.w(TAG, "Error fetching local media items: ${e.message}")
            emptyList()
        }
    }

    private suspend fun fetchCompletedMediaItems(): List<MediaItem> {
        return try {
            val localItems = LocalMediaScanner.scanAllMedia(applicationContext)
            val response = ApiClient.serverApi.getDownloads()
            val serverItems = response.availableMovies.map { movie ->
                // Check if this server movie was already downloaded to phone storage
                val localMatch = localItems.find {
                    it.name.equals(movie.name, ignoreCase = true) ||
                    it.cleanTitle.equals(movie.cleanTitle, ignoreCase = true)
                }
                val rawUrl = localMatch?.effectivePlayUrl
                    ?: movie.streamUrl
                    ?: "http://${ApiClient.hostInterceptor.getServerHost()}:8080/files/${movie.name}"

                val playUri = if (rawUrl.startsWith("file://") || rawUrl.startsWith("http://") || rawUrl.startsWith("content://")) {
                    rawUrl
                } else {
                    "file://$rawUrl"
                }

                buildPlayableItem(
                    id = playUri,
                    title = movie.cleanTitle,
                    subtitle = if (localMatch != null) "${movie.sizeFormatted} • Phone Storage (Offline)" else "${movie.sizeFormatted} • Server Media"
                )
            }
            if (serverItems.isEmpty()) {
                fetchLocalMediaItems()
            } else {
                serverItems
            }
        } catch (e: Exception) {
            Log.w(TAG, "Server media unreachable (${e.message}); falling back to local files")
            fetchLocalMediaItems()
        }
    }

    private suspend fun fetchContinueWatchingItems(): List<MediaItem> {
        return try {
            val database = AppDatabase.getInstance(applicationContext)
            val entities = database.mediaDao().getAllResumePoints().firstOrNull() ?: emptyList()
            entities.map { resume ->
                val uriStr = resume.streamUrl.ifBlank { resume.mediaKey }
                val playUri = if (uriStr.startsWith("file://") || uriStr.startsWith("http://") || uriStr.startsWith("content://")) {
                    uriStr
                } else {
                    "file://$uriStr"
                }
                buildPlayableItem(
                    id = playUri,
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
        val uri = Uri.parse(id)
        return MediaItem.Builder()
            .setMediaId(id)
            .setUri(uri)
            .setRequestMetadata(
                MediaItem.RequestMetadata.Builder()
                    .setMediaUri(uri)
                    .build()
            )
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setIsBrowsable(false)
                    .setIsPlayable(true)
                    .setTitle(title)
                    .setArtist("LinkPlay")
                    .setSubtitle(subtitle)
                    .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
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
        private const val TAG = "CarMediaLibraryService"
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
