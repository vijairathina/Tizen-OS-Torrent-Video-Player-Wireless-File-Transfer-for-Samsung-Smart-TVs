package com.tvfilehub.phone.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.ui.graphics.vector.ImageVector

sealed class Screen(val route: String, val title: String, val icon: ImageVector) {
    data object Home : Screen("home", "Home", Icons.Default.Home)
    data object Player : Screen("player", "Player", Icons.Default.PlayCircle)
    data object Transfer : Screen("transfer", "Transfer", Icons.Default.Send)
    data object Files : Screen("files", "Storage", Icons.Default.Folder)
    data object Settings : Screen("settings", "Settings", Icons.Default.Settings)
}
