package com.tvfilehub.core.database.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "cached_media")
data class CachedMediaEntity(
    @PrimaryKey val id: String,
    val name: String,
    val cleanTitle: String,
    val sizeBytes: Long,
    val sizeFormatted: String,
    val streamUrl: String,
    val isCompleted: Boolean,
    val cachedAt: Long = System.currentTimeMillis()
)
