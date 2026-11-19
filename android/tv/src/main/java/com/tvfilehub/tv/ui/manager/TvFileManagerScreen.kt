package com.tvfilehub.tv.ui.manager

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tvfilehub.core.common.cleanMediaTitle
import com.tvfilehub.core.models.FileNode
import com.tvfilehub.tv.ui.components.TvFocusableCard
import com.tvfilehub.tv.ui.theme.*

@Composable
fun TvFileManagerScreen(
    files: List<FileNode>,
    onPlayMedia: (streamUrl: String, title: String) -> Unit,
    onRefresh: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 32.dp, vertical = 16.dp)
    ) {
        // Toolbar
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(text = "📁 Storage Explorer", style = MaterialTheme.typography.headlineSmall, color = Color.White)
                Text(text = "Target: /TVFileHub/Received/ • USB & Server Storage", fontSize = 12.sp, color = TvTextSecondary)
            }

            Button(
                onClick = onRefresh,
                colors = ButtonDefaults.buttonColors(containerColor = TvSurface),
                shape = RoundedCornerShape(8.dp)
            ) {
                Text("🔄 Refresh Storage", color = TvPrimary, fontSize = 13.sp)
            }
        }

        Spacer(modifier = Modifier.height(20.dp))

        if (files.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.FolderOpen, contentDescription = null, tint = TvTextSecondary, modifier = Modifier.size(56.dp))
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("No media files found in active storage", color = Color.White, fontSize = 16.sp)
                }
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                items(files) { file ->
                    TvFocusableCard(
                        modifier = Modifier.height(90.dp),
                        onClick = {
                            if (!file.isDirectory && file.path.isNotBlank()) {
                                onPlayMedia(file.path, file.name.cleanMediaTitle())
                            }
                        }
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = if (file.isDirectory) Icons.Default.Folder else Icons.Default.VideoFile,
                                contentDescription = null,
                                tint = if (file.isDirectory) TvWarning else TvPrimary,
                                modifier = Modifier.size(36.dp)
                            )
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text(text = file.name, color = Color.White, fontSize = 14.sp, maxLines = 1)
                                Text(text = "${file.sizeFormatted} • ${file.extension.uppercase()}", fontSize = 11.sp, color = TvTextSecondary)
                            }
                        }
                    }
                }
            }
        }
    }
}
