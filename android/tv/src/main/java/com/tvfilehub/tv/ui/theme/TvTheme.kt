package com.tvfilehub.tv.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val TvColorScheme = darkColorScheme(
    primary = TvPrimary,
    secondary = TvSecondary,
    tertiary = TvSuccess,
    background = TvBackground,
    surface = TvSurface,
    onPrimary = TvBackground,
    onSecondary = TvTextPrimary,
    onBackground = TvTextPrimary,
    onSurface = TvTextPrimary
)

@Composable
fun TVFileHubTvTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = TvColorScheme,
        content = content
    )
}
