package com.tvfilehub.core.database.dao

import androidx.room.*
import com.tvfilehub.core.database.entities.CachedMediaEntity
import com.tvfilehub.core.database.entities.ResumePointEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface MediaDao {

    // Resume Points (Continue Watching)
    @Query("SELECT * FROM resume_points ORDER BY updatedAt DESC")
    fun getAllResumePoints(): Flow<List<ResumePointEntity>>

    @Query("SELECT * FROM resume_points WHERE mediaKey = :key LIMIT 1")
    suspend fun getResumePoint(key: String): ResumePointEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun saveResumePoint(entity: ResumePointEntity)

    @Query("DELETE FROM resume_points WHERE mediaKey = :key")
    suspend fun deleteResumePoint(key: String)

    @Query("DELETE FROM resume_points")
    suspend fun clearResumePoints()

    // Cached Media
    @Query("SELECT * FROM cached_media ORDER BY cleanTitle ASC")
    fun getAllCachedMedia(): Flow<List<CachedMediaEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCachedMedia(items: List<CachedMediaEntity>)

    @Query("DELETE FROM cached_media")
    suspend fun clearCachedMedia()
}
