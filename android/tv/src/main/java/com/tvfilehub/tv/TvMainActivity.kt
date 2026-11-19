package com.tvfilehub.tv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.tvfilehub.tv.navigation.TvNavHost
import com.tvfilehub.tv.ui.theme.TVFileHubTvTheme

class TvMainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TVFileHubTvTheme {
                TvNavHost()
            }
        }
    }
}
