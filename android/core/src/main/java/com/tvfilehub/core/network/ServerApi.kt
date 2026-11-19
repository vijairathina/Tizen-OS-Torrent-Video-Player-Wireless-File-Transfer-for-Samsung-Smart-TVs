package com.tvfilehub.core.network

import com.tvfilehub.core.models.*
import okhttp3.MultipartBody
import retrofit2.http.*

interface ServerApi {

    @GET("/status")
    suspend fun getStatus(): GenericStatusResponse

    @GET("/api/downloads")
    suspend fun getDownloads(): DownloadsDashboardResponse

    @GET("/api/queue")
    suspend fun getQueue(): DownloadsDashboardResponse

    @GET("/start_torrent")
    suspend fun startTorrent(
        @Query("file") file: String? = null,
        @Query("magnet") magnet: String? = null,
        @Query("downloadOnly") downloadOnly: Boolean? = null,
        @Query("fileIdx") fileIdx: Int? = null,
        @Query("episode") episode: String? = null
    ): GenericStatusResponse

    @GET("/stop_torrent")
    suspend fun stopTorrent(): GenericStatusResponse

    @GET("/torrent_stats")
    suspend fun getTorrentStats(
        @Query("file") file: String? = null
    ): TorrentStats

    @GET("/torrent_files")
    suspend fun getTorrentFiles(
        @Query("file") file: String
    ): TorrentFilesResponse

    @GET("/media_info")
    suspend fun getMediaInfo(
        @Query("file") file: String
    ): MediaInfoResponse

    @GET("/api/prioritize")
    suspend fun prioritize(
        @Query("file") file: String
    ): GenericStatusResponse

    @GET("/api/low_priority")
    suspend fun setLowPriority(
        @Query("file") file: String
    ): GenericStatusResponse

    @GET("/api/normal_priority")
    suspend fun setNormalPriority(
        @Query("file") file: String
    ): GenericStatusResponse

    @GET("/api/pause_torrent")
    suspend fun pauseTorrent(
        @Query("file") file: String
    ): GenericStatusResponse

    @GET("/api/resume_torrent")
    suspend fun resumeTorrent(
        @Query("file") file: String
    ): GenericStatusResponse

    @GET("/delete_file")
    suspend fun deleteFile(
        @Query("file") file: String
    ): GenericStatusResponse

    @GET("/storage_target")
    suspend fun getStorageTarget(): StorageTargetResponse

    @Multipart
    @POST("/upload")
    suspend fun uploadFile(
        @Part file: MultipartBody.Part
    ): FileUploadResponse
}
