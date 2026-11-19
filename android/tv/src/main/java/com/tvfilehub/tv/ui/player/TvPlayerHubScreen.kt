package com.tvfilehub.tv.ui.player

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tvfilehub.core.models.DownloadItem
import com.tvfilehub.core.models.StorageSource
import com.tvfilehub.tv.ui.components.TvFocusableCard
import com.tvfilehub.tv.ui.theme.*

@Composable
fun TvPlayerHubScreen(
    availableMovies: List<DownloadItem>,
    currentlyDownloading: List<DownloadItem>,
    onPlayMovie: (streamUrl: String, title: String) -> Unit,
    onPrioritize: (String) -> Unit,
    onSetLowPriority: (String) -> Unit,
    onSetNormalPriority: (String) -> Unit,
    onDelete: (String) -> Unit,
    onRefresh: () -> Unit,
    onOpenUrlDialog: () -> Unit,
    onOpenStorageDialog: () -> Unit,
    onOpenSettingsDialog: () -> Unit
) {
    var selectedSubtab by remember { mutableStateOf(0) } // 0: Available, 1: Downloads

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 32.dp, vertical = 16.dp)
    ) {
        // Banner Header & Action Buttons
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "🎬 Video Player & Downloads",
                    style = MaterialTheme.typography.headlineSmall,
                    color = Color.White
                )
                Text(
                    text = "Synced with Server • Autonomous BitTorrent Streaming Engine",
                    style = MaterialTheme.typography.bodySmall,
                    color = TvPrimary
                )
            }

            // Quick TV Remote Action Buttons
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                TvActionButton(label = "🔄 Refresh", onClick = onRefresh)
                TvActionButton(label = "📁 Storage", onClick = onOpenStorageDialog)
                TvActionButton(label = "🔗 URL / Magnet", onClick = onOpenUrlDialog)
                TvActionButton(label = "⚙️ Settings", onClick = onOpenSettingsDialog)
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Subtabs: Available Movies vs Active Downloads
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            TvSubtabPill(
                label = "✅ Available Movies (${availableMovies.size})",
                isSelected = selectedSubtab == 0,
                onClick = { selectedSubtab = 0 }
            )
            TvSubtabPill(
                label = "⚡ Active Downloads & Queue (${currentlyDownloading.size})",
                isSelected = selectedSubtab == 1,
                onClick = { selectedSubtab = 1 }
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Content
        if (selectedSubtab == 0) {
            if (availableMovies.isEmpty()) {
                TvEmptyState(
                    icon = Icons.Default.Movie,
                    title = "No Completed Movies",
                    subtitle = "Movies completed on the Server will automatically appear here."
                )
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(availableMovies, key = { it.id }) { movie ->
                        TvAvailableMovieRow(
                            movie = movie,
                            onPlay = {
                                val url = movie.effectivePlayUrl
                                if (url.isNotBlank()) onPlayMovie(url, movie.cleanTitle)
                            },
                            onDelete = { onDelete(movie.name) }
                        )
                    }
                }
            }
        } else {
            if (currentlyDownloading.isEmpty()) {
                TvEmptyState(
                    icon = Icons.Default.CloudDownload,
                    title = "No Active Downloads",
                    subtitle = "Upload .torrent files or add Magnet links from Phone or URL dialog."
                )
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(currentlyDownloading, key = { it.id }) { item ->
                        TvDownloadingItemRow(
                            item = item,
                            onPrioritize = { onPrioritize(item.name) },
                            onSetLow = { onSetLowPriority(item.name) },
                            onSetNormal = { onSetNormalPriority(item.name) },
                            onDelete = { onDelete(item.name) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun TvAvailableMovieRow(
    movie: DownloadItem,
    onPlay: () -> Unit,
    onDelete: () -> Unit
) {
    val (badgeBg, badgeColor, badgeText) = when (movie.storageSource) {
        StorageSource.LOCAL_STORAGE -> Triple(Color(0xFF10B981).copy(alpha = 0.2f), Color(0xFF10B981), "Local")
        StorageSource.USB_DRIVE -> Triple(Color(0xFFF59E0B).copy(alpha = 0.2f), Color(0xFFF59E0B), "USB")
        StorageSource.SERVER -> Triple(TvPrimary.copy(alpha = 0.2f), TvPrimary, "Server")
    }

    TvFocusableCard(
        modifier = Modifier.fillMaxWidth().height(80.dp),
        onClick = onPlay
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.weight(1f)
            ) {
                Icon(Icons.Default.PlayCircle, contentDescription = null, tint = badgeColor, modifier = Modifier.size(36.dp))
                Column {
                    Text(text = movie.cleanTitle, style = MaterialTheme.typography.titleMedium, color = Color.White, maxLines = 1)
                    Text(
                        text = if (movie.storageSource == StorageSource.SERVER)
                            "${movie.sizeFormatted} • Instant Stream"
                        else
                            "${movie.sizeFormatted} • Offline Ready (${movie.storageSource.label})",
                        fontSize = 12.sp,
                        color = TvTextSecondary
                    )
                }
            }

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = badgeBg
                ) {
                    Text(text = badgeText, color = badgeColor, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp))
                }
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = TvSuccess.copy(alpha = 0.2f)
                ) {
                    Text(text = "Ready", color = TvSuccess, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
                }
            }
        }
    }
}

@Composable
fun TvDownloadingItemRow(
    item: DownloadItem,
    onPrioritize: () -> Unit,
    onSetLow: () -> Unit,
    onSetNormal: () -> Unit,
    onDelete: () -> Unit
) {
    TvFocusableCard(
        modifier = Modifier.fillMaxWidth().height(100.dp),
        onClick = onPrioritize
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = item.cleanTitle, style = MaterialTheme.typography.titleSmall, color = Color.White, maxLines = 1, modifier = Modifier.weight(1f))
                Surface(
                    shape = RoundedCornerShape(6.dp),
                    color = if (item.priority == "Highest") TvDanger.copy(alpha = 0.25f) else TvSecondary.copy(alpha = 0.25f)
                ) {
                    Text(
                        text = item.priorityBadge.ifBlank { item.priority },
                        color = if (item.priority == "Highest") TvDanger else TvPrimary,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }
            }

            LinearProgressIndicator(
                progress = (item.progress.toFloat() / 100f).coerceIn(0f, 1f),
                modifier = Modifier.fillMaxWidth().height(6.dp),
                color = TvPrimary,
                trackColor = TvBackground
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = "${item.progressInt}% • ${item.speed} • ${item.peers} peers", fontSize = 12.sp, color = TvPrimary)
                Text(text = "${item.downloaded} / ${item.total} • ETA: ${item.timeRemaining}", fontSize = 12.sp, color = TvTextSecondary)
            }
        }
    }
}

@Composable
fun TvSubtabPill(label: String, isSelected: Boolean, onClick: () -> Unit) {
    var isFocused by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .onFocusChanged { isFocused = it.isFocused }
            .focusable()
            .clickable(onClick = onClick)
            .background(
                color = when {
                    isFocused -> TvPrimary.copy(alpha = 0.3f)
                    isSelected -> TvSurface
                    else -> Color.Transparent
                },
                shape = RoundedCornerShape(10.dp)
            )
            .border(
                width = if (isFocused) 2.dp else if (isSelected) 1.dp else 0.dp,
                color = if (isFocused) TvFocusBorder else if (isSelected) Color.White.copy(alpha = 0.2f) else Color.Transparent,
                shape = RoundedCornerShape(10.dp)
            )
            .padding(horizontal = 20.dp, vertical = 10.dp)
    ) {
        Text(text = label, color = if (isFocused || isSelected) TvPrimary else TvTextSecondary, fontSize = 15.sp)
    }
}

@Composable
fun TvActionButton(label: String, onClick: () -> Unit) {
    var isFocused by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .onFocusChanged { isFocused = it.isFocused }
            .focusable()
            .clickable(onClick = onClick)
            .background(
                color = if (isFocused) TvPrimary.copy(alpha = 0.3f) else TvSurface,
                shape = RoundedCornerShape(8.dp)
            )
            .border(
                width = if (isFocused) 2.dp else 1.dp,
                color = if (isFocused) TvFocusBorder else Color.White.copy(alpha = 0.1f),
                shape = RoundedCornerShape(8.dp)
            )
            .padding(horizontal = 14.dp, vertical = 8.dp)
    ) {
        Text(text = label, color = if (isFocused) TvPrimary else Color.White, fontSize = 13.sp)
    }
}

@Composable
fun TvEmptyState(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String) {
    Box(modifier = Modifier.fillMaxSize().padding(48.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, contentDescription = null, tint = TvTextSecondary, modifier = Modifier.size(64.dp))
            Spacer(modifier = Modifier.height(12.dp))
            Text(title, style = MaterialTheme.typography.titleLarge, color = Color.White)
            Spacer(modifier = Modifier.height(6.dp))
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = TvTextSecondary)
        }
    }
}
