package com.tvfilehub.tv.ui.dialogs

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tvfilehub.tv.ui.theme.*

@Composable
fun TvAdBlockGuideDialog(
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text("🛡️ TV Ad-Block & Performance Shield", color = Color.White)
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    text = "Follow these 3 simple TV settings to permanently disable banner ads and run at peak speed:",
                    color = TvTextSecondary,
                    fontSize = 13.sp
                )

                GuideStepRow(
                    stepNum = "1",
                    title = "Turn Off 'Autorun Smart Hub'",
                    desc = "Go to TV Settings → General → Smart Features → Turn OFF Autorun Smart Hub."
                )

                GuideStepRow(
                    stepNum = "2",
                    title = "Disable Telemetry & IBA",
                    desc = "Go to Terms & Privacy → Privacy Choices → Uncheck Interest-Based Advertisements."
                )

                GuideStepRow(
                    stepNum = "3",
                    title = "Set AdGuard Ad-Blocking DNS",
                    desc = "Go to Network IP Settings → DNS Manual → Enter 94.140.14.14 (Secondary: 94.140.15.15)."
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onDismiss,
                colors = ButtonDefaults.buttonColors(containerColor = TvPrimary)
            ) {
                Text("Got It", color = TvBackground)
            }
        },
        containerColor = TvSurface
    )
}

@Composable
fun GuideStepRow(stepNum: String, title: String, desc: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White.copy(alpha = 0.04f), RoundedCornerShape(8.dp))
            .border(1.dp, Color.White.copy(alpha = 0.08f), RoundedCornerShape(8.dp))
            .padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = TvPrimary
        ) {
            Text(
                text = stepNum,
                color = TvBackground,
                fontSize = 13.sp,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
            )
        }
        Column {
            Text(text = title, color = Color.White, fontSize = 13.sp)
            Text(text = desc, color = TvTextSecondary, fontSize = 11.sp)
        }
    }
}
