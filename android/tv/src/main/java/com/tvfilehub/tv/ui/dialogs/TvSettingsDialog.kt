package com.tvfilehub.tv.ui.dialogs

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tvfilehub.core.common.Constants
import com.tvfilehub.tv.ui.theme.*

@Composable
fun TvSettingsDialog(
    currentServerIp: String,
    currentStorageMode: String,
    currentManualOffline: Boolean = false,
    onSaveServerIp: (String) -> Unit,
    onSaveStorageMode: (String) -> Unit,
    onSaveManualOffline: (Boolean) -> Unit = {},
    onDismiss: () -> Unit
) {
    var ipText by remember { mutableStateOf(currentServerIp) }
    var storageMode by remember { mutableStateOf(currentStorageMode) }
    var isManualOffline by remember { mutableStateOf(currentManualOffline) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("LinkPlay TV Settings", color = Color.White)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                // Offline Mode Standalone Toggle
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Offline Mode (Standalone)", color = Color.White, fontSize = 14.sp)
                        Text(
                            "Operate independently with local storage and direct TV receiver without Companion Server",
                            color = TvTextSecondary,
                            fontSize = 11.sp
                        )
                    }
                    Switch(
                        checked = isManualOffline,
                        onCheckedChange = { isManualOffline = it },
                        colors = SwitchDefaults.colors(checkedThumbColor = TvPrimary)
                    )
                }

                Divider(color = Color.White.copy(alpha = 0.1f))

                Column {
                    Text("Companion Server IP:", color = Color.White, fontSize = 14.sp)
                    Spacer(modifier = Modifier.height(6.dp))
                    OutlinedTextField(
                        value = ipText,
                        onValueChange = { ipText = it },
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = TvPrimary,
                            unfocusedBorderColor = TvTextSecondary,
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color.White
                        )
                    )
                }

                Column {
                    Text("Target Storage Destination:", color = Color.White, fontSize = 14.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(
                            selected = storageMode == Constants.STORAGE_MODE_USB,
                            onClick = { storageMode = Constants.STORAGE_MODE_USB },
                            label = { Text("USB Drive") }
                        )
                        FilterChip(
                            selected = storageMode == Constants.STORAGE_MODE_LOCAL,
                            onClick = { storageMode = Constants.STORAGE_MODE_LOCAL },
                            label = { Text("TV Flash") }
                        )
                        FilterChip(
                            selected = storageMode == Constants.STORAGE_MODE_SERVER,
                            onClick = { storageMode = Constants.STORAGE_MODE_SERVER },
                            label = { Text("Server") }
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSaveServerIp(ipText.trim())
                    onSaveStorageMode(storageMode)
                    onSaveManualOffline(isManualOffline)
                    onDismiss()
                },
                colors = ButtonDefaults.buttonColors(containerColor = TvPrimary)
            ) {
                Text("Save", color = TvBackground)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = TvTextSecondary)
            }
        },
        containerColor = TvSurface
    )
}
