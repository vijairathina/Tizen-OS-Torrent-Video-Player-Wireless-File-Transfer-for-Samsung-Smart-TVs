package com.tvfilehub.phone.ui.player

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.lifecycleScope
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.tvfilehub.core.common.formatTime
import com.tvfilehub.core.services.AspectRatioMode
import com.tvfilehub.core.services.MediaPlaybackManager
import com.tvfilehub.phone.PhoneApp
import com.tvfilehub.phone.ui.theme.DarkBackground
import com.tvfilehub.phone.ui.theme.PrimaryCyan
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MobilePlayerActivity : ComponentActivity() {

    private lateinit var playbackManager: MediaPlaybackManager
    private var streamUrl: String = ""
    private var videoTitle: String = ""
    private var initialSeekMs: Long = 0L

    @OptIn(UnstableApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        streamUrl = intent.getStringExtra(EXTRA_STREAM_URL) ?: ""
        videoTitle = intent.getStringExtra(EXTRA_TITLE) ?: "Video Stream"
        initialSeekMs = intent.getLongExtra(EXTRA_START_POS, 0L)

        playbackManager = MediaPlaybackManager(this)

        if (streamUrl.isNotBlank()) {
            playbackManager.playMedia(streamUrl, videoTitle, initialSeekMs)
        }

        setContent {
            val playbackState by playbackManager.playbackState.collectAsState()
            val aspectMode by playbackManager.aspectRatioMode.collectAsState()

            var controlsVisible by remember { mutableStateOf(true) }
            var userActionCount by remember { mutableIntStateOf(0) }
            var isDraggingSlider by remember { mutableStateOf(false) }
            var dragSliderFraction by remember { mutableFloatStateOf(0f) }

            var quickSeekFeedback by remember { mutableStateOf<String?>(null) }

            val dur = playbackState.durationMs
            val cur = playbackState.currentPositionMs

            // Auto-hide controls after 3.5s of playback with no touch
            LaunchedEffect(controlsVisible, playbackState.isPlaying, isDraggingSlider, userActionCount) {
                if (controlsVisible && playbackState.isPlaying && !isDraggingSlider) {
                    delay(3500)
                    controlsVisible = false
                }
            }

            // Quick seek feedback auto-dismiss
            LaunchedEffect(quickSeekFeedback) {
                if (quickSeekFeedback != null) {
                    delay(800)
                    quickSeekFeedback = null
                }
            }

            // Immersive Fullscreen System Bars Controller
            val insetsController = remember(window) {
                WindowCompat.getInsetsController(window, window.decorView).apply {
                    systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                }
            }
            LaunchedEffect(controlsVisible) {
                if (controlsVisible) {
                    insetsController.show(WindowInsetsCompat.Type.systemBars())
                } else {
                    insetsController.hide(WindowInsetsCompat.Type.systemBars())
                }
            }

            val effectiveProgress = if (isDraggingSlider) {
                dragSliderFraction
            } else if (dur > 0) {
                (cur.toFloat() / dur.toFloat()).coerceIn(0f, 1f)
            } else {
                0f
            }

            val displayCurrentTimeMs = if (isDraggingSlider) {
                (dragSliderFraction * dur).toLong()
            } else {
                cur
            }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(DarkBackground)
            ) {
                // 1. ExoPlayer Video Surface
                AndroidView(
                    factory = { ctx ->
                        PlayerView(ctx).apply {
                            player = playbackManager.initializePlayer()
                            useController = false
                        }
                    },
                    update = { playerView ->
                        playerView.resizeMode = when (aspectMode) {
                            AspectRatioMode.FIT -> AspectRatioFrameLayout.RESIZE_MODE_FIT
                            AspectRatioMode.ZOOM -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                            AspectRatioMode.STRETCH -> AspectRatioFrameLayout.RESIZE_MODE_FILL
                            AspectRatioMode.FOUR_THREE -> AspectRatioFrameLayout.RESIZE_MODE_FIT
                            AspectRatioMode.CINEMASCOPE -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                        }
                    },
                    modifier = Modifier.fillMaxSize()
                )

                // 2. Full-Screen Touch & Gesture Detector (Taps & Double-Taps)
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .pointerInput(dur) {
                            detectTapGestures(
                                onTap = {
                                    controlsVisible = !controlsVisible
                                    userActionCount++
                                },
                                onDoubleTap = { offset ->
                                    val isRightSide = offset.x > size.width / 2
                                    if (isRightSide) {
                                        playbackManager.seekForward(10000)
                                        quickSeekFeedback = "+10s"
                                    } else {
                                        playbackManager.seekBackward(10000)
                                        quickSeekFeedback = "-10s"
                                    }
                                    controlsVisible = true
                                    userActionCount++
                                }
                            )
                        }
                )

                // 3. Quick Seek Animated Feedback Badge (Center)
                quickSeekFeedback?.let { feedback ->
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color = Color.Black.copy(alpha = 0.8f)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 24.dp, vertical = 14.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    if (feedback.startsWith("+")) Icons.Default.FastForward else Icons.Default.FastRewind,
                                    contentDescription = null,
                                    tint = PrimaryCyan,
                                    modifier = Modifier.size(28.dp)
                                )
                                Spacer(modifier = Modifier.width(10.dp))
                                Text(
                                    text = feedback,
                                    color = Color.White,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontSize = 18.sp
                                )
                            }
                        }
                    }
                }

                // 4. Center Buffering / Status Indicator
                if (playbackState.isBuffering || playbackState.isWaitingForBuffer) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color = Color.Black.copy(alpha = 0.82f),
                            border = androidx.compose.foundation.BorderStroke(1.dp, PrimaryCyan.copy(alpha = 0.35f))
                        ) {
                            Column(
                                modifier = Modifier.padding(horizontal = 24.dp, vertical = 20.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                CircularProgressIndicator(color = PrimaryCyan, strokeWidth = 3.dp)
                                Spacer(modifier = Modifier.height(14.dp))
                                Text(
                                    text = if (playbackState.isWaitingForBuffer)
                                        (playbackState.errorMessage ?: "Buffering stream... Waiting for peer pieces")
                                    else "Buffering video...",
                                    color = Color.White,
                                    fontSize = 14.sp,
                                    style = MaterialTheme.typography.titleSmall
                                )
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "Swarm downloading & sequential streaming active",
                                    color = Color.Gray,
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }
                } else if (playbackState.isError) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color = Color.Black.copy(alpha = 0.85f),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color.Red.copy(alpha = 0.4f))
                        ) {
                            Column(
                                modifier = Modifier.padding(horizontal = 24.dp, vertical = 20.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = Color.Red, modifier = Modifier.size(36.dp))
                                Spacer(modifier = Modifier.height(10.dp))
                                Text("Unable to load video stream", color = Color.White, fontSize = 15.sp)
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(playbackState.errorMessage ?: "Network or playback error", color = Color.Gray, fontSize = 12.sp)
                                Spacer(modifier = Modifier.height(14.dp))
                                Button(
                                    onClick = { playbackManager.retry() },
                                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryCyan)
                                ) {
                                    Text("Retry Playback", color = Color.Black)
                                }
                            }
                        }
                    }
                }

                // 5. Animated Top Bar
                AnimatedVisibility(
                    visible = controlsVisible,
                    enter = fadeIn() + slideInVertically(initialOffsetY = { -it }),
                    exit = fadeOut() + slideOutVertically(targetOffsetY = { -it }),
                    modifier = Modifier.align(Alignment.TopCenter)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                Brush.verticalGradient(
                                    listOf(Color.Black.copy(alpha = 0.85f), Color.Transparent)
                                )
                            )
                            .statusBarsPadding()
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(onClick = { finish() }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Exit", tint = Color.White)
                        }

                        Text(
                            text = playbackState.currentTitle.ifBlank { videoTitle },
                            color = Color.White,
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            modifier = Modifier.weight(1f).padding(horizontal = 12.dp)
                        )

                        IconButton(onClick = {
                            playbackManager.cycleAspectRatio()
                            userActionCount++
                        }) {
                            Icon(Icons.Default.AspectRatio, contentDescription = "Aspect Ratio", tint = PrimaryCyan)
                        }
                    }
                }

                // 6. Animated Bottom Timeline & Controls Bar
                AnimatedVisibility(
                    visible = controlsVisible,
                    enter = fadeIn() + slideInVertically(initialOffsetY = { it }),
                    exit = fadeOut() + slideOutVertically(targetOffsetY = { it }),
                    modifier = Modifier.align(Alignment.BottomCenter)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                Brush.verticalGradient(
                                    listOf(Color.Transparent, Color.Black.copy(alpha = 0.9f))
                                )
                            )
                            .navigationBarsPadding()
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                    ) {
                        // Seeking Time Preview when Dragging
                        if (isDraggingSlider) {
                            Box(
                                modifier = Modifier.fillMaxWidth(),
                                contentAlignment = Alignment.Center
                            ) {
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = Color.Black.copy(alpha = 0.75f)
                                ) {
                                    Text(
                                        text = "${(displayCurrentTimeMs / 1000).formatTime()} / ${(dur / 1000).formatTime()}",
                                        color = PrimaryCyan,
                                        fontSize = 13.sp,
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                        }

                        // Responsive Progress Slider (Supports Touch-to-Seek & Drag)
                        Slider(
                            value = effectiveProgress,
                            onValueChange = { frac ->
                                isDraggingSlider = true
                                dragSliderFraction = frac
                                userActionCount++
                            },
                            onValueChangeFinished = {
                                val targetPositionMs = (dragSliderFraction * dur).toLong().coerceIn(0L, dur)
                                playbackManager.seekTo(targetPositionMs)
                                isDraggingSlider = false
                                userActionCount++
                            },
                            colors = SliderDefaults.colors(
                                thumbColor = PrimaryCyan,
                                activeTrackColor = PrimaryCyan,
                                inactiveTrackColor = Color.White.copy(alpha = 0.3f)
                            ),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(28.dp)
                        )

                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 2.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "${(displayCurrentTimeMs / 1000).formatTime()} / ${(dur / 1000).formatTime()}",
                                color = Color.White,
                                fontSize = 12.sp
                            )

                            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                IconButton(onClick = {
                                    playbackManager.seekBackward(10000)
                                    quickSeekFeedback = "-10s"
                                    userActionCount++
                                }) {
                                    Icon(Icons.Default.Replay10, contentDescription = "-10s", tint = Color.White)
                                }

                                IconButton(onClick = {
                                    playbackManager.togglePlayPause()
                                    userActionCount++
                                }) {
                                    Icon(
                                        if (playbackState.isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                                        contentDescription = "Play/Pause",
                                        tint = PrimaryCyan,
                                        modifier = Modifier.size(32.dp)
                                    )
                                }

                                IconButton(onClick = {
                                    playbackManager.seekForward(10000)
                                    quickSeekFeedback = "+10s"
                                    userActionCount++
                                }) {
                                    Icon(Icons.Default.Forward10, contentDescription = "+10s", tint = Color.White)
                                }
                            }

                            Text(
                                text = aspectMode.label,
                                color = PrimaryCyan,
                                fontSize = 11.sp
                            )
                        }
                    }
                }
            }
        }
    }

    override fun onPause() {
        super.onPause()
        val curPos = playbackManager.playbackState.value.currentPositionMs / 1000
        val dur = playbackManager.playbackState.value.durationMs / 1000
        if (streamUrl.isNotBlank() && curPos > 5) {
            lifecycleScope.launch {
                PhoneApp.instance.mediaRepository.saveResumePoint(
                    key = streamUrl,
                    title = videoTitle,
                    streamUrl = streamUrl,
                    positionSec = curPos,
                    durationSec = dur
                )
            }
        }
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
