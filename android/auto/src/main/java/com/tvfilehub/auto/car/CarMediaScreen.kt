package com.tvfilehub.auto.car

import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.*
import com.tvfilehub.core.network.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class CarMediaScreen(carContext: CarContext) : Screen(carContext) {

    private var mediaItems: List<String> = emptyList()
    private val scope = CoroutineScope(Dispatchers.IO)

    init {
        scope.launch {
            try {
                val res = ApiClient.serverApi.getDownloads()
                mediaItems = res.availableMovies.map { it.cleanTitle }
                invalidate()
            } catch (e: Exception) {
                mediaItems = listOf("Connect to Server Wi-Fi")
                invalidate()
            }
        }
    }

    override fun onGetTemplate(): Template {
        val listBuilder = ItemList.Builder()

        if (mediaItems.isEmpty()) {
            listBuilder.addItem(
                Row.Builder()
                    .setTitle("Loading Server Media...")
                    .addText("Connecting to companion Server at ${ApiClient.hostInterceptor.getServerHost()}")
                    .build()
            )
        } else {
            mediaItems.forEach { title ->
                listBuilder.addItem(
                    Row.Builder()
                        .setTitle(title)
                        .addText("Ready for in-car audio playback")
                        .setOnClickListener {
                            // Initiates playback in automotive player
                        }
                        .build()
                )
            }
        }

        return ListTemplate.Builder()
            .setTitle("LinkPlay • Server Media")
            .setHeaderAction(Action.APP_ICON)
            .setSingleList(listBuilder.build())
            .build()
    }
}
