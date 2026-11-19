package com.tvfilehub.tv.ui.receiver

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tvfilehub.core.common.QrCodeGenerator
import com.tvfilehub.tv.ui.components.TvFocusableCard
import com.tvfilehub.tv.ui.theme.*

@Composable
fun TvReceiverScreen(
    serverIp: String,
    localIp: String,
    receiverPort: Int = 8080,
    isOfflineMode: Boolean = false,
    storageTarget: String,
    receivedFiles: List<String>,
    onClearHistory: () -> Unit,
    onToggleStorageTarget: () -> Unit,
    onOpenSettings: () -> Unit
) {
    val activeUrl = if (isOfflineMode) {
        "http://$localIp:$receiverPort"
    } else {
        "http://$serverIp:8080"
    }

    val qrBitmap = remember(activeUrl) {
        QrCodeGenerator.generateQrBitmap(activeUrl, size = 260)
    }

    Row(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 32.dp, vertical = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        // Left Connection & Guide Panel
        Card(
            modifier = Modifier.weight(1.1f).fillMaxHeight(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = TvSurface)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(20.dp),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.QrCode, contentDescription = null, tint = TvPrimary, modifier = Modifier.size(26.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(text = "LinkPlay Direct Receiver", style = MaterialTheme.typography.titleMedium, color = Color.White)
                        }

                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = if (isOfflineMode) Color(0xFFF59E0B).copy(alpha = 0.2f) else TvSuccess.copy(alpha = 0.2f)
                        ) {
                            Text(
                                text = if (isOfflineMode) "Offline TV Mode" else "Server Bridge",
                                color = if (isOfflineMode) Color(0xFFF59E0B) else TvSuccess,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // QR / URL Card
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(Color.White.copy(alpha = 0.05f), RoundedCornerShape(12.dp))
                            .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        if (qrBitmap != null) {
                            Box(
                                modifier = Modifier
                                    .size(130.dp)
                                    .background(Color.White, RoundedCornerShape(8.dp))
                                    .padding(6.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Image(
                                    bitmap = qrBitmap.asImageBitmap(),
                                    contentDescription = "Scan to Upload",
                                    modifier = Modifier.fillMaxSize()
                                )
                            }
                        }

                        Column(modifier = Modifier.weight(1f)) {
                            Text(text = "Scan with Mobile Camera:", fontSize = 12.sp, color = TvTextSecondary)
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(text = activeUrl, fontSize = 16.sp, color = TvPrimary, style = MaterialTheme.typography.titleSmall)
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = if (isOfflineMode)
                                    "Direct phone-to-TV transfer via TV's embedded server."
                                else
                                    "Uploads routed via Companion Server.",
                                fontSize = 11.sp,
                                color = TvTextSecondary
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // Connection Info
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        InfoRow(label = "TV Local IP:", value = localIp)
                        InfoRow(label = "Receiver Port:", value = "$receiverPort")
                        InfoRow(
                            label = "Engine:",
                            value = if (isOfflineMode) "Embedded TV Server" else "Companion Server"
                        )
                    }
                }

                // Target Storage Box
                TvFocusableCard(
                    modifier = Modifier.fillMaxWidth().height(72.dp),
                    onClick = onToggleStorageTarget
                ) {
                    Column(modifier = Modifier.padding(10.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Save, contentDescription = null, tint = TvSuccess, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(text = "Target Storage: $storageTarget", style = MaterialTheme.typography.titleSmall, color = Color.White)
                        }
                        Text(text = "Press OK to toggle Storage (Local Flash / USB)", fontSize = 11.sp, color = TvTextSecondary)
                    }
                }
            }
        }

        // Right Incoming Queue Panel
        Card(
            modifier = Modifier.weight(1.1f).fillMaxHeight(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = TvSurface)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(text = "📥 Received Files (${receivedFiles.size})", style = MaterialTheme.typography.titleMedium, color = Color.White)
                    Button(
                        onClick = onClearHistory,
                        colors = ButtonDefaults.buttonColors(containerColor = Color.White.copy(alpha = 0.1f)),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
                    ) {
                        Text("🧹 Clear List", color = Color.White, fontSize = 11.sp)
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                if (receivedFiles.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.CloudDownload, contentDescription = null, tint = TvTextSecondary, modifier = Modifier.size(44.dp))
                            Spacer(modifier = Modifier.height(10.dp))
                            Text(text = "Ready to receive files", style = MaterialTheme.typography.titleMedium, color = Color.White)
                            Text(text = "Open the QR code link on your phone to upload files", style = MaterialTheme.typography.bodySmall, color = TvTextSecondary)
                        }
                    }
                } else {
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(receivedFiles) { fileName ->
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(8.dp),
                                colors = CardDefaults.cardColors(containerColor = TvCard)
                            ) {
                                Row(
                                    modifier = Modifier.padding(10.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = TvSuccess, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(10.dp))
                                    Text(text = fileName, color = Color.White, fontSize = 13.sp)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = label, color = TvTextSecondary, fontSize = 12.sp)
        Text(text = value, color = Color.White, fontSize = 12.sp)
    }
}
