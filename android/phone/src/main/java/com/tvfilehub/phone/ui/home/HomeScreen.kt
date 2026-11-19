package com.tvfilehub.phone.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tvfilehub.core.common.formatTime
import com.tvfilehub.phone.ui.theme.*

@Composable
fun HomeScreen(
    viewModel: HomeViewModel,
    onNavigateToPlayer: () -> Unit,
    onNavigateToTransfer: () -> Unit,
    onNavigateToFiles: () -> Unit,
    onPlayMedia: (streamUrl: String, title: String, startPosSec: Long) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    var showServerInfo by remember { mutableStateOf(false) }
    val isConnected = uiState.systemStatus.mode != "offline" && (uiState.availableCount > 0 || uiState.systemStatus.hostIp.isNotBlank())

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // 1. App Header Brand
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "LINKPLAY",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = PrimaryCyan
                    )
                    Text(
                        text = "Unified Multi-Screen Hub",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary
                    )
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    // Small Server Status Dot (Touch for info tooltip)
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .clickable { showServerInfo = true },
                        contentAlignment = Alignment.Center
                    ) {
                        Box(
                            modifier = Modifier
                                .size(14.dp)
                                .clip(CircleShape)
                                .background(if (isConnected) SuccessGreen.copy(alpha = 0.25f) else DangerRed.copy(alpha = 0.25f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(if (isConnected) SuccessGreen else DangerRed)
                            )
                        }
                    }

                    IconButton(onClick = { viewModel.loadDashboard() }) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Refresh",
                            tint = PrimaryCyan
                        )
                    }
                }
            }
        }

        // 2. TV-Style Hero Spotlight Header Banner
        item {
            val spotlight = uiState.spotlight
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .wrapContentHeight(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = DarkCard)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            Brush.verticalGradient(
                                colors = listOf(
                                    Color(0xFF1E293B),
                                    Color(0xFF0F172A),
                                    DarkCard
                                )
                            )
                        )
                ) {
                    // Subtle background movie graphic watermark
                    Icon(
                        imageVector = Icons.Default.Movie,
                        contentDescription = null,
                        tint = PrimaryCyan.copy(alpha = 0.05f),
                        modifier = Modifier
                            .size(160.dp)
                            .align(Alignment.BottomEnd)
                            .offset(x = 20.dp, y = 20.dp)
                    )

                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        // Badge Tags Row
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            val badgeText = spotlight?.badge ?: "WELCOME"
                            val isResume = spotlight?.isResume == true
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = if (isResume) AccentPurple.copy(alpha = 0.25f) else PrimaryCyan.copy(alpha = 0.2f)
                            ) {
                                Text(
                                    text = "★ $badgeText",
                                    color = if (isResume) AccentPurple else PrimaryCyan,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                                )
                            }

                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = DarkSurface
                            ) {
                                Text(
                                    text = if (isResume) "RESUME" else "SERVER 4K",
                                    color = TextSecondary,
                                    fontSize = 10.sp,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                                )
                            }

                            if (isResume && spotlight != null) {
                                Surface(
                                    shape = RoundedCornerShape(6.dp),
                                    color = Color(0xFFF59E0B).copy(alpha = 0.2f)
                                ) {
                                    Text(
                                        text = spotlight.resumePositionSec.formatTime(),
                                        color = Color(0xFFF59E0B),
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Medium,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                                    )
                                }
                            }
                        }

                        // Title
                        Text(
                            text = spotlight?.title ?: "LinkPlay Streaming Hub",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary,
                            maxLines = 2
                        )

                        // Subtitle Description
                        val desc = when {
                            spotlight?.isResume == true -> "Saved Resume Point: ${spotlight.resumePositionSec.formatTime()} • High-Fidelity Playback"
                            spotlight != null -> if (spotlight.sizeFormatted.isNotBlank()) "${spotlight.sizeFormatted} • Latest Download" else "Latest Download • High-Speed Streaming"
                            else -> "High-Performance Media Hub • Wireless Transfer • Seamless Video Streaming"
                        }
                        Text(
                            text = desc,
                            style = MaterialTheme.typography.bodySmall,
                            color = TextSecondary,
                            maxLines = 2
                        )

                        // Resume Progress Track
                        if (spotlight?.isResume == true && spotlight.durationSec > 0) {
                            val progress = (spotlight.resumePositionSec.toFloat() / spotlight.durationSec.toFloat()).coerceIn(0f, 1f)
                            LinearProgressIndicator(
                                progress = progress,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(4.dp)
                                    .clip(RoundedCornerShape(2.dp)),
                                color = PrimaryCyan,
                                trackColor = DarkSurface
                            )
                        }

                        // Hero Action Buttons
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            if (spotlight != null) {
                                if (spotlight.isResume) {
                                    // Continue Watch
                                    Button(
                                        onClick = {
                                            onPlayMedia(spotlight.streamUrl, spotlight.title, spotlight.resumePositionSec)
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryCyan),
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        Icon(Icons.Default.PlayArrow, contentDescription = null, tint = DarkBackground, modifier = Modifier.size(18.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Continue Watch", color = DarkBackground, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                    }

                                    // Play from Start
                                    OutlinedButton(
                                        onClick = {
                                            onPlayMedia(spotlight.streamUrl, spotlight.title, 0L)
                                        },
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        Icon(Icons.Default.Replay, contentDescription = null, tint = PrimaryCyan, modifier = Modifier.size(16.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("From Start", color = PrimaryCyan, fontSize = 12.sp)
                                    }
                                } else {
                                    // Play Video (Latest Download)
                                    Button(
                                        onClick = {
                                            onPlayMedia(spotlight.streamUrl, spotlight.title, 0L)
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryCyan),
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        Icon(Icons.Default.PlayArrow, contentDescription = null, tint = DarkBackground, modifier = Modifier.size(18.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Play Video", color = DarkBackground, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                                    }

                                    // All Movies
                                    OutlinedButton(
                                        onClick = onNavigateToPlayer,
                                        shape = RoundedCornerShape(8.dp)
                                    ) {
                                        Icon(Icons.Default.Movie, contentDescription = null, tint = PrimaryCyan, modifier = Modifier.size(16.dp))
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("All Movies", color = PrimaryCyan, fontSize = 12.sp)
                                    }
                                }
                            } else {
                                Button(
                                    onClick = onNavigateToPlayer,
                                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryCyan),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Icon(Icons.Default.PlayArrow, contentDescription = null, tint = DarkBackground)
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text("Open Player", color = DarkBackground)
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Continue Watching Section (Directly Below Hero Banner)
        if (uiState.continueWatching.isNotEmpty()) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Continue Watching",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimary
                    )
                    Text(
                        text = "${uiState.continueWatching.size} items",
                        fontSize = 12.sp,
                        color = TextSecondary
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(uiState.continueWatching) { item ->
                        Card(
                            modifier = Modifier
                                .width(220.dp)
                                .clickable {
                                    onPlayMedia(item.streamUrl, item.title, item.positionSeconds)
                                },
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = DarkSurface)
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(
                                    text = item.title,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Medium,
                                    color = TextPrimary,
                                    maxLines = 1
                                )
                                Spacer(modifier = Modifier.height(6.dp))
                                val progress = if (item.durationSeconds > 0) {
                                    (item.positionSeconds.toFloat() / item.durationSeconds.toFloat()).coerceIn(0f, 1f)
                                } else 0f
                                LinearProgressIndicator(
                                    progress = progress,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(4.dp)
                                        .clip(RoundedCornerShape(2.dp)),
                                    color = PrimaryCyan,
                                    trackColor = DarkBackground
                                )
                                Spacer(modifier = Modifier.height(6.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        text = "Resumes at ${item.positionSeconds.formatTime()}",
                                        fontSize = 11.sp,
                                        color = TextSecondary
                                    )
                                    Icon(
                                        Icons.Default.PlayCircle,
                                        contentDescription = "Resume",
                                        tint = PrimaryCyan,
                                        modifier = Modifier.size(16.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // 4. Recent Media Section (Horizontal Carousel)
        if (uiState.recentMedia.isNotEmpty()) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Recent Media",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimary
                    )
                    Text(
                        text = "${uiState.availableCount} total",
                        fontSize = 12.sp,
                        color = PrimaryCyan,
                        modifier = Modifier.clickable(onClick = onNavigateToPlayer)
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(uiState.recentMedia, key = { it.id }) { movie ->
                        Card(
                            modifier = Modifier
                                .width(160.dp)
                                .clickable {
                                    val playUrl = movie.effectivePlayUrl
                                    if (playUrl.isNotBlank()) {
                                        onPlayMedia(playUrl, movie.cleanTitle, 0L)
                                    } else {
                                        onNavigateToPlayer()
                                    }
                                },
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = DarkSurface)
                        ) {
                            Column(modifier = Modifier.padding(10.dp)) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(90.dp)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(
                                            Brush.linearGradient(
                                                listOf(
                                                    Color(0xFF0F2027),
                                                    Color(0xFF203A43)
                                                )
                                            )
                                        ),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        Icons.Default.PlayCircle,
                                        contentDescription = null,
                                        tint = PrimaryCyan,
                                        modifier = Modifier.size(36.dp)
                                    )
                                }
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = movie.cleanTitle,
                                    style = MaterialTheme.typography.bodySmall,
                                    fontWeight = FontWeight.Medium,
                                    color = TextPrimary,
                                    maxLines = 1
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = movie.sizeFormatted,
                                    fontSize = 10.sp,
                                    color = TextSecondary
                                )
                            }
                        }
                    }
                }
            }
        }

        // 5. Quick Actions Section (Moved down below media)
        item {
            Text(
                text = "Quick Actions",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = TextPrimary
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Player Tile
                Card(
                    modifier = Modifier
                        .weight(1f)
                        .clickable(onClick = onNavigateToPlayer),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = DarkSurface)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Icon(Icons.Default.PlayCircle, contentDescription = null, tint = PrimaryCyan)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Player", style = MaterialTheme.typography.titleSmall, color = TextPrimary)
                        Text("${uiState.availableCount} movies", fontSize = 12.sp, color = TextSecondary)
                    }
                }

                // Transfer Tile
                Card(
                    modifier = Modifier
                        .weight(1f)
                        .clickable(onClick = onNavigateToTransfer),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = DarkSurface)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Icon(Icons.Default.Send, contentDescription = null, tint = SuccessGreen)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Send", style = MaterialTheme.typography.titleSmall, color = TextPrimary)
                        Text("Wireless upload", fontSize = 12.sp, color = TextSecondary)
                    }
                }

                // Files Tile
                Card(
                    modifier = Modifier
                        .weight(1f)
                        .clickable(onClick = onNavigateToFiles),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = DarkSurface)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Icon(Icons.Default.Folder, contentDescription = null, tint = WarningOrange)
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Storage", style = MaterialTheme.typography.titleSmall, color = TextPrimary)
                        Text("Files & USB", fontSize = 12.sp, color = TextSecondary)
                    }
                }
            }
        }
    }

    // Server Info Dialog (shown on tapping top status dot)
    if (showServerInfo) {
        AlertDialog(
            onDismissRequest = { showServerInfo = false },
            containerColor = DarkSurface,
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(if (isConnected) SuccessGreen else DangerRed)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isConnected) "Server Connected" else "Server Offline",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = TextPrimary
                    )
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "Endpoint: http://${uiState.systemStatus.hostIp}:${uiState.systemStatus.port}",
                        fontSize = 13.sp,
                        color = TextSecondary
                    )
                    Text(
                        text = "Mode: ${uiState.systemStatus.modeLabel}",
                        fontSize = 13.sp,
                        color = TextSecondary
                    )
                    Text(
                        text = "Available Movies: ${uiState.availableCount}",
                        fontSize = 13.sp,
                        color = TextSecondary
                    )
                    Text(
                        text = "Active Downloads: ${uiState.downloadingCount}",
                        fontSize = 13.sp,
                        color = TextSecondary
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { showServerInfo = false }) {
                    Text("OK", color = PrimaryCyan)
                }
            }
        )
    }
}
