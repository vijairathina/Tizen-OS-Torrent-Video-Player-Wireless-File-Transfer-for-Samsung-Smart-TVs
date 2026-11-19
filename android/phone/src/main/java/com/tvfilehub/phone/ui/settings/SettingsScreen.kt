package com.tvfilehub.phone.ui.settings

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tvfilehub.core.common.Constants
import com.tvfilehub.core.models.OperatingMode
import com.tvfilehub.core.network.ApiClient
import com.tvfilehub.core.services.LocalMediaScanner
import com.tvfilehub.phone.PhoneApp
import com.tvfilehub.phone.ui.theme.*

@Composable
fun SettingsScreen() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("tvfilehub_prefs", Context.MODE_PRIVATE) }

    val operatingMode by PhoneApp.instance.serverHealthTracker.operatingMode.collectAsState()
    var isManualOffline by remember {
        mutableStateOf(prefs.getBoolean("pref_manual_offline_mode", false))
    }

    var serverIp by remember {
        mutableStateOf(prefs.getString(Constants.PREF_KEY_SERVER_IP, Constants.DEFAULT_SERVER_HOST) ?: Constants.DEFAULT_SERVER_HOST)
    }
    var storageMode by remember {
        mutableStateOf(prefs.getString(Constants.PREF_KEY_STORAGE_MODE, Constants.STORAGE_MODE_USB) ?: Constants.STORAGE_MODE_USB)
    }
    var autoTorrent by remember {
        mutableStateOf(prefs.getBoolean(Constants.PREF_KEY_AUTO_TORRENT, true))
    }
    var isSavedToastVisible by remember { mutableStateOf(false) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(DarkBackground)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text(
                text = "Settings & Preferences",
                style = MaterialTheme.typography.titleLarge,
                color = TextPrimary
            )
        }

        // Offline Mode Card
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Offline Mode (Standalone)",
                                style = MaterialTheme.typography.titleSmall,
                                color = TextPrimary
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = "Operate purely offline using local device storage without connecting to Companion Server",
                                fontSize = 12.sp,
                                color = TextSecondary
                            )
                        }
                        Switch(
                            checked = isManualOffline,
                            onCheckedChange = { enabled ->
                                isManualOffline = enabled
                                prefs.edit().putBoolean("pref_manual_offline_mode", enabled).apply()
                                PhoneApp.instance.serverHealthTracker.setManualOffline(enabled)
                            },
                            colors = SwitchDefaults.colors(checkedThumbColor = PrimaryCyan)
                        )
                    }

                    Spacer(modifier = Modifier.height(10.dp))
                    HorizontalDivider(color = DarkBackground)
                    Spacer(modifier = Modifier.height(10.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(text = "Current State:", fontSize = 12.sp, color = TextSecondary)
                        val (statusText, statusColor) = when (operatingMode) {
                            OperatingMode.ONLINE_BRIDGE -> Pair("Connected to Server", SuccessGreen)
                            OperatingMode.OFFLINE_MANUAL -> Pair("Manual Offline Mode", Color(0xFFF59E0B))
                            OperatingMode.OFFLINE_FALLBACK -> Pair("Server Unreachable (Offline)", DangerRed)
                        }
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = statusColor.copy(alpha = 0.2f)
                        ) {
                            Text(
                                text = statusText,
                                color = statusColor,
                                fontSize = 11.sp,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Local Storage Directory:",
                        fontSize = 11.sp,
                        color = TextSecondary
                    )
                    Text(
                        text = LocalMediaScanner.getLocalMoviesDirectory(context).absolutePath,
                        fontSize = 11.sp,
                        color = PrimaryCyan
                    )
                }
            }
        }

        // Server IP Settings Card
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Companion Server Address",
                        style = MaterialTheme.typography.titleSmall,
                        color = TextPrimary
                    )
                    Text(
                        text = "Enter the local network IP of the Server companion host",
                        fontSize = 12.sp,
                        color = TextSecondary
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = serverIp,
                        onValueChange = { serverIp = it },
                        label = { Text("Server Host IP") },
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PrimaryCyan,
                            unfocusedBorderColor = TextSecondary,
                            focusedTextColor = TextPrimary,
                            unfocusedTextColor = TextPrimary
                        )
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        onClick = {
                            prefs.edit().putString(Constants.PREF_KEY_SERVER_IP, serverIp.trim()).apply()
                            ApiClient.updateServerAddress(serverIp.trim())
                            isSavedToastVisible = true
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryCyan),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("Save Server IP", color = DarkBackground)
                    }
                    if (isSavedToastVisible) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(text = "✓ Server IP updated successfully!", color = SuccessGreen, fontSize = 12.sp)
                    }
                }
            }
        }

        // Storage Destination Setting
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "Target Storage Mode",
                        style = MaterialTheme.typography.titleSmall,
                        color = TextPrimary
                    )
                    Text(
                        text = "Select where uploads and downloads are saved",
                        fontSize = 12.sp,
                        color = TextSecondary
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = storageMode == Constants.STORAGE_MODE_USB,
                            onClick = {
                                storageMode = Constants.STORAGE_MODE_USB
                                prefs.edit().putString(Constants.PREF_KEY_STORAGE_MODE, storageMode).apply()
                            },
                            label = { Text("USB Drive") }
                        )
                        FilterChip(
                            selected = storageMode == Constants.STORAGE_MODE_LOCAL,
                            onClick = {
                                storageMode = Constants.STORAGE_MODE_LOCAL
                                prefs.edit().putString(Constants.PREF_KEY_STORAGE_MODE, storageMode).apply()
                            },
                            label = { Text("Local Flash") }
                        )
                        FilterChip(
                            selected = storageMode == Constants.STORAGE_MODE_SERVER,
                            onClick = {
                                storageMode = Constants.STORAGE_MODE_SERVER
                                prefs.edit().putString(Constants.PREF_KEY_STORAGE_MODE, storageMode).apply()
                            },
                            label = { Text("Server") }
                        )
                    }
                }
            }
        }

        // Auto Download Setting
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Auto-Download Torrents",
                            style = MaterialTheme.typography.titleSmall,
                            color = TextPrimary
                        )
                        Text(
                            text = "Automatically begin sequential download when a .torrent file is received",
                            fontSize = 12.sp,
                            color = TextSecondary
                        )
                    }
                    Switch(
                        checked = autoTorrent,
                        onCheckedChange = {
                            autoTorrent = it
                            prefs.edit().putBoolean(Constants.PREF_KEY_AUTO_TORRENT, it).apply()
                        },
                        colors = SwitchDefaults.colors(checkedThumbColor = PrimaryCyan)
                    )
                }
            }
        }

        // App Information Card
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = DarkSurface)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "About LinkPlay",
                        style = MaterialTheme.typography.titleSmall,
                        color = TextPrimary
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(text = "Multi-Platform Version: 1.1.6", fontSize = 12.sp, color = TextSecondary)
                    Text(text = "Platforms: Tizen OS • Android TV • Android Phone • Android Auto", fontSize = 12.sp, color = TextSecondary)
                    Text(text = "Architecture: Clean Multi-Module Kotlin & Compose", fontSize = 12.sp, color = TextSecondary)
                }
            }
        }
    }
}
