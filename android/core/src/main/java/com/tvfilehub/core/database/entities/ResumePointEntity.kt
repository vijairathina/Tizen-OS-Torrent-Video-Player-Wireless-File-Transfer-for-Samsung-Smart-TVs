package com.tvfilehub.core.database.entities

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "resume_points")
data class ResumePointEntity(
    @PrimaryKey val mediaKey: String,
    val title: String,
    val streamUrl: String,
    val positionSeconds: Long,
    val durationSeconds: Long,
    val updatedAt: Long = System.currentTimeMillis()
)
