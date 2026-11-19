package com.tvfilehub.tv.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tvfilehub.tv.ui.theme.TvCard
import com.tvfilehub.tv.ui.theme.TvCardFocused
import com.tvfilehub.tv.ui.theme.TvFocusBorder

@Composable
fun TvFocusableCard(
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
    cornerRadius: Dp = 12.dp,
    content: @Composable BoxScope.(isFocused: Boolean) -> Unit
) {
    var isFocused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(targetValue = if (isFocused) 1.04f else 1.0f, label = "cardScale")

    Card(
        modifier = modifier
            .scale(scale)
            .onFocusChanged { isFocused = it.isFocused }
            .focusable()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(cornerRadius),
        colors = CardDefaults.cardColors(
            containerColor = if (isFocused) TvCardFocused else TvCard
        ),
        border = if (isFocused) BorderStroke(2.dp, TvFocusBorder) else BorderStroke(1.dp, Color.White.copy(alpha = 0.08f))
    ) {
        Box {
            content(isFocused)
        }
    }
}
