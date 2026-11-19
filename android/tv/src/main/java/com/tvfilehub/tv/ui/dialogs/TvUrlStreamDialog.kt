package com.tvfilehub.tv.ui.dialogs

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tvfilehub.tv.ui.theme.*

@Composable
fun TvUrlStreamDialog(
    onDismiss: () -> Unit,
    onSubmit: (String) -> Unit
) {
    var urlText by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("Stream from URL or Magnet", color = Color.White)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = "Enter direct video URL (.mp4, .mkv, .m3u8) or Magnet URI:",
                    color = TvTextSecondary,
                    fontSize = 13.sp
                )
                OutlinedTextField(
                    value = urlText,
                    onValueChange = { urlText = it },
                    label = { Text("Stream URL or Magnet") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = TvPrimary,
                        unfocusedBorderColor = TvTextSecondary,
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White
                    )
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { if (urlText.isNotBlank()) onSubmit(urlText) },
                colors = ButtonDefaults.buttonColors(containerColor = TvPrimary)
            ) {
                Text("Play Stream", color = TvBackground)
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
