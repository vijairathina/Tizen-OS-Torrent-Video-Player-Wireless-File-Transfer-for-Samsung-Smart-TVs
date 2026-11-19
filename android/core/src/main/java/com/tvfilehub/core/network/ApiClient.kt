package com.tvfilehub.core.network

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import com.tvfilehub.core.common.Constants
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit

class DynamicHostInterceptor : Interceptor {
    @Volatile
    private var host: String = Constants.DEFAULT_SERVER_HOST
    @Volatile
    private var port: Int = Constants.DEFAULT_HTTP_PORT

    fun setServerEndpoint(newHost: String, newPort: Int = Constants.DEFAULT_HTTP_PORT) {
        if (newHost.isNotBlank()) {
            this.host = newHost.trim()
            this.port = newPort
        }
    }

    fun getServerHost(): String = host
    fun getServerPort(): Int = port

    override fun intercept(chain: Interceptor.Chain): Response {
        var request = chain.request()
        val currentUrl = request.url
        val newUrl = currentUrl.newBuilder()
            .scheme("http")
            .host(host)
            .port(port)
            .build()
        request = request.newBuilder().url(newUrl).build()
        return chain.proceed(request)
    }
}

object ApiClient {
    val hostInterceptor = DynamicHostInterceptor()

    val moshi: Moshi = Moshi.Builder()
        .add(KotlinJsonAdapterFactory())
        .build()

    val okHttpClient: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(hostInterceptor)
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        })
        .connectTimeout(Constants.TIMEOUT_CONNECT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(Constants.TIMEOUT_READ_SECONDS, TimeUnit.SECONDS)
        .writeTimeout(Constants.TIMEOUT_WRITE_SECONDS, TimeUnit.SECONDS)
        .build()

    private val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl("http://${Constants.DEFAULT_SERVER_HOST}:${Constants.DEFAULT_HTTP_PORT}/")
        .client(okHttpClient)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()

    val serverApi: ServerApi = retrofit.create(ServerApi::class.java)

    fun updateServerAddress(host: String, port: Int = Constants.DEFAULT_HTTP_PORT) {
        hostInterceptor.setServerEndpoint(host, port)
    }

    fun getBaseUrl(): String {
        return "http://${hostInterceptor.getServerHost()}:${hostInterceptor.getServerPort()}"
    }

    val currentBaseUrl: String get() = getBaseUrl()

    fun getTorrentStreamBaseUrl(): String {
        return "http://${hostInterceptor.getServerHost()}:${Constants.DEFAULT_TORRENT_STREAM_PORT}"
    }

    fun getWebSocketUrl(): String {
        return "ws://${hostInterceptor.getServerHost()}:${hostInterceptor.getServerPort()}${Constants.WS_PATH}"
    }
}
