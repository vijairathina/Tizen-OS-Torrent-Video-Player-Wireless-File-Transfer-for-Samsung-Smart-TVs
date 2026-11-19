package com.tvfilehub.tv.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tvfilehub.core.common.formatTime
import com.tvfilehub.core.database.entities.ResumePointEntity
import com.tvfilehub.core.models.DownloadItem
import com.tvfilehub.tv.navigation.TvDestination
import com.tvfilehub.tv.ui.components.TvFocusableCard
import com.tvfilehub.tv.ui.theme.*

@Composable
fun TvHomeScreen(
    featuredMovie: DownloadItem?,
    continueWatching: List<ResumePointEntity>,
    serverIp: String,
    onNavigate: (TvDestination) -> Unit,
    onPlayMedia: (streamUrl: String, title: String, startPosSec: Long) -> Unit,
    onOpenAdBlockModal: () -> Unit
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 32.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        // Hero Spotlight Banner (Apple TV / Google TV Style)
        item {
            TvFocusableCard(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(260.dp),
                onClick = {
                    if (featuredMovie != null && featuredMovie.effectivePlayUrl.isNotBlank()) {
                        onPlayMedia(featuredMovie.effectivePlayUrl, featuredMovie.cleanTitle, 0L)
                    } else {
                        onNavigate(TvDestination.Player)
                    }
                }
            ) { isFocused ->
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(
                            Brush.horizontalGradient(
                                colors = listOf(TvSecondary.copy(alpha = 0.7f), TvBackground.copy(alpha = 0.9f))
                            )
                        )
                        .padding(32.dp)
                ) {
                    Column(
                        modifier = Modifier.fillMaxHeight(),
                        verticalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = TvPrimary.copy(alpha = 0.25f)
                            ) {
                                Text(
                                    text = "★ FEATURED STREAM",
                                    color = TvPrimary,
                                    fontSize = 12.sp,
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                                )
                            }
                            Surface(
                                shape = RoundedCornerShape(6.dp),
                                color = Color.White.copy(alpha = 0.1f)
                            ) {
                                Text(
                                    text = "EXOPLAYER 4K",
                                    color = Color.White,
                                    fontSize = 12.sp,
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                                )
                            }
                        }

                        Column {
                            Text(
                                text = featuredMovie?.cleanTitle ?: "LinkPlay",
                                style = MaterialTheme.typography.headlineMedium,
                                color = Color.White
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = "High-Performance Media Hub • Wireless Phone Transfer • Seamless Torrent Streaming",
                                style = MaterialTheme.typography.bodyMedium,
                                color = TvTextSecondary
                            )
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            Button(
                                onClick = {
                                    if (featuredMovie != null && featuredMovie.effectivePlayUrl.isNotBlank()) {
                                        onPlayMedia(featuredMovie.effectivePlayUrl, featuredMovie.cleanTitle, 0L)
                                    } else {
                                        onNavigate(TvDestination.Player)
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = TvPrimary),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text("▶ Stream in Video Player", color = TvBackground, fontSize = 14.sp)
                            }

                            OutlinedButton(
                                onClick = { onNavigate(TvDestination.Receiver) },
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text("📥 Send from Phone", color = TvPrimary, fontSize = 14.sp)
                            }
                        }
                    }
                }
            }
        }

        // Quick Launch Row
        item {
            Text(
                text = "🚀 Quick Launch",
                style = MaterialTheme.typography.titleLarge,
                color = Color.White
            )
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Video Player Tile
                TvFocusableCard(
                    modifier = Modifier.weight(1f).height(120.dp),
                    onClick = { onNavigate(TvDestination.Player) }
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Icon(Icons.Default.PlayCircle, contentDescription = null, tint = TvPrimary, modifier = Modifier.size(28.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Video Player", style = MaterialTheme.typography.titleSmall, color = Color.White)
                        Text("BitTorrent Streaming & Media", fontSize = 12.sp, color = TvTextSecondary)
                    }
                }

                // Wireless Receiver Tile
                TvFocusableCard(
                    modifier = Modifier.weight(1f).height(120.dp),
                    onClick = { onNavigate(TvDestination.Receiver) }
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Icon(Icons.Default.Send, contentDescription = null, tint = TvSuccess, modifier = Modifier.size(28.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Wireless Receiver", style = MaterialTheme.typography.titleSmall, color = Color.White)
                        Text("Send Videos from Phone / PC", fontSize = 12.sp, color = TvTextSecondary)
                    }
                }

                // Storage Explorer Tile
                TvFocusableCard(
                    modifier = Modifier.weight(1f).height(120.dp),
                    onClick = { onNavigate(TvDestination.FileManager) }
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Icon(Icons.Default.Folder, contentDescription = null, tint = TvWarning, modifier = Modifier.size(28.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Storage Explorer", style = MaterialTheme.typography.titleSmall, color = Color.White)
                        Text("Browse USB & Local Storage", fontSize = 12.sp, color = TvTextSecondary)
                    }
                }

                // TV Boost & Shield Tile
                TvFocusableCard(
                    modifier = Modifier.weight(1f).height(120.dp),
                    onClick = onOpenAdBlockModal
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Icon(Icons.Default.Security, contentDescription = null, tint = TvSecondary, modifier = Modifier.size(28.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("TV Boost & Shield", style = MaterialTheme.typography.titleSmall, color = Color.White)
                        Text("Clean RAM • Zero TV Lag", fontSize = 12.sp, color = TvTextSecondary)
                    }
                }
            }
        }

        // Continue Watching Carousel
        if (continueWatching.isNotEmpty()) {
            item {
                Text(
                    text = "🎬 Continue Watching & Recent Media",
                    style = MaterialTheme.typography.titleLarge,
                    color = Color.White
                )
                Spacer(modifier = Modifier.height(12.dp))
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    items(continueWatching) { item ->
                        TvFocusableCard(
                            modifier = Modifier.width(280.dp).height(110.dp),
                            onClick = {
                                onPlayMedia(item.streamUrl, item.title, item.positionSeconds)
                            }
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(
                                    text = item.title,
                                    style = MaterialTheme.typography.titleSmall,
                                    color = Color.White,
                                    maxLines = 1
                                )
                                Spacer(modifier = Modifier.height(10.dp))
                                val progress = if (item.durationSeconds > 0) {
                                    (item.positionSeconds.toFloat() / item.durationSeconds.toFloat()).coerceIn(0f, 1f)
                                } else 0f
                                LinearProgressIndicator(
                                    progress = progress,
                                    modifier = Modifier.fillMaxWidth().height(6.dp),
                                    color = TvPrimary,
                                    trackColor = TvBackground
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = "Resumes at ${item.positionSeconds.formatTime()}",
                                    fontSize = 12.sp,
                                    color = TvTextSecondary
                                )
                            }
                        }
                    }
                }
            }
        }

        // System & Companion Network Gauges
        item {
            Text(
                text = "📊 TV Hub Status & Storage Health",
                style = MaterialTheme.typography.titleLarge,
                color = Color.White
            )
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Storage Gauge
                Card(
                    modifier = Modifier.weight(1f).height(120.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = TvSurface)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Storage, contentDescription = null, tint = TvPrimary, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Active Storage Target", style = MaterialTheme.typography.titleSmall, color = Color.White)
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("USB Drive / Server Storage", fontSize = 13.sp, color = TvPrimary)
                        Text("Target: /TVFileHub/Received/", fontSize = 12.sp, color = TvTextSecondary)
                    }
                }

                // Companion Network Gauge
                Card(
                    modifier = Modifier.weight(1f).height(120.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = TvSurface)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Wifi, contentDescription = null, tint = TvSuccess, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Companion Bridge Network", style = MaterialTheme.typography.titleSmall, color = Color.White)
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Host: http://$serverIp:8080", fontSize = 13.sp, color = TvSuccess)
                        Text("WebSocket: Connected • Port 8080", fontSize = 12.sp, color = TvTextSecondary)
                    }
                }
            }
        }
    }
}
