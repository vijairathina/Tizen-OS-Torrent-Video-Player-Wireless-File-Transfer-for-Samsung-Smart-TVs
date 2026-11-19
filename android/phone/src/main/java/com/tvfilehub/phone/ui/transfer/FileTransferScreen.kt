package com.tvfilehub.phone.ui.transfer

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tvfilehub.phone.ui.theme.*

@Composable
fun FileTransferScreen(
    viewModel: FileTransferViewModel
) {
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsState()

    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let { viewModel.uploadFromUri(context, it) }
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text(
                text = "Wireless File Sender",
                style = MaterialTheme.typography.titleLarge,
                color = TextPrimary
            )
            Text(
                text = "Send Videos, .torrent files, or documents across your LinkPlay devices",
                style = MaterialTheme.typography.bodySmall,
                color = TextSecondary
            )
        }

        // Storage Target Banner
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text(
                            text = "Target Destination",
                            fontSize = 12.sp,
                            color = TextSecondary
                        )
                        Text(
                            text = uiState.storageTarget,
                            style = MaterialTheme.typography.titleSmall,
                            color = PrimaryCyan
                        )
                    }

                    Surface(
                        shape = RoundedCornerShape(6.dp),
                        color = if (uiState.isWebSocketOnline) SuccessGreen.copy(alpha = 0.2f) else DangerRed.copy(alpha = 0.2f)
                    ) {
                        Text(
                            text = if (uiState.isWebSocketOnline) "Bridge Online" else "Bridge Offline",
                            color = if (uiState.isWebSocketOnline) SuccessGreen else DangerRed,
                            fontSize = 11.sp,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
            }
        }

        // Upload Button Card
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = DarkCard)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(
                        imageVector = Icons.Default.CloudUpload,
                        contentDescription = null,
                        tint = PrimaryCyan,
                        modifier = Modifier.size(56.dp)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Upload to LinkPlay Hub",
                        style = MaterialTheme.typography.titleMedium,
                        color = TextPrimary
                    )
                    Text(
                        text = "Pick .torrent files, MP4, MKV, or subtitles from this device",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(
                        onClick = { filePickerLauncher.launch("*/*") },
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryCyan),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(Icons.Default.UploadFile, contentDescription = null, tint = DarkBackground)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Select File", color = DarkBackground)
                    }
                }
            }
        }

        // Upload Progress Status
        uiState.currentUpload?.let { task ->
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = DarkSurface)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(text = "Uploading: ${task.fileName}", style = MaterialTheme.typography.bodyMedium, color = TextPrimary)
                        Spacer(modifier = Modifier.height(8.dp))
                        if (task.isUploading) {
                            LinearProgressIndicator(
                                modifier = Modifier.fillMaxWidth(),
                                color = PrimaryCyan,
                                trackColor = DarkBackground
                            )
                        } else if (task.isSuccess) {
                            Text(text = "✓ Uploaded Successfully!", color = SuccessGreen, fontSize = 12.sp)
                        } else if (task.error != null) {
                            Text(text = "Error: ${task.error}", color = DangerRed, fontSize = 12.sp)
                        }
                    }
                }
            }
        }

        // Recent Transfers Feed
        item {
            Text(
                text = "Recent Transfer Feed",
                style = MaterialTheme.typography.titleMedium,
                color = TextPrimary
            )
        }

        if (uiState.recentTransfers.isEmpty()) {
            item {
                Text(
                    text = "No files transferred in this session.",
                    fontSize = 13.sp,
                    color = TextSecondary
                )
            }
        } else {
            items(uiState.recentTransfers) { fileName ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = DarkSurface)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.InsertDriveFile, contentDescription = null, tint = PrimaryCyan)
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            text = fileName,
                            style = MaterialTheme.typography.bodyMedium,
                            color = TextPrimary,
                            maxLines = 1
                        )
                    }
                }
            }
        }
    }
}
