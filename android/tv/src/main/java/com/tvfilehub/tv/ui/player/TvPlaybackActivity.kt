package com.tvfilehub.tv.ui.player

import android.os.Bundle
import android.view.KeyEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView
import com.tvfilehub.core.common.formatTime
import com.tvfilehub.core.services.MediaPlaybackManager
import com.tvfilehub.tv.TvApp
import com.tvfilehub.tv.ui.theme.TvBackground
import com.tvfilehub.tv.ui.theme.TvFocusBorder
import com.tvfilehub.tv.ui.theme.TvPrimary
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class TvPlaybackActivity : ComponentActivity() {

    private lateinit var playbackManager: MediaPlaybackManager
    private var streamUrl: String = ""
    private var videoTitle: String = ""
    private var initialSeekMs: Long = 0L

    private val isOsdVisible = mutableStateOf(true)
    private val seekFeedbackText = mutableStateOf<String?>(null)
    private val aspectFeedbackText = mutableStateOf<String?>(null)

    private var osdHideJob: Job? = null
    private var feedbackHideJob: Job? = null

    @OptIn(UnstableApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        streamUrl = intent.getStringExtra(EXTRA_STREAM_URL) ?: ""
        videoTitle = intent.getStringExtra(EXTRA_TITLE) ?: "TV Video Stream"
        initialSeekMs = intent.getLongExtra(EXTRA_START_POS, 0L)

        playbackManager = MediaPlaybackManager(this)

        if (streamUrl.isNotBlank()) {
            playbackManager.playMedia(streamUrl, videoTitle, initialSeekMs)
        }

        scheduleOsdAutoHide()

        setContent {
            val playbackState by playbackManager.playbackState.collectAsState()
            val aspectMode by playbackManager.aspectRatioMode.collectAsState()
            val osdShow by remember { isOsdVisible }
            val seekText by remember { seekFeedbackText }
            val aspectText by remember { aspectFeedbackText }

            Box(modifier = Modifier.fillMaxSize().background(TvBackground)) {
                // ExoPlayer Surface
                AndroidView(
                    factory = { ctx ->
                        PlayerView(ctx).apply {
                            player = playbackManager.initializePlayer()
                            useController = false
                        }
                    },
                    modifier = Modifier.fillMaxSize()
                )

                // Seek Feedback Toast
                seekText?.let { txt ->
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Surface(
                            shape = MaterialTheme.shapes.medium,
                            color = Color.Black.copy(alpha = 0.8f)
                        ) {
                            Text(
                                text = txt,
                                color = TvPrimary,
                                fontSize = 28.sp,
                                modifier = Modifier.padding(horizontal = 28.dp, vertical = 14.dp)
                            )
                        }
                    }
                }

                // Aspect Feedback Toast
                aspectText?.let { txt ->
                    Box(modifier = Modifier.fillMaxSize().padding(top = 40.dp), contentAlignment = Alignment.TopCenter) {
                        Surface(
                            shape = MaterialTheme.shapes.medium,
                            color = Color.Black.copy(alpha = 0.8f)
                        ) {
                            Text(
                                text = txt,
                                color = TvPrimary,
                                fontSize = 20.sp,
                                modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp)
                            )
                        }
                    }
                }

                // 10-Foot TV OSD Overlay
                AnimatedVisibility(
                    visible = osdShow,
                    enter = fadeIn(),
                    exit = fadeOut(),
                    modifier = Modifier.fillMaxSize()
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = 0.45f))
                            .padding(horizontal = 48.dp, vertical = 32.dp),
                        verticalArrangement = Arrangement.SpaceBetween
                    ) {
                        // Top Bar
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = playbackState.currentTitle,
                                style = MaterialTheme.typography.headlineSmall,
                                color = Color.White
                            )

                            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                Text(
                                    text = aspectMode.label,
                                    color = TvPrimary,
                                    fontSize = 14.sp
                                )
                                Text(
                                    text = "[BACK] Exit",
                                    color = Color.LightGray,
                                    fontSize = 14.sp
                                )
                            }
                        }

                        // Center Play Indicator
                        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            if (playbackState.isBuffering) {
                                CircularProgressIndicator(color = TvPrimary, strokeWidth = 4.dp)
                            } else {
                                Icon(
                                    if (playbackState.isPlaying) Icons.Default.PlayCircle else Icons.Default.PauseCircle,
                                    contentDescription = null,
                                    tint = Color.White.copy(alpha = 0.8f),
                                    modifier = Modifier.size(72.dp)
                                )
                            }
                        }

                        // Bottom Scrubber Bar
                        Column(modifier = Modifier.fillMaxWidth()) {
                            val dur = playbackState.durationMs
                            val cur = playbackState.currentPositionMs
                            val progress = if (dur > 0) (cur.toFloat() / dur.toFloat()).coerceIn(0f, 1f) else 0f

                            LinearProgressIndicator(
                                progress = progress,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(8.dp),
                                color = TvFocusBorder,
                                trackColor = Color.DarkGray
                            )

                            Spacer(modifier = Modifier.height(10.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "${(cur / 1000).formatTime()} / ${(dur / 1000).formatTime()}",
                                    color = Color.White,
                                    fontSize = 16.sp
                                )

                                Text(
                                    text = "◄ / ► Seek 10s • [OK] Play/Pause • [Return] Exit",
                                    color = Color.LightGray,
                                    fontSize = 14.sp
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        resetOsdVisibility()

        return when (keyCode) {
            KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_MEDIA_REWIND -> {
                playbackManager.seekBackward(10000)
                showSeekFeedback("-10s")
                true
            }
            KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> {
                playbackManager.seekForward(10000)
                showSeekFeedback("+10s")
                true
            }
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                playbackManager.togglePlayPause()
                true
            }
            KeyEvent.KEYCODE_PROG_RED -> {
                playbackManager.cycleAspectRatio()
                aspectFeedbackText.value = playbackManager.aspectRatioMode.value.label
                scheduleFeedbackAutoHide()
                true
            }
            KeyEvent.KEYCODE_BACK -> {
                saveResumePosition()
                finish()
                true
            }
            else -> super.onKeyDown(keyCode, event)
        }
    }

    private fun resetOsdVisibility() {
        isOsdVisible.value = true
        scheduleOsdAutoHide()
    }

    private fun scheduleOsdAutoHide() {
        osdHideJob?.cancel()
        osdHideJob = lifecycleScope.launch {
            delay(5000)
            isOsdVisible.value = false
        }
    }

    private fun showSeekFeedback(text: String) {
        seekFeedbackText.value = text
        scheduleFeedbackAutoHide()
    }

    private fun scheduleFeedbackAutoHide() {
        feedbackHideJob?.cancel()
        feedbackHideJob = lifecycleScope.launch {
            delay(1500)
            seekFeedbackText.value = null
            aspectFeedbackText.value = null
        }
    }

    private fun saveResumePosition() {
        val curSec = playbackManager.playbackState.value.currentPositionMs / 1000
        val durSec = playbackManager.playbackState.value.durationMs / 1000
        if (streamUrl.isNotBlank() && curSec > 5) {
            lifecycleScope.launch {
                TvApp.instance.mediaRepository.saveResumePoint(
                    key = streamUrl,
                    title = videoTitle,
                    streamUrl = streamUrl,
                    positionSec = curSec,
                    durationSec = durSec
                )
            }
        }
    }

    override fun onPause() {
        super.onPause()
        saveResumePosition()
    }

    override fun onDestroy() {
        super.onDestroy()
        playbackManager.release()
    }

    companion object {
        const val EXTRA_STREAM_URL = "extra_stream_url"
        const val EXTRA_TITLE = "extra_title"
        const val EXTRA_START_POS = "extra_start_pos"
    }
}
