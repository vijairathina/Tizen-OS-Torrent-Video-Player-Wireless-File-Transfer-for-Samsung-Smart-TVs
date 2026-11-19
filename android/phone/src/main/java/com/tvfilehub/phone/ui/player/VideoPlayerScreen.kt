package com.tvfilehub.phone.ui.player

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tvfilehub.core.models.DownloadItem
import com.tvfilehub.core.models.StorageSource
import com.tvfilehub.core.models.TorrentEpisode
import com.tvfilehub.phone.ui.theme.*

@Composable
fun VideoPlayerScreen(
    viewModel: VideoPlayerViewModel,
    onPlayMovie: (streamUrl: String, title: String) -> Unit
) {
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsState()
    var showUrlDialog by remember { mutableStateOf(false) }

    // Multi-Episode Selection Dialog state
    var activeEpisodeItem by remember { mutableStateOf<DownloadItem?>(null) }
    var episodeList by remember { mutableStateOf<List<TorrentEpisode>>(emptyList()) }
    var isLoadingEpisodes by remember { mutableStateOf(false) }

    fun openEpisodes(item: DownloadItem) {
        activeEpisodeItem = item
        if (item.episodes.isNotEmpty()) {
            episodeList = item.episodes
            isLoadingEpisodes = false
        } else {
            isLoadingEpisodes = true
            viewModel.fetchEpisodes(item) { eps ->
                episodeList = eps
                isLoadingEpisodes = false
            }
        }
    }

    Scaffold(
        containerColor = DarkBackground,
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showUrlDialog = true },
                containerColor = PrimaryCyan,
                contentColor = DarkBackground
            ) {
                Icon(Icons.Default.Add, contentDescription = "Add URL or Magnet")
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Header Tabs
            TabRow(
                selectedTabIndex = uiState.activeSubtab.ordinal,
                containerColor = DarkSurface,
                contentColor = PrimaryCyan
            ) {
                Tab(
                    selected = uiState.activeSubtab == PlayerSubtab.AVAILABLE,
                    onClick = { viewModel.setSubtab(PlayerSubtab.AVAILABLE) },
                    text = {
                        Text("Available (${uiState.availableMovies.size})")
                    }
                )
                Tab(
                    selected = uiState.activeSubtab == PlayerSubtab.DOWNLOADING,
                    onClick = { viewModel.setSubtab(PlayerSubtab.DOWNLOADING) },
                    text = {
                        Text("Downloading (${uiState.currentlyDownloading.size})")
                    }
                )
            }

            // Content List
            when (uiState.activeSubtab) {
                PlayerSubtab.AVAILABLE -> {
                    if (uiState.availableMovies.isEmpty()) {
                        EmptyStateView(
                            icon = Icons.Default.Movie,
                            title = "No Movies Ready",
                            subtitle = "Completed downloads from Server will appear here for instant streaming."
                        )
                    } else {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            items(uiState.availableMovies, key = { it.id }) { movie ->
                                val progress = uiState.localDownloadProgress[movie.id]
                                AvailableMovieCard(
                                    movie = movie,
                                    downloadProgress = progress,
                                    onPlay = {
                                        if (movie.isDownloading && (movie.hasMultipleEpisodes || movie.episodes.isNotEmpty())) {
                                            openEpisodes(movie)
                                        } else if (movie.isDownloading) {
                                            viewModel.playDownloadingItem(movie) { url, title ->
                                                onPlayMovie(url, title)
                                            }
                                        } else {
                                            val playUrl = movie.effectivePlayUrl
                                            if (playUrl.isNotBlank()) {
                                                onPlayMovie(playUrl, movie.cleanTitle)
                                            }
                                        }
                                    },
                                    onSelectEpisodes = { if (movie.isDownloading) openEpisodes(movie) },
                                    onDownloadToLocal = {
                                        viewModel.downloadToLocal(context, movie)
                                    },
                                    onDelete = { viewModel.deleteDownload(movie.name) }
                                )
                            }
                        }
                    }
                }

                PlayerSubtab.DOWNLOADING -> {
                    if (uiState.currentlyDownloading.isEmpty()) {
                        EmptyStateView(
                            icon = Icons.Default.Download,
                            title = "Queue is Empty",
                            subtitle = "Upload a .torrent file or add a Magnet link to begin downloading."
                        )
                    } else {
                        LazyColumn(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            items(uiState.currentlyDownloading, key = { it.id }) { item ->
                                DownloadingMovieCard(
                                    item = item,
                                    onPlay = {
                                        if (item.hasMultipleEpisodes || item.episodes.isNotEmpty()) {
                                            openEpisodes(item)
                                        } else {
                                            viewModel.playDownloadingItem(item) { url, title ->
                                                onPlayMovie(url, title)
                                            }
                                        }
                                    },
                                    onSelectEpisodes = { openEpisodes(item) },
                                    onTogglePause = { viewModel.togglePauseTorrent(item) },
                                    onPrioritize = {
                                        viewModel.prioritizeTorrent(item.name) { url, title ->
                                            onPlayMovie(url, title)
                                        }
                                    },
                                    onSetLow = { viewModel.setLowPriority(item.name) },
                                    onSetNormal = { viewModel.setNormalPriority(item.name) },
                                    onDelete = { viewModel.deleteDownload(item.name) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // Multi-Episode Selection Dialog
    if (activeEpisodeItem != null) {
        EpisodeSelectionDialog(
            item = activeEpisodeItem!!,
            episodes = episodeList,
            isLoading = isLoadingEpisodes,
            onSelectEpisode = { ep ->
                val itm = activeEpisodeItem!!
                activeEpisodeItem = null
                viewModel.playEpisode(itm, ep) { url, title ->
                    onPlayMovie(url, title)
                }
            },
            onDismiss = { activeEpisodeItem = null }
        )
    }

    if (showUrlDialog) {
        UrlInputDialog(
            onDismiss = { showUrlDialog = false },
            onSubmit = { url ->
                viewModel.startFromUrlOrMagnet(url)
                showUrlDialog = false
            }
        )
    }
}

@Composable
fun AvailableMovieCard(
    movie: DownloadItem,
    downloadProgress: Int? = null,
    onPlay: () -> Unit,
    onSelectEpisodes: (() -> Unit)? = null,
    onDownloadToLocal: () -> Unit,
    onDelete: () -> Unit
) {
    val (badgeBg, badgeColor, badgeLabel) = when {
        movie.isDownloading -> Triple(
            if (movie.isPaused) Color(0xFFF59E0B).copy(alpha = 0.2f) else PrimaryCyan.copy(alpha = 0.2f),
            if (movie.isPaused) Color(0xFFF59E0B) else PrimaryCyan,
            if (movie.isPaused) "Paused" else "Downloading ${movie.progressInt}%"
        )
        movie.storageSource == StorageSource.LOCAL_STORAGE -> Triple(Color(0xFF10B981).copy(alpha = 0.2f), Color(0xFF10B981), "Local")
        movie.storageSource == StorageSource.USB_DRIVE -> Triple(Color(0xFFF59E0B).copy(alpha = 0.2f), Color(0xFFF59E0B), "USB")
        else -> Triple(PrimaryCyan.copy(alpha = 0.2f), PrimaryCyan, "Server")
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onPlay),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = DarkSurface)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = movie.cleanTitle,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimary
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            shape = RoundedCornerShape(4.dp),
                            color = badgeBg
                        ) {
                            Text(
                                text = badgeLabel,
                                color = badgeColor,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }

                        if (movie.isDownloading && movie.hasMultipleEpisodes) {
                            Surface(
                                shape = RoundedCornerShape(4.dp),
                                color = AccentPurple.copy(alpha = 0.25f),
                                modifier = Modifier.clickable { onSelectEpisodes?.invoke() ?: onPlay() }
                            ) {
                                Text(
                                    text = "📑 ${movie.totalEpisodes.coerceAtLeast(movie.episodes.size)} Episodes",
                                    color = PrimaryCyan,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Medium,
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                )
                            }
                        }

                        if (movie.sizeFormatted.isNotBlank()) {
                            Text(text = movie.sizeFormatted, fontSize = 12.sp, color = TextSecondary)
                        }
                    }
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (!movie.isDownloading && movie.storageSource == StorageSource.SERVER && downloadProgress == null) {
                        IconButton(onClick = onDownloadToLocal) {
                            Icon(Icons.Default.Download, contentDescription = "Save to Device", tint = PrimaryCyan)
                        }
                    }
                    IconButton(onClick = onPlay) {
                        Icon(Icons.Default.PlayCircle, contentDescription = "Play", tint = PrimaryCyan)
                    }
                }
            }

            if (downloadProgress != null) {
                Spacer(modifier = Modifier.height(8.dp))
                LinearProgressIndicator(
                    progress = (downloadProgress.toFloat() / 100f).coerceIn(0f, 1f),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp)),
                    color = PrimaryCyan,
                    trackColor = DarkBackground
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Downloading to phone storage: $downloadProgress%",
                    fontSize = 11.sp,
                    color = PrimaryCyan
                )
            }
        }
    }
}

@Composable
fun DownloadingMovieCard(
    item: DownloadItem,
    onPlay: () -> Unit,
    onSelectEpisodes: (() -> Unit)? = null,
    onTogglePause: () -> Unit,
    onPrioritize: () -> Unit,
    onSetLow: () -> Unit,
    onSetNormal: () -> Unit,
    onDelete: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = DarkSurface)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = item.cleanTitle,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimary,
                    modifier = Modifier.weight(1f)
                )

                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (item.hasMultipleEpisodes) {
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = AccentPurple.copy(alpha = 0.25f),
                            modifier = Modifier.clickable { onSelectEpisodes?.invoke() ?: onPlay() }
                        ) {
                            Text(
                                text = "📑 ${item.totalEpisodes.coerceAtLeast(item.episodes.size)} Episodes",
                                color = PrimaryCyan,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }

                    if (item.isPaused) {
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = Color(0xFFF59E0B).copy(alpha = 0.2f)
                        ) {
                            Text(
                                text = "Paused",
                                color = Color(0xFFF59E0B),
                                fontSize = 11.sp,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    } else if (item.priority == "Highest") {
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = DangerRed.copy(alpha = 0.2f)
                        ) {
                            Text(
                                text = "Highest",
                                color = DangerRed,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    } else {
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = AccentPurple.copy(alpha = 0.2f)
                        ) {
                            Text(
                                text = item.priority,
                                color = PrimaryCyan,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }

                    IconButton(onClick = onPlay, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Default.PlayCircle, contentDescription = "Play Video", tint = PrimaryCyan)
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            LinearProgressIndicator(
                progress = (item.progress.toFloat() / 100f).coerceIn(0f, 1f),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp)
                    .clip(RoundedCornerShape(3.dp)),
                color = if (item.isPaused) Color(0xFFF59E0B) else PrimaryCyan,
                trackColor = DarkBackground
            )

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = if (item.isPaused) "${item.progressInt}% • Paused" else "${item.progressInt}% • ${item.speed}",
                    fontSize = 12.sp,
                    color = if (item.isPaused) Color(0xFFF59E0B) else PrimaryCyan
                )
                Text(text = "${item.downloaded} / ${item.total}", fontSize = 12.sp, color = TextSecondary)
            }

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Play / Episode selection button
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Button(
                        onClick = onPlay,
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryCyan),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                    ) {
                        Icon(
                            Icons.Default.PlayArrow,
                            contentDescription = null,
                            tint = DarkBackground,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = if (item.hasMultipleEpisodes) "Choose Ep & Play" else "Play Video",
                            color = DarkBackground,
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp
                        )
                    }

                    if (item.hasMultipleEpisodes) {
                        OutlinedButton(
                            onClick = { onSelectEpisodes?.invoke() ?: onPlay() },
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 6.dp)
                        ) {
                            Icon(Icons.Default.List, contentDescription = null, tint = PrimaryCyan, modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(3.dp))
                            Text("Ep (${item.totalEpisodes.coerceAtLeast(item.episodes.size)})", color = PrimaryCyan, fontSize = 11.sp)
                        }
                    }
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    // Pause / Resume Button
                    TextButton(onClick = onTogglePause) {
                        Icon(
                            imageVector = if (item.isPaused) Icons.Default.PlayArrow else Icons.Default.Pause,
                            contentDescription = if (item.isPaused) "Resume" else "Pause",
                            tint = if (item.isPaused) Color(0xFF10B981) else Color(0xFFF59E0B),
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = if (item.isPaused) "Resume" else "Pause",
                            color = if (item.isPaused) Color(0xFF10B981) else Color(0xFFF59E0B),
                            fontSize = 12.sp
                        )
                    }

                    // Stream First
                    TextButton(onClick = onPrioritize) {
                        Text("Stream First", color = PrimaryCyan, fontSize = 12.sp)
                    }

                    // Low Priority
                    TextButton(onClick = onSetLow) {
                        Text("Low", color = TextSecondary, fontSize = 12.sp)
                    }

                    // Delete
                    IconButton(onClick = onDelete) {
                        Icon(Icons.Default.Delete, contentDescription = "Delete", tint = DangerRed)
                    }
                }
            }
        }
    }
}

@Composable
fun EpisodeSelectionDialog(
    item: DownloadItem,
    episodes: List<TorrentEpisode>,
    isLoading: Boolean,
    onSelectEpisode: (TorrentEpisode) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = DarkSurface,
        title = {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.VideoLibrary, contentDescription = null, tint = PrimaryCyan, modifier = Modifier.size(20.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Select Episode",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = PrimaryCyan
                        )
                    }
                    IconButton(onClick = onDismiss, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "Close", tint = TextSecondary)
                    }
                }
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = item.cleanTitle,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimary,
                    maxLines = 2
                )
            }
        },
        text = {
            if (isLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(160.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = PrimaryCyan, modifier = Modifier.size(36.dp))
                        Spacer(modifier = Modifier.height(10.dp))
                        Text("Discovering episodes in torrent swarm...", fontSize = 12.sp, color = TextSecondary)
                    }
                }
            } else if (episodes.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(100.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "No multiple episodes detected. You can stream the main video file.",
                        fontSize = 13.sp,
                        color = TextSecondary
                    )
                }
            } else {
                Column {
                    Text(
                        text = "${episodes.size} episodes available to stream:",
                        fontSize = 11.sp,
                        color = TextSecondary,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                    LazyColumn(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 380.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(episodes, key = { it.index }) { ep ->
                            Card(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { onSelectEpisode(ep) },
                                shape = RoundedCornerShape(10.dp),
                                colors = CardDefaults.cardColors(containerColor = DarkCard)
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = ep.name.ifBlank { "Episode #${ep.index + 1}" },
                                            style = MaterialTheme.typography.bodyMedium,
                                            fontWeight = FontWeight.Medium,
                                            color = TextPrimary,
                                            maxLines = 2
                                        )
                                        Spacer(modifier = Modifier.height(4.dp))
                                        Row(
                                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Surface(
                                                shape = RoundedCornerShape(4.dp),
                                                color = if (ep.isDownloaded) Color(0xFF10B981).copy(alpha = 0.2f) else PrimaryCyan.copy(alpha = 0.2f)
                                            ) {
                                                Text(
                                                    text = if (ep.isDownloaded) "Downloaded" else "Ready to Stream",
                                                    color = if (ep.isDownloaded) Color(0xFF10B981) else PrimaryCyan,
                                                    fontSize = 10.sp,
                                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                )
                                            }
                                            if (ep.displaySize.isNotBlank()) {
                                                Text(text = ep.displaySize, fontSize = 11.sp, color = TextSecondary)
                                            }
                                        }
                                    }
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Icon(
                                        imageVector = Icons.Default.PlayCircle,
                                        contentDescription = "Stream Episode",
                                        tint = PrimaryCyan,
                                        modifier = Modifier.size(32.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {}
    )
}

@Composable
fun EmptyStateView(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, contentDescription = null, tint = TextSecondary, modifier = Modifier.size(56.dp))
            Spacer(modifier = Modifier.height(12.dp))
            Text(title, style = MaterialTheme.typography.titleMedium, color = TextPrimary)
            Spacer(modifier = Modifier.height(6.dp))
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = TextSecondary)
        }
    }
}

@Composable
fun UrlInputDialog(
    onDismiss: () -> Unit,
    onSubmit: (String) -> Unit
) {
    var text by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Stream from URL / Magnet", color = TextPrimary) },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                label = { Text("Enter HTTP URL or Magnet URI") },
                singleLine = false,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = PrimaryCyan,
                    unfocusedBorderColor = TextSecondary,
                    focusedTextColor = TextPrimary,
                    unfocusedTextColor = TextPrimary
                )
            )
        },
        confirmButton = {
            Button(
                onClick = { if (text.isNotBlank()) onSubmit(text) },
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryCyan)
            ) {
                Text("Start", color = DarkBackground)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = TextSecondary)
            }
        },
        containerColor = DarkSurface
    )
}
