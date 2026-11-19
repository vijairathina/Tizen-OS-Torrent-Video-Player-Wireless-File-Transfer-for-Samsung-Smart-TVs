package com.tvfilehub.phone.ui.manager

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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tvfilehub.core.common.cleanMediaTitle
import com.tvfilehub.core.models.FileNode
import com.tvfilehub.phone.ui.theme.*

@Composable
fun StorageExplorerScreen(
    viewModel: StorageExplorerViewModel,
    onPlayMedia: (streamUrl: String, title: String) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(16.dp)
    ) {
        // Toolbar
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "Storage Explorer",
                    style = MaterialTheme.typography.titleLarge,
                    color = TextPrimary
                )
                Text(
                    text = uiState.currentPath,
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary
                )
            }

            IconButton(onClick = { viewModel.loadMediaFiles() }) {
                Icon(Icons.Default.Refresh, contentDescription = "Refresh", tint = PrimaryCyan)
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        if (uiState.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = PrimaryCyan)
            }
        } else if (uiState.fileNodes.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.FolderOpen, contentDescription = null, tint = TextSecondary, modifier = Modifier.size(56.dp))
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("No Files Found", style = MaterialTheme.typography.titleMedium, color = TextPrimary)
                    Text("Storage directory is empty", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                }
            }
        } else {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                items(uiState.fileNodes) { file ->
                    FileItemRow(
                        file = file,
                        onClick = {
                            if (!file.isDirectory && file.path.isNotBlank()) {
                                onPlayMedia(file.path, file.name.cleanMediaTitle())
                            }
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun FileItemRow(file: FileNode, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = DarkSurface)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = if (file.isDirectory) Icons.Default.Folder else Icons.Default.VideoFile,
                contentDescription = null,
                tint = if (file.isDirectory) WarningOrange else PrimaryCyan,
                modifier = Modifier.size(36.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = file.name,
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextPrimary,
                    maxLines = 1
                )
                Text(
                    text = if (file.isDirectory) "Directory" else "${file.sizeFormatted} • ${file.extension.uppercase()}",
                    fontSize = 11.sp,
                    color = TextSecondary
                )
            }
            if (!file.isDirectory) {
                Icon(Icons.Default.PlayArrow, contentDescription = "Play", tint = PrimaryCyan)
            }
        }
    }
}
