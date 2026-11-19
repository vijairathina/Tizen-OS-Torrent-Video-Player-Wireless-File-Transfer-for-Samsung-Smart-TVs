package com.tvfilehub.core.services

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.common.PlaybackException
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class PlaybackState(
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val currentPositionMs: Long = 0L,
    val durationMs: Long = 0L,
    val currentTitle: String = "",
    val mediaUrl: String = "",
    val availableAudioTracks: List<String> = emptyList(),
    val selectedAudioTrack: String? = null,
    val isError: Boolean = false,
    val errorMessage: String? = null,
    val isWaitingForBuffer: Boolean = false
)

enum class AspectRatioMode(val label: String) {
    FIT("Aspect: Fit (16:9)"),
    ZOOM("Aspect: Zoom (Fill)"),
    STRETCH("Aspect: Stretch"),
    FOUR_THREE("Aspect: 4:3"),
    CINEMASCOPE("Aspect: 21:9")
}

@OptIn(UnstableApi::class)
class MediaPlaybackManager(
    private val context: Context
) {
    private var exoPlayer: ExoPlayer? = null
    private val scope = CoroutineScope(Dispatchers.Main + Job())
    private var progressJob: Job? = null
    private var retryCount: Int = 0
    private val maxRetries: Int = 10

    private val _playbackState = MutableStateFlow(PlaybackState())
    val playbackState: StateFlow<PlaybackState> = _playbackState.asStateFlow()

    private val _aspectRatioMode = MutableStateFlow(AspectRatioMode.FIT)
    val aspectRatioMode: StateFlow<AspectRatioMode> = _aspectRatioMode.asStateFlow()

    fun initializePlayer(): ExoPlayer {
        if (exoPlayer == null) {
            val httpDataSourceFactory = DefaultHttpDataSource.Factory()
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(30000)
                .setReadTimeoutMs(60000)
                .setDefaultRequestProperties(mapOf(
                    "transferMode.dlna.org" to "Streaming",
                    "contentFeatures.dlna.org" to "DLNA.ORG_OP=11;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000"
                ))

            val dataSourceFactory = DefaultDataSource.Factory(context, httpDataSourceFactory)
            val mediaSourceFactory = DefaultMediaSourceFactory(dataSourceFactory)

            val loadControl = DefaultLoadControl.Builder()
                .setBufferDurationsMs(
                    /* minBufferMs = */ 2500,
                    /* maxBufferMs = */ 60000,
                    /* bufferForPlaybackMs = */ 1000,
                    /* bufferForPlaybackAfterRebufferMs = */ 2000
                )
                .setPrioritizeTimeOverSizeThresholds(true)
                .build()

            exoPlayer = ExoPlayer.Builder(context)
                .setMediaSourceFactory(mediaSourceFactory)
                .setLoadControl(loadControl)
                .setSeekBackIncrementMs(10000)
                .setSeekForwardIncrementMs(10000)
                .build().apply {
                    addListener(object : Player.Listener {
                        override fun onIsPlayingChanged(isPlaying: Boolean) {
                            _playbackState.value = _playbackState.value.copy(isPlaying = isPlaying)
                            if (isPlaying) startProgressPolling() else stopProgressPolling()
                        }

                        override fun onPlaybackStateChanged(state: Int) {
                            val isBuffering = (state == Player.STATE_BUFFERING)
                            val duration = duration.coerceAtLeast(0L)
                            if (state == Player.STATE_READY) {
                                retryCount = 0
                                _playbackState.value = _playbackState.value.copy(
                                    isBuffering = false,
                                    isWaitingForBuffer = false,
                                    isError = false,
                                    errorMessage = null,
                                    durationMs = duration
                                )
                            } else {
                                _playbackState.value = _playbackState.value.copy(
                                    isBuffering = isBuffering,
                                    durationMs = duration
                                )
                            }
                        }

                        override fun onPlayerError(error: PlaybackException) {
                            val isTorrentStream = _playbackState.value.mediaUrl.contains(":8889")
                            if (isTorrentStream && retryCount < maxRetries) {
                                retryCount++
                                _playbackState.value = _playbackState.value.copy(
                                    isBuffering = true,
                                    isWaitingForBuffer = true,
                                    errorMessage = "Buffering stream... Waiting for peer pieces (Retry $retryCount/$maxRetries)..."
                                )
                                scope.launch {
                                    delay(3000)
                                    exoPlayer?.let { p ->
                                        p.prepare()
                                        p.playWhenReady = true
                                    }
                                }
                            } else {
                                _playbackState.value = _playbackState.value.copy(
                                    isBuffering = false,
                                    isWaitingForBuffer = false,
                                    isError = true,
                                    errorMessage = error.localizedMessage ?: "Playback error"
                                )
                            }
                        }

                        override fun onTracksChanged(tracks: Tracks) {
                            val audioTrackNames = mutableListOf<String>()
                            for (trackGroup in tracks.groups) {
                                if (trackGroup.type == C.TRACK_TYPE_AUDIO) {
                                    for (i in 0 until trackGroup.length) {
                                        val format = trackGroup.getTrackFormat(i)
                                        val lang = format.language ?: "Unknown"
                                        val label = format.label ?: "$lang (${format.sampleMimeType ?: "audio"})"
                                        audioTrackNames.add(label)
                                    }
                                }
                            }
                            _playbackState.value = _playbackState.value.copy(
                                availableAudioTracks = audioTrackNames
                            )
                        }
                    })
                }
        }
        return exoPlayer!!
    }

    fun retry() {
        retryCount = 0
        _playbackState.value = _playbackState.value.copy(
            isBuffering = true,
            isWaitingForBuffer = true,
            isError = false,
            errorMessage = "Retrying video stream..."
        )
        exoPlayer?.prepare()
        exoPlayer?.playWhenReady = true
    }

    fun playMedia(mediaUrl: String, title: String, startPositionMs: Long = 0L) {
        val player = initializePlayer()
        val mediaItem = MediaItem.fromUri(mediaUrl)
        player.setMediaItem(mediaItem)
        player.prepare()
        if (startPositionMs > 0L) {
            player.seekTo(startPositionMs)
        }
        player.playWhenReady = true
        _playbackState.value = _playbackState.value.copy(
            currentTitle = title,
            mediaUrl = mediaUrl,
            currentPositionMs = startPositionMs
        )
    }

    fun togglePlayPause() {
        exoPlayer?.let {
            if (it.isPlaying) it.pause() else it.play()
        }
    }

    fun seekForward(offsetMs: Long = 10000L) {
        exoPlayer?.let {
            val newPos = (it.currentPosition + offsetMs).coerceAtMost(it.duration.coerceAtLeast(0L))
            it.seekTo(newPos)
        }
    }

    fun seekBackward(offsetMs: Long = 10000L) {
        exoPlayer?.let {
            val newPos = (it.currentPosition - offsetMs).coerceAtLeast(0L)
            it.seekTo(newPos)
        }
    }

    fun seekTo(positionMs: Long) {
        exoPlayer?.seekTo(positionMs)
    }

    fun cycleAspectRatio() {
        val modes = AspectRatioMode.values()
        val nextIdx = (_aspectRatioMode.value.ordinal + 1) % modes.size
        _aspectRatioMode.value = modes[nextIdx]
    }

    private fun startProgressPolling() {
        progressJob?.cancel()
        progressJob = scope.launch {
            while (isActive) {
                exoPlayer?.let {
                    val current = it.currentPosition.coerceAtLeast(0L)
                    val dur = it.duration.coerceAtLeast(0L)
                    _playbackState.value = _playbackState.value.copy(
                        currentPositionMs = current,
                        durationMs = dur
                    )
                }
                delay(1000)
            }
        }
    }

    private fun stopProgressPolling() {
        progressJob?.cancel()
        progressJob = null
    }

    fun release() {
        stopProgressPolling()
        exoPlayer?.release()
        exoPlayer = null
    }
}
