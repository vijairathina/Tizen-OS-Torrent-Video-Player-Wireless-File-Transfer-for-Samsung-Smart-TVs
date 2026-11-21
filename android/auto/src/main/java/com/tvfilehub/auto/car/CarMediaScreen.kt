package com.tvfilehub.auto.car

import android.content.ComponentName
import android.net.Uri
import androidx.annotation.OptIn
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.*
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.tvfilehub.auto.service.CarMediaLibraryService
import com.tvfilehub.core.models.DownloadItem
import com.tvfilehub.core.network.ApiClient
import com.tvfilehub.core.services.LocalMediaScanner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@OptIn(UnstableApi::class)
class CarMediaScreen(carContext: CarContext) : Screen(carContext) {

    private var mediaItems: List<DownloadItem> = emptyList()
    private val scope = CoroutineScope(Dispatchers.IO)
    private var mediaController: MediaController? = null

    init {
        // Connect to CarMediaLibraryService via MediaController
        try {
            val token = SessionToken(carContext, ComponentName(carContext, CarMediaLibraryService::class.java))
            val controllerFuture = MediaController.Builder(carContext, token).buildAsync()
            controllerFuture.addListener({
                try {
                    mediaController = controllerFuture.get()
                } catch (_: Exception) {}
            }, ContextCompat.getMainExecutor(carContext))
        } catch (_: Exception) {}

        loadMedia()
    }

    private fun loadMedia() {
        scope.launch {
            // First load local files on the phone (available everywhere!)
            val local = LocalMediaScanner.scanAllMedia(carContext)
            if (local.isNotEmpty()) {
                mediaItems = local
                invalidate()
            }

            // Also try fetching server media if on Wi-Fi
            try {
                val res = ApiClient.serverApi.getDownloads()
                if (res.availableMovies.isNotEmpty()) {
                    val combined = (res.availableMovies + local).distinctBy { it.cleanTitle }
                    mediaItems = combined
                    invalidate()
                }
            } catch (_: Exception) {
                // If off-grid or in car driving, local media is already loaded!
            }
        }
    }

    override fun onGetTemplate(): Template {
        val listBuilder = ItemList.Builder()

        if (mediaItems.isEmpty()) {
            listBuilder.addItem(
                Row.Builder()
                    .setTitle("No Media Found")
                    .addText("Add movies or audio to phone storage or connect to server Wi-Fi")
                    .build()
            )
        } else {
            mediaItems.take(20).forEach { item ->
                listBuilder.addItem(
                    Row.Builder()
                        .setTitle(item.cleanTitle)
                        .addText("${item.sizeFormatted} • In-Car Audio Playback")
                        .setOnClickListener {
                            playItem(item)
                        }
                        .build()
                )
            }
        }

        return ListTemplate.Builder()
            .setTitle("LinkPlay • Car Media")
            .setHeaderAction(Action.APP_ICON)
            .setSingleList(listBuilder.build())
            .build()
    }

    private fun playItem(item: DownloadItem) {
        val playUri = item.effectivePlayUrl
        val uri = if (playUri.startsWith("file://") || playUri.startsWith("http://") || playUri.startsWith("content://")) {
            Uri.parse(playUri)
        } else {
            Uri.parse("file://$playUri")
        }

        val mediaItem = MediaItem.Builder()
            .setMediaId(uri.toString())
            .setUri(uri)
            .setRequestMetadata(
                MediaItem.RequestMetadata.Builder()
                    .setMediaUri(uri)
                    .build()
            )
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(item.cleanTitle)
                    .setArtist("LinkPlay")
                    .setSubtitle(item.sizeFormatted)
                    .setIsPlayable(true)
                    .setIsBrowsable(false)
                    .setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC)
                    .build()
            )
            .build()

        mediaController?.let { controller ->
            controller.setMediaItem(mediaItem)
            controller.prepare()
            controller.play()
        }
    }
}
