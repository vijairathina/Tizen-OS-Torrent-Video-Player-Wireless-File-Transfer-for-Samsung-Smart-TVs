package com.tvfilehub.phone.navigation

import android.content.Intent
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import com.tvfilehub.phone.PhoneApp
import com.tvfilehub.phone.ui.home.HomeScreen
import com.tvfilehub.phone.ui.home.HomeViewModel
import com.tvfilehub.phone.ui.manager.StorageExplorerScreen
import com.tvfilehub.phone.ui.manager.StorageExplorerViewModel
import com.tvfilehub.phone.ui.player.MobilePlayerActivity
import com.tvfilehub.phone.ui.player.VideoPlayerScreen
import com.tvfilehub.phone.ui.player.VideoPlayerViewModel
import com.tvfilehub.phone.ui.settings.SettingsScreen
import com.tvfilehub.phone.ui.theme.DarkSurface
import com.tvfilehub.phone.ui.theme.PrimaryCyan
import com.tvfilehub.phone.ui.theme.TextSecondary
import com.tvfilehub.phone.ui.transfer.FileTransferScreen
import com.tvfilehub.phone.ui.transfer.FileTransferViewModel

@Composable
fun PhoneNavHost() {
    val context = LocalContext.current
    var currentScreen by remember { mutableStateOf<Screen>(Screen.Home) }

    val homeViewModel = remember {
        HomeViewModel(PhoneApp.instance.mediaRepository, PhoneApp.instance.torrentRepository)
    }
    val playerViewModel = remember {
        VideoPlayerViewModel(PhoneApp.instance.torrentRepository)
    }
    val transferViewModel = remember {
        FileTransferViewModel(PhoneApp.instance.fileTransferRepository)
    }
    val storageViewModel = remember {
        StorageExplorerViewModel(PhoneApp.instance.mediaRepository)
    }

    val playMediaLauncher = { streamUrl: String, title: String, startPosSec: Long ->
        val intent = Intent(context, MobilePlayerActivity::class.java).apply {
            putExtra(MobilePlayerActivity.EXTRA_STREAM_URL, streamUrl)
            putExtra(MobilePlayerActivity.EXTRA_TITLE, title)
            putExtra(MobilePlayerActivity.EXTRA_START_POS, startPosSec * 1000)
        }
        context.startActivity(intent)
    }

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = DarkSurface
            ) {
                val screens = listOf(
                    Screen.Home,
                    Screen.Player,
                    Screen.Transfer,
                    Screen.Files,
                    Screen.Settings
                )
                screens.forEach { screen ->
                    NavigationBarItem(
                        icon = { Icon(screen.icon, contentDescription = screen.title) },
                        label = { Text(screen.title) },
                        selected = currentScreen == screen,
                        onClick = { currentScreen = screen },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = PrimaryCyan,
                            selectedTextColor = PrimaryCyan,
                            unselectedIconColor = TextSecondary,
                            unselectedTextColor = TextSecondary,
                            indicatorColor = PrimaryCyan.copy(alpha = 0.15f)
                        )
                    )
                }
            }
        }
    ) { innerPadding ->
        Surface(modifier = Modifier.padding(innerPadding)) {
            when (currentScreen) {
                Screen.Home -> HomeScreen(
                    viewModel = homeViewModel,
                    onNavigateToPlayer = { currentScreen = Screen.Player },
                    onNavigateToTransfer = { currentScreen = Screen.Transfer },
                    onNavigateToFiles = { currentScreen = Screen.Files },
                    onPlayMedia = { url, title, pos -> playMediaLauncher(url, title, pos) }
                )
                Screen.Player -> VideoPlayerScreen(
                    viewModel = playerViewModel,
                    onPlayMovie = { url, title -> playMediaLauncher(url, title, 0L) }
                )
                Screen.Transfer -> FileTransferScreen(
                    viewModel = transferViewModel
                )
                Screen.Files -> StorageExplorerScreen(
                    viewModel = storageViewModel,
                    onPlayMedia = { url, title -> playMediaLauncher(url, title, 0L) }
                )
                Screen.Settings -> SettingsScreen()
            }
        }
    }
}
