package com.tvfilehub.phone

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.tvfilehub.phone.navigation.PhoneNavHost
import com.tvfilehub.phone.ui.theme.TVFileHubTheme

class PhoneMainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TVFileHubTheme {
                PhoneNavHost()
            }
        }
    }
}
