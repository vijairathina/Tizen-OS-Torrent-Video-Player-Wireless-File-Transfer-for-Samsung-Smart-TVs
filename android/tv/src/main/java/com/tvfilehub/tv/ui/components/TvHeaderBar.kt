package com.tvfilehub.tv.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tvfilehub.tv.navigation.TvDestination
import com.tvfilehub.tv.ui.theme.*

@Composable
fun TvHeaderBar(
    currentDestination: TvDestination,
    onSelectDestination: (TvDestination) -> Unit,
    onBoostClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(72.dp)
            .background(TvBackground)
            .padding(horizontal = 32.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Brand Section
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Tv,
                contentDescription = null,
                tint = TvPrimary,
                modifier = Modifier.size(32.dp)
            )
            Column {
                Text(
                    text = "TV FILE HUB",
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White
                )
                Text(
                    text = "& Video Player",
                    style = MaterialTheme.typography.bodySmall,
                    color = TvPrimary
                )
            }
        }

        // Navigation Tabs (10-foot D-pad accessible)
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            val tabs = listOf(
                TvDestination.Home to "🏠 Home",
                TvDestination.Player to "🎬 Video Player",
                TvDestination.Receiver to "📡 File Receiver",
                TvDestination.FileManager to "📁 File Manager"
            )

            tabs.forEach { (dest, label) ->
                TvTabButton(
                    label = label,
                    isSelected = currentDestination == dest,
                    onClick = { onSelectDestination(dest) }
                )
            }
        }

        // Right Status & Boost Button
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            TvHeaderActionButton(
                label = "⚡ Boost TV",
                onClick = onBoostClick
            )
            SurfaceBadge(label = "Server Online", color = TvSuccess)
        }
    }
}

@Composable
fun TvTabButton(
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .onFocusChanged { isFocused = it.isFocused }
            .focusable()
            .clickable(onClick = onClick)
            .background(
                color = when {
                    isFocused -> TvPrimary.copy(alpha = 0.25f)
                    isSelected -> TvSurface
                    else -> Color.Transparent
                },
                shape = RoundedCornerShape(8.dp)
            )
            .border(
                width = if (isFocused) 2.dp else if (isSelected) 1.dp else 0.dp,
                color = if (isFocused) TvFocusBorder else if (isSelected) Color.White.copy(alpha = 0.2f) else Color.Transparent,
                shape = RoundedCornerShape(8.dp)
            )
            .padding(horizontal = 16.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            color = if (isFocused || isSelected) TvPrimary else TvTextSecondary,
            fontSize = 15.sp
        )
    }
}

@Composable
fun TvHeaderActionButton(
    label: String,
    onClick: () -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .onFocusChanged { isFocused = it.isFocused }
            .focusable()
            .clickable(onClick = onClick)
            .background(
                color = if (isFocused) TvPrimary.copy(alpha = 0.3f) else TvPrimary.copy(alpha = 0.12f),
                shape = RoundedCornerShape(8.dp)
            )
            .border(
                width = if (isFocused) 2.dp else 1.dp,
                color = if (isFocused) TvFocusBorder else TvPrimary.copy(alpha = 0.3f),
                shape = RoundedCornerShape(8.dp)
            )
            .padding(horizontal = 14.dp, vertical = 6.dp)
    ) {
        Text(text = label, color = TvPrimary, fontSize = 13.sp)
    }
}

@Composable
fun SurfaceBadge(label: String, color: Color) {
    Row(
        modifier = Modifier
            .background(color.copy(alpha = 0.15f), shape = RoundedCornerShape(8.dp))
            .border(1.dp, color.copy(alpha = 0.3f), shape = RoundedCornerShape(8.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .background(color, shape = RoundedCornerShape(4.dp))
        )
        Text(text = label, color = color, fontSize = 13.sp)
    }
}
