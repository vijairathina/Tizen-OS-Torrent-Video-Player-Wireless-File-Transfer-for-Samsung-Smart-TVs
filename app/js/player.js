/**
 * Samsung AVPlay (`webapis.avplay`) and HTML5 Video Engine
 * Hardware accelerated video playback, SRT/VTT subtitle rendering, and TV OSD controls.
 */

window.Player = (function() {
    'use strict';

    let isPlayerOpen = false;
    let isAVPlay = false;
    let currentMediaUrl = '';
    let currentTitle = '';
    let durationSec = 0;
    let currentTimeSec = 0;
    let isPlaying = false;
    let osdTimeout = null;
    let seekDebounceTimeout = null;
    let seekFeedbackTimeout = null;
    let subtitles = [];
    let currentSubtitleIndex = -1;
    let videoResumeKey = '';
    let pendingResumeTime = 0;
    let lastResumeSaveTime = 0;
    let resumeToastTimeout = null;
    let torrentPollInterval = null;
    let isScrubbing = false;
    let isSettlingSeek = false;
    let scrubTargetSec = 0;
    let scrubStartSec = 0;
    let scrubRepeatCount = 0;
    let scrubCommitTimeout = null;
    let scrubSettlingTimeout = null;
    let targetSeekSec = null;
    let isSeekingInProgress = false;
    let queuedSeekTarget = null;

    const ASPECT_MODES = [
        {
            id: 'fit',
            name: 'Fit (16:9 Letterbox)',
            short: 'Aspect: Fit',
            avplay: { x: 0, y: 0, width: 1920, height: 1080, method: 'PLAYER_DISPLAY_MODE_LETTER_BOX' },
            html5: { width: '100%', height: '100%', left: '0px', top: '0px', objectFit: 'contain', transform: 'none' }
        },
        {
            id: 'zoom',
            name: 'Zoom to Fill (133% - No Black Bars)',
            short: 'Aspect: Zoom',
            // Scales out black bars from 2.35:1 movie frame
            avplay: { x: -320, y: -180, width: 2560, height: 1440, method: 'PLAYER_DISPLAY_MODE_FULL_SCREEN' },
            html5: { width: '100%', height: '100%', left: '0px', top: '0px', objectFit: 'cover', transform: 'scale(1.3333)', transformOrigin: 'center center' }
        },
        {
            id: 'stretch',
            name: 'Full Screen (Stretch)',
            short: 'Aspect: Stretch',
            avplay: { x: 0, y: 0, width: 1920, height: 1080, method: 'PLAYER_DISPLAY_MODE_FULL_SCREEN' },
            html5: { width: '100%', height: '100%', left: '0px', top: '0px', objectFit: 'fill', transform: 'none' }
        },
        {
            id: '4:3',
            name: '4:3 Standard (Classic Pillarbox)',
            short: 'Aspect: 4:3',
            avplay: { x: 240, y: 0, width: 1440, height: 1080, method: 'PLAYER_DISPLAY_MODE_FULL_SCREEN' },
            html5: { width: '1440px', height: '1080px', left: 'calc((100vw - 1440px) / 2)', top: '0px', objectFit: 'fill', transform: 'none' }
        },
        {
            id: '21:9',
            name: '21:9 Cinemascope (Ultra-Wide)',
            short: 'Aspect: 21:9',
            avplay: { x: 0, y: 138, width: 1920, height: 804, method: 'PLAYER_DISPLAY_MODE_FULL_SCREEN' },
            html5: { width: '100%', height: '804px', left: '0px', top: 'calc((100vh - 804px) / 2)', objectFit: 'fill', transform: 'none' }
        }
    ];
    let currentAspectModeIdx = 0;
    let aspectToastTimeout = null;

    function getResumePoints() {
        try {
            return JSON.parse(localStorage.getItem('tvhub_resume_points')) || {};
        } catch (e) {
            return {};
        }
    }

    function saveResumePosition(force) {
        if (!videoResumeKey || currentTimeSec < 5) return;
        const now = Date.now();
        if (!force && (now - lastResumeSaveTime < 4000)) return;
        lastResumeSaveTime = now;

        try {
            const map = getResumePoints();
            if (durationSec > 30 && (durationSec - currentTimeSec) < 15) {
                delete map[videoResumeKey];
            } else {
                map[videoResumeKey] = {
                    time: currentTimeSec,
                    duration: durationSec,
                    updatedAt: now
                };
            }
            localStorage.setItem('tvhub_resume_points', JSON.stringify(map));
        } catch (e) {}
    }

    function getSavedResumePosition(key) {
        try {
            const map = getResumePoints();
            return (map[key] && map[key].time) ? map[key].time : 0;
        } catch (e) {
            return 0;
        }
    }

    function showResumeToast(timeSec) {
        const toast = document.getElementById('player-resume-toast');
        const text = document.getElementById('player-resume-text');
        if (!toast || !text) return;

        text.textContent = `Resuming from ${formatTime(timeSec)}`;
        toast.style.display = 'flex';
        clearTimeout(resumeToastTimeout);
        resumeToastTimeout = setTimeout(function() {
            toast.style.display = 'none';
        }, 4000);
    }

    function showBufferingOverlay(show, percent, label) {
        const overlay = document.getElementById('player-buffering-overlay');
        const pctEl = document.getElementById('buffering-percent');
        const labelEl = document.getElementById('buffering-label');
        if (!overlay) return;

        if (show) {
            overlay.style.display = 'flex';
            if (pctEl && typeof percent !== 'undefined' && percent !== null) {
                pctEl.textContent = `${Math.round(percent)}%`;
            }
            if (labelEl && label) {
                labelEl.textContent = label;
            }
        } else {
            overlay.style.display = 'none';
        }
    }

    function updateDownloadBadge(show, text) {
        const badge = document.getElementById('player-dl-badge');
        const badgeText = document.getElementById('player-dl-badge-text');
        if (!badge || !badgeText) return;

        if (show && text) {
            badgeText.textContent = text;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    function startTorrentProgressPolling() {
        clearInterval(torrentPollInterval);
        checkTorrentProgress();
        torrentPollInterval = setInterval(checkTorrentProgress, 2000);
    }

    function stopTorrentProgressPolling() {
        clearInterval(torrentPollInterval);
        torrentPollInterval = null;
        updateDownloadBadge(false);
    }

    function checkTorrentProgress() {
        if (!isPlayerOpen) return;
        fetch('http://192.168.0.13:8080/torrent_stats')
            .then(res => res.json())
            .then(data => {
                if (!isPlayerOpen || !data || !data.active || !data.stats) {
                    updateDownloadBadge(false);
                    return;
                }
                const s = data.stats;
                const prog = typeof s.progress === 'number' ? s.progress : parseFloat(s.progress || 0);
                const speed = s.speed || '';
                const dlInfoEl = document.getElementById('buffering-dl-info');
                const dlTextEl = document.getElementById('buffering-dl-text');

                if (prog < 100) {
                    const dlStr = `Downloading: ${Math.round(prog)}% (${speed})`;
                    if (dlTextEl) dlTextEl.textContent = dlStr;
                    if (dlInfoEl) dlInfoEl.style.display = 'flex';
                    updateDownloadBadge(true, `⚡ ${dlStr}`);
                } else {
                    if (dlInfoEl) dlInfoEl.style.display = 'none';
                    updateDownloadBadge(false);
                }
            })
            .catch(() => {});
    }

    function init() {
        checkAVPlaySupport();
        setupOsdEvents();
        setupAppLifecycleListeners();
    }

    function setupAppLifecycleListeners() {
        // 1. Standard HTML5 Page Visibility API (triggered when Samsung TV Home button is pressed or Smart Hub opens)
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                console.log('[Player] Document hidden (Home button pressed or app minimized) -> Pausing playback');
                if (isPlayerOpen && isPlaying) {
                    pause();
                }
            }
        });

        // 2. Page Hide & Window Blur events
        window.addEventListener('pagehide', function() {
            console.log('[Player] pagehide triggered -> Pausing playback');
            if (isPlayerOpen && isPlaying) {
                pause();
            }
        });

        window.addEventListener('blur', function() {
            // Fires when Smart Hub or TV system overlay takes focus
            if (isPlayerOpen && isPlaying) {
                console.log('[Player] window blur -> Pausing playback');
                pause();
            }
        });

        // 3. Samsung Tizen Application Lifecycle API
        if (typeof tizen !== 'undefined' && tizen.application) {
            try {
                var currentApp = tizen.application.getCurrentApplication();
                if (currentApp && currentApp.addEventListener) {
                    currentApp.addEventListener({
                        onhidden: function() {
                            console.log('[Tizen App Lifecycle] onhidden event -> Pausing AVPlay hardware player');
                            if (isPlayerOpen) {
                                pause();
                            }
                        },
                        onlowmemory: function() {
                            console.warn('[Tizen App Lifecycle] onlowmemory warning');
                        }
                    });
                }
            } catch (e) {
                console.warn('[Player] Could not attach Tizen application lifecycle listeners:', e);
            }
        }

        // 4. Beforeunload / unload to clean up AVPlay instance
        window.addEventListener('beforeunload', function() {
            if (isPlayerOpen) {
                close();
            }
        });
    }

    function checkAVPlaySupport() {
        if (typeof webapis !== 'undefined' && webapis.avplay) {
            isAVPlay = true;
            console.log('[Player] Samsung AVPlay hardware acceleration detected.');
        } else {
            isAVPlay = false;
            console.log('[Player] Using HTML5 video fallback.');
        }
    }

    function stopAndCloseAVPlay() {
        if (typeof webapis !== 'undefined' && webapis.avplay) {
            try {
                const state = webapis.avplay.getState();
                if (state && state !== 'NONE' && state !== 'IDLE') {
                    webapis.avplay.stop();
                }
                webapis.avplay.close();
            } catch (e) {
                console.warn('[Player] stopAndCloseAVPlay cleanup:', e);
            }
        }
    }

    let currentSubtitleUrl = '';

    function openMedia(mediaUrl, title, subtitleUrl) {
        checkAVPlaySupport();
        currentMediaUrl = mediaUrl;
        currentTitle = title || 'Video Stream';
        currentSubtitleUrl = subtitleUrl || '';
        videoResumeKey = (title || mediaUrl).trim();
        isPlayerOpen = true;

        // Reset all seek and scrubbing states to prevent carrying over frozen state
        isScrubbing = false;
        isSettlingSeek = false;
        targetSeekSec = null;
        isSeekingInProgress = false;
        queuedSeekTarget = null;
        currentTimeSec = 0;
        durationSec = 0;
        clearTimeout(scrubCommitTimeout);
        clearTimeout(scrubSettlingTimeout);
        clearTimeout(seekDebounceTimeout);
        clearTimeout(seekFeedbackTimeout);

        // Check for saved resume point
        const savedTime = getSavedResumePosition(videoResumeKey);
        pendingResumeTime = (savedTime > 8) ? savedTime : 0;

        document.body.classList.add('media-playing-mode');

        const container = document.getElementById('player-container');
        const titleEl = document.getElementById('video-title-display');
        const fallbackVid = document.getElementById('fallback-video');

        if (container) container.classList.add('player-active');
        if (titleEl) titleEl.textContent = currentTitle;

        if (subtitleUrl) {
            loadSubtitle(subtitleUrl);
        } else {
            clearSubtitles();
        }

        // Show buffering indicator on initial stream load
        showBufferingOverlay(true, 0, 'Loading Video Stream...');
        startTorrentProgressPolling();

        showOSD();

        const episodesBtn = document.getElementById('osd-episodes-btn');
        if (episodesBtn) {
            const hasEpisodes = window.VideoPlayer && window.VideoPlayer.hasMultipleEpisodes && window.VideoPlayer.hasMultipleEpisodes(currentTitle);
            episodesBtn.style.display = hasEpisodes ? 'inline-flex' : 'none';
        }

        if (window.Navigation) {
            setTimeout(function() {
                const playBtn = document.getElementById('osd-play-btn');
                if (playBtn) window.Navigation.setFocus(playBtn);
            }, 120);
        }

        if (isAVPlay) {
            startAVPlay(mediaUrl);
            if (fallbackVid) fallbackVid.style.display = 'none';
        } else {
            startFallbackVideo(mediaUrl);
        }
    }

    function startAVPlay(url) {
        try {
            stopAndCloseAVPlay();
            webapis.avplay.open(url);
            applyAspectRatio();

            webapis.avplay.setListener({
                onbufferingstart: function() {
                    updateStatusTag('Buffering...');
                    showBufferingOverlay(true, 0, 'Buffering video...');
                },
                onbufferingprogress: function(percent) {
                    updateStatusTag(`Buffering ${percent}%`);
                    showBufferingOverlay(true, percent, 'Buffering video...');
                },
                onbufferingcomplete: function() {
                    updateStatusTag('Playing');
                    showBufferingOverlay(false);
                    // Clear settling lock after buffering completes following a seek
                    isSettlingSeek = false;
                    targetSeekSec = null;
                    isSeekingInProgress = false;
                    applyAspectRatio();
                },
                oncurrentplaytime: function(ms) {
                    if (isScrubbing || isSettlingSeek) return;
                    targetSeekSec = null;
                    const sec = Math.floor(ms / 1000);
                    currentTimeSec = sec;
                    if (durationSec <= 0) {
                        try {
                            const d = webapis.avplay.getDuration();
                            if (d && d > 0) durationSec = Math.floor(d / 1000);
                        } catch (e) {}
                    }
                    updateTimeline();
                    checkSubtitles(currentTimeSec);
                    saveResumePosition(false);
                },
                onstreamcompleted: function() {
                    console.log('[Player] Playback completed');
                    try {
                        const map = getResumePoints();
                        delete map[videoResumeKey];
                        localStorage.setItem('tvhub_resume_points', JSON.stringify(map));
                    } catch (e) {}
                    close();
                },
                onerror: function(error) {
                    console.error('[Player] AVPlay error:', error);
                    const errStr = (typeof error === 'string') ? error : ((error && (error.name || error.message)) ? (error.name || error.message) : 'Playback Interrupted');
                    console.log(`[Player] AVPlay failed with: ${errStr} at ${currentTimeSec}s`);
                    
                    if (window.FileReceiver && window.FileReceiver.sendSocketMessage) {
                        window.FileReceiver.sendSocketMessage(`[AVPlay Error] ${errStr} at ${currentTimeSec}s for ${currentTitle}`);
                    }
                    
                    updateStatusTag(`Error (${errStr})`);
                    showBufferingOverlay(false);
                    
                    // If video was already playing and stream was interrupted (e.g. buffer underrun or socket drop), auto-recover
                    if (currentTimeSec > 0 && isPlayerOpen) {
                        saveResumePosition(true);
                        window.FileReceiver.showToast(`Stream paused (${errStr}). Reconnecting...`);
                        setTimeout(function() {
                            if (isPlayerOpen) {
                                console.log('[Player] Reconnecting stream at', currentTimeSec);
                                openMedia(currentMediaUrl, currentTitle, currentSubtitleUrl);
                            }
                        }, 2500);
                    } else {
                        // If AVPlay failed at startup, try HTML5 fallback
                        console.warn('[Player] AVPlay initial failure, attempting HTML5 fallback');
                        startFallbackVideo(url);
                    }
                }
            });

            webapis.avplay.prepareAsync(function() {
                try {
                    const d = webapis.avplay.getDuration();
                    if (d && d > 0) durationSec = Math.floor(d / 1000);
                } catch (e) {}
                webapis.avplay.play();
                isPlaying = true;
                updatePlayPauseIcon();
                updateStatusTag('Playing');

                // Check and execute auto-resume if saved timestamp exists
                if (pendingResumeTime > 0) {
                    const resumeTarget = pendingResumeTime;
                    pendingResumeTime = 0;
                    console.log('[Player] Resuming playback from', resumeTarget, 'seconds');
                    setTimeout(function() {
                        seekTo(resumeTarget);
                        showResumeToast(resumeTarget);
                    }, 350);
                }
            }, function(err) {
                console.error('[Player] AVPlay prepare failed:', err);
                updateStatusTag('AVPlay failed, using HTML5 fallback');
                startFallbackVideo(url);
            });
        } catch (e) {
            console.error('[Player] Exception starting AVPlay:', e);
            startFallbackVideo(url);
        }
    }

    function startFallbackVideo(url) {
        const vid = document.getElementById('fallback-video');
        if (!vid) return;

        vid.style.display = 'block';
        vid.src = url;
        applyAspectRatio();

        vid.onerror = function(e) {
            console.error('[Player] HTML5 video fallback error:', e);
            if (window.FileReceiver && window.FileReceiver.sendSocketMessage) {
                window.FileReceiver.sendSocketMessage(`[HTML5 Video Error] code=${vid.error ? vid.error.code : 'unknown'} for ${currentTitle}`);
            }
            updateStatusTag('Playback Error');
            showBufferingOverlay(false);
        };

        vid.onloadedmetadata = function() {
            durationSec = Math.floor(vid.duration);
            updateTimeline();
            if (pendingResumeTime > 0) {
                const resumeTarget = pendingResumeTime;
                pendingResumeTime = 0;
                vid.currentTime = resumeTarget;
                currentTimeSec = resumeTarget;
                updateTimeline();
                showResumeToast(resumeTarget);
            }
        };

        vid.ontimeupdate = function() {
            if (isScrubbing || isSettlingSeek) return;
            currentTimeSec = Math.floor(vid.currentTime);
            updateTimeline();
            checkSubtitles(currentTimeSec);
            saveResumePosition(false);
        };

        vid.onwaiting = function() {
            updateStatusTag('Buffering...');
            showBufferingOverlay(true, 0, 'Buffering video...');
        };

        vid.onprogress = function() {
            if (vid.duration > 0 && vid.buffered.length > 0) {
                const p = Math.round((vid.buffered.end(vid.buffered.length - 1) / vid.duration) * 100);
                showBufferingOverlay(true, p, 'Buffering video...');
            }
        };

        vid.onplaying = function() {
            updateStatusTag('Playing');
            showBufferingOverlay(false);
            isPlaying = true;
            updatePlayPauseIcon();
        };

        vid.onpause = function() {
            updateStatusTag('Paused');
            isPlaying = false;
            updatePlayPauseIcon();
            saveResumePosition(true);
        };

        vid.onended = function() {
            try {
                const map = getResumePoints();
                delete map[videoResumeKey];
                localStorage.setItem('tvhub_resume_points', JSON.stringify(map));
            } catch (e) {}
            close();
        };

        vid.play().catch(e => console.warn('[Player] HTML5 video autoplay restricted:', e));
    }

    function play() {
        if (!isPlayerOpen) return;
        if (isAVPlay) {
            try {
                webapis.avplay.play();
                isPlaying = true;
                updatePlayPauseIcon();
                updateStatusTag('Playing');
            } catch (e) {}
        } else {
            const vid = document.getElementById('fallback-video');
            if (vid) vid.play();
        }
    }

    function pause() {
        if (!isPlayerOpen) return;
        saveResumePosition(true);
        if (isAVPlay) {
            try {
                webapis.avplay.pause();
                isPlaying = false;
                updatePlayPauseIcon();
                updateStatusTag('Paused');
            } catch (e) {}
        } else {
            const vid = document.getElementById('fallback-video');
            if (vid) vid.pause();
        }
    }

    function togglePlayPause() {
        if (isPlaying) {
            pause();
        } else {
            play();
        }
        showOSD();
    }

    function startOrContinueScrub(direction, customStep) {
        if (!isPlayerOpen) return;

        if (durationSec <= 0 && isAVPlay) {
            try {
                const d = webapis.avplay.getDuration();
                if (d && d > 0) durationSec = Math.floor(d / 1000);
            } catch (e) {}
        }

        const timelineBox = document.getElementById('osd-timeline-box');

        if (!isScrubbing) {
            isScrubbing = true;
            scrubStartSec = currentTimeSec;
            scrubTargetSec = currentTimeSec;
            scrubRepeatCount = 0;
            if (timelineBox) timelineBox.classList.add('is-scrubbing');
        }

        scrubRepeatCount++;

        // Dynamic acceleration based on hold duration (key repeat count)
        let step = customStep || 10;
        if (scrubRepeatCount > 14) {
            step = Math.max(step, 60); // >1.5s hold: 60s jumps per tick
        } else if (scrubRepeatCount > 7) {
            step = Math.max(step, 30); // >0.7s hold: 30s jumps per tick
        } else if (scrubRepeatCount > 3) {
            step = Math.max(step, 15); // >0.3s hold: 15s jumps per tick
        }

        let nextTarget = scrubTargetSec + (direction * step);
        if (durationSec > 0) {
            nextTarget = Math.max(0, Math.min(durationSec, nextTarget));
        } else {
            nextTarget = Math.max(0, nextTarget);
        }

        scrubTargetSec = nextTarget;
        currentTimeSec = nextTarget;

        // Immediately update scrubber UI without transition delay
        updateTimeline();
        showOSD();

        const totalDelta = scrubTargetSec - scrubStartSec;
        showSeekFeedback(totalDelta, scrubTargetSec);

        // Fallback auto-commit debounce if keyup is not received
        clearTimeout(scrubCommitTimeout);
        scrubCommitTimeout = setTimeout(function() {
            finishScrubbing();
        }, 360);
    }

    function finishScrubbing() {
        if (!isScrubbing) return;

        clearTimeout(scrubCommitTimeout);
        const target = scrubTargetSec;
        isScrubbing = false;
        scrubRepeatCount = 0;

        const timelineBox = document.getElementById('osd-timeline-box');
        if (timelineBox) timelineBox.classList.remove('is-scrubbing');

        currentTimeSec = target;
        updateTimeline();

        // Brief settling lock so hardware has time to buffer the new frame
        targetSeekSec = target;
        isSettlingSeek = true;
        clearTimeout(scrubSettlingTimeout);
        scrubSettlingTimeout = setTimeout(function() {
            isSettlingSeek = false;
            targetSeekSec = null;
        }, 800);

        // Commit seek
        if (isAVPlay) {
            performAvplaySeek(target);
        } else {
            const vid = document.getElementById('fallback-video');
            if (vid) {
                try { vid.currentTime = target; } catch (e) {}
            }
        }
    }

    function seekRelative(seconds) {
        startOrContinueScrub(seconds >= 0 ? 1 : -1, Math.abs(seconds));
    }

    function seekTo(targetSeconds) {
        if (!isPlayerOpen) return;

        if (durationSec <= 0 && isAVPlay) {
            try {
                const d = webapis.avplay.getDuration();
                if (d && d > 0) durationSec = Math.floor(d / 1000);
            } catch (e) {}
        }

        let target = Math.max(0, targetSeconds);
        if (durationSec > 0) {
            target = Math.min(durationSec, target);
        }

        const delta = target - currentTimeSec;
        currentTimeSec = target;
        updateTimeline();
        showOSD();
        showSeekFeedback(delta, target);

        targetSeekSec = target;
        isSettlingSeek = true;
        clearTimeout(scrubSettlingTimeout);
        scrubSettlingTimeout = setTimeout(function() {
            isSettlingSeek = false;
            targetSeekSec = null;
        }, 800);

        if (isAVPlay) {
            performAvplaySeek(target);
        } else {
            const vid = document.getElementById('fallback-video');
            if (vid) {
                try { vid.currentTime = target; } catch (e) {}
            }
        }
    }

    function performAvplaySeek(targetSec) {
        if (!isAVPlay) return;
        try {
            const state = webapis.avplay.getState();
            console.log('[Player] performAvplaySeek targetSec:', targetSec, 'state:', state);
            if (window.FileReceiver && window.FileReceiver.sendSocketMessage) {
                window.FileReceiver.sendSocketMessage(`[Player] Seeking to ${targetSec}s (state=${state})`);
            }

            if (isSeekingInProgress) {
                queuedSeekTarget = targetSec;
                return;
            }

            if (state === 'PLAYING' || state === 'PAUSED') {
                // Ensure targetMs is within valid boundaries: [1000, durationMs - 1000]
                let targetMs = Math.round(targetSec * 1000);
                if (durationSec > 0) {
                    targetMs = Math.min(targetMs, Math.max(1000, (durationSec - 2) * 1000));
                }
                targetMs = Math.max(1000, targetMs);

                isSeekingInProgress = true;
                isSettlingSeek = true;
                targetSeekSec = targetSec;
                updateStatusTag('Seeking...');

                // Safety watchdog: clear locks if hardware doesn't respond in 20 seconds
                clearTimeout(scrubSettlingTimeout);
                scrubSettlingTimeout = setTimeout(function() {
                    finalizeSeek(false, '[Player] Seek timeout watchdog reset');
                }, 20000);

                function finalizeSeek(success, message) {
                    clearTimeout(scrubSettlingTimeout);
                    if (message && window.FileReceiver && window.FileReceiver.sendSocketMessage) {
                        window.FileReceiver.sendSocketMessage(message);
                    }
                    setTimeout(function() {
                        isSettlingSeek = false;
                        targetSeekSec = null;
                        isSeekingInProgress = false;

                        // If seek failed completely and returned an error callback, sync currentTimeSec back
                        if (!success) {
                            try {
                                const realMs = webapis.avplay.getCurrentTime();
                                if (realMs >= 0) {
                                    currentTimeSec = Math.floor(realMs / 1000);
                                    updateTimeline();
                                }
                            } catch (ex) {}
                        }

                        // Process queued seek if user scrubbed again while waiting
                        if (queuedSeekTarget !== null) {
                            const nextTarget = queuedSeekTarget;
                            queuedSeekTarget = null;
                            performAvplaySeek(nextTarget);
                        }
                    }, 350);
                }

                webapis.avplay.seekTo(
                    targetMs,
                    function() {
                        console.log('[Player] AVPlay seekTo success at', targetMs, 'ms');
                        updateStatusTag(isPlaying ? 'Playing' : 'Paused');
                        finalizeSeek(true, `[Player] AVPlay seekTo SUCCESS at ${targetSec}s`);
                    },
                    function(err) {
                        console.warn('[Player] AVPlay seekTo error:', err);
                        const errDesc = (err && (err.name || err.message)) ? (err.name || err.message) : JSON.stringify(err);

                        // Fallback with jumpForward / jumpBackward (offset in MILLISECONDS)
                        try {
                            const curSec = Math.floor(webapis.avplay.getCurrentTime() / 1000);
                            const diffSec = Math.round(targetSec - curSec);
                            const diffMs = Math.abs(diffSec) * 1000;
                            if (diffSec > 0) {
                                webapis.avplay.jumpForward(diffMs, function() {
                                    finalizeSeek(true, `[Player] jumpForward +${diffSec}s SUCCESS`);
                                }, function(e) {
                                    console.warn('[Player] jumpForward error:', e);
                                    finalizeSeek(false, `[Player] Seek & Jump failed: ${errDesc}`);
                                });
                            } else if (diffSec < 0) {
                                webapis.avplay.jumpBackward(diffMs, function() {
                                    finalizeSeek(true, `[Player] jumpBackward -${Math.abs(diffSec)}s SUCCESS`);
                                }, function(e) {
                                    console.warn('[Player] jumpBackward error:', e);
                                    finalizeSeek(false, `[Player] Seek & Jump failed: ${errDesc}`);
                                });
                            } else {
                                finalizeSeek(true, `[Player] Already at target`);
                            }
                        } catch (ex) {
                            console.warn('[Player] jump fallback exception:', ex);
                            finalizeSeek(false, `[Player] Jump exception: ${ex.message}`);
                        }
                    }
                );
            } else if (state === 'READY') {
                webapis.avplay.play();
                isPlaying = true;
                setTimeout(function() {
                    performAvplaySeek(targetSec);
                }, 250);
            } else {
                isSeekingInProgress = false;
                isSettlingSeek = false;
                targetSeekSec = null;
            }
        } catch (e) {
            console.error('[Player] Error calling AVPlay seekTo:', e);
            isSeekingInProgress = false;
            isSettlingSeek = false;
            targetSeekSec = null;
        }
    }

    function formatDeltaTime(sec) {
        const sign = sec >= 0 ? '+' : '-';
        const abs = Math.abs(Math.round(sec));
        if (abs < 60) {
            return `${sign}${abs}s`;
        }
        const m = Math.floor(abs / 60);
        const s = abs % 60;
        return `${sign}${m}m ${s < 10 ? '0' : ''}${s}s`;
    }

    function showSeekFeedback(deltaSec, targetSec) {
        const feedbackEl = document.getElementById('osd-seek-feedback');
        const statusTag = document.getElementById('osd-status-tag');
        const dirSymbol = deltaSec >= 0 ? '⏩ ' : '⏪ ';
        const msg = `${dirSymbol}${formatDeltaTime(deltaSec)} (${formatTime(targetSec)})`;

        if (feedbackEl) {
            feedbackEl.textContent = msg;
            feedbackEl.style.display = 'inline-flex';
            clearTimeout(seekFeedbackTimeout);
            seekFeedbackTimeout = setTimeout(function() {
                feedbackEl.style.display = 'none';
            }, 1800);
        }
        if (statusTag) {
            statusTag.textContent = msg;
            setTimeout(function() {
                if (statusTag.textContent === msg) {
                    updateStatusTag(isPlaying ? 'Playing' : 'Paused');
                }
            }, 1800);
        }
    }

    function showAspectToast(text) {
        const toast = document.getElementById('player-aspect-toast');
        const textEl = document.getElementById('player-aspect-text');
        if (toast && textEl) {
            textEl.textContent = text;
            toast.style.display = 'flex';
            clearTimeout(aspectToastTimeout);
            aspectToastTimeout = setTimeout(function() {
                toast.style.display = 'none';
            }, 2400);
        }

        const feedbackEl = document.getElementById('osd-seek-feedback');
        if (feedbackEl) {
            feedbackEl.textContent = `📐 ${text}`;
            feedbackEl.style.display = 'inline-flex';
            clearTimeout(seekFeedbackTimeout);
            seekFeedbackTimeout = setTimeout(function() {
                feedbackEl.style.display = 'none';
            }, 2400);
        }

        const statusTag = document.getElementById('osd-status-tag');
        if (statusTag) {
            const originalStatus = isPlaying ? 'Playing' : 'Paused';
            statusTag.textContent = text;
            setTimeout(function() {
                if (statusTag.textContent === text) {
                    updateStatusTag(originalStatus);
                }
            }, 2400);
        }
    }

    function applyAspectRatio(targetIdx) {
        if (typeof targetIdx === 'number') {
            currentAspectModeIdx = ((targetIdx % ASPECT_MODES.length) + ASPECT_MODES.length) % ASPECT_MODES.length;
        }
        const mode = ASPECT_MODES[currentAspectModeIdx] || ASPECT_MODES[0];
        console.log(`[Player] Applying aspect ratio mode [${currentAspectModeIdx}]: ${mode.name}`);

        const aspectBtnLabel = document.getElementById('osd-aspect-label');
        if (aspectBtnLabel) {
            aspectBtnLabel.textContent = mode.short;
        }

        if (isAVPlay) {
            try {
                const cfg = mode.avplay;
                try {
                    webapis.avplay.setDisplayRect(cfg.x, cfg.y, cfg.width, cfg.height);
                } catch (eRect) {
                    console.warn('[Player] Custom setDisplayRect failed, falling back to 0,0,1920,1080:', eRect);
                    try {
                        webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
                    } catch (eFallback) {}
                }
                if (cfg.method) {
                    webapis.avplay.setDisplayMethod(cfg.method);
                }
            } catch (e) {
                console.warn('[Player] AVPlay setDisplayMethod exception:', e);
            }
        }

        const vid = document.getElementById('fallback-video');
        if (vid) {
            const h = mode.html5;
            vid.style.width = h.width || '100%';
            vid.style.height = h.height || '100%';
            vid.style.left = h.left || '0px';
            vid.style.top = h.top || '0px';
            vid.style.objectFit = h.objectFit || 'contain';
            vid.style.transform = h.transform || 'none';
            if (h.transformOrigin) {
                vid.style.transformOrigin = h.transformOrigin;
            } else {
                vid.style.transformOrigin = 'center center';
            }
        }
    }

    function toggleAspectRatio() {
        currentAspectModeIdx = (currentAspectModeIdx + 1) % ASPECT_MODES.length;
        applyAspectRatio(currentAspectModeIdx);
        const mode = ASPECT_MODES[currentAspectModeIdx];
        showAspectToast(mode.name);
        if (window.FileReceiver && window.FileReceiver.showToast) {
            window.FileReceiver.showToast(`📐 Aspect Ratio: ${mode.name}`);
        }
    }

    function close() {
        if (!isPlayerOpen) return;

        saveResumePosition(true);
        stopTorrentProgressPolling();
        showBufferingOverlay(false);

        const toast = document.getElementById('player-resume-toast');
        if (toast) toast.style.display = 'none';

        const aspectToast = document.getElementById('player-aspect-toast');
        if (aspectToast) aspectToast.style.display = 'none';
        clearTimeout(aspectToastTimeout);

        document.body.classList.remove('media-playing-mode');

        if (isAVPlay) {
            stopAndCloseAVPlay();
        } else {
            const vid = document.getElementById('fallback-video');
            if (vid) {
                vid.pause();
                vid.src = '';
            }
        }

        const container = document.getElementById('player-container');
        if (container) container.classList.remove('player-active');

        const osd = document.getElementById('player-osd');
        if (osd) osd.classList.remove('osd-visible');
        clearTimeout(osdTimeout);
        clearTimeout(seekDebounceTimeout);
        clearTimeout(seekFeedbackTimeout);
        clearTimeout(resumeToastTimeout);
        clearTimeout(scrubCommitTimeout);
        clearTimeout(scrubSettlingTimeout);
        isScrubbing = false;
        isSettlingSeek = false;
        targetSeekSec = null;
        isSeekingInProgress = false;
        queuedSeekTarget = null;
        scrubRepeatCount = 0;
        const timelineBox = document.getElementById('osd-timeline-box');
        if (timelineBox) timelineBox.classList.remove('is-scrubbing');

        clearSubtitles();
        isPlayerOpen = false;
        isPlaying = false;
        durationSec = 0;
        currentTimeSec = 0;
        videoResumeKey = '';
        pendingResumeTime = 0;

        // Restore navigation focus on previous app element
        if (window.Navigation) {
            window.Navigation.focusInitialElement();
        }
    }

    function updateTimeline() {
        const currentEl = document.getElementById('osd-current-time');
        const durationEl = document.getElementById('osd-duration-time');
        const fillEl = document.getElementById('osd-scrubber-fill');
        const thumbEl = document.getElementById('osd-scrubber-thumb');

        if (currentEl) currentEl.textContent = formatTime(currentTimeSec);
        if (durationEl) durationEl.textContent = formatTime(durationSec);

        if (durationSec > 0) {
            const percent = Math.min(100, Math.max(0, (currentTimeSec / durationSec) * 100));
            if (fillEl) fillEl.style.width = `${percent}%`;
            if (thumbEl) thumbEl.style.left = `${percent}%`;
        } else {
            if (fillEl) fillEl.style.width = '0%';
            if (thumbEl) thumbEl.style.left = '0%';
        }
    }

    function updatePlayPauseIcon() {
        const btn = document.getElementById('osd-play-btn');
        if (btn) {
            btn.innerHTML = isPlaying ? '❚❚' : '▶';
        }
    }

    function updateStatusTag(status) {
        const tag = document.getElementById('osd-status-tag');
        if (tag) tag.textContent = status;
    }

    function showOSD() {
        const osd = document.getElementById('player-osd');
        if (!osd) return;

        osd.classList.add('osd-visible');
        clearTimeout(osdTimeout);
        osdTimeout = setTimeout(function() {
            if (isPlaying) {
                osd.classList.remove('osd-visible');
            }
        }, 5000);
    }

    function isOsdVisible() {
        const osd = document.getElementById('player-osd');
        return osd ? osd.classList.contains('osd-visible') : false;
    }

    const ISO_LANG_MAP = {
        'tam': 'Tamil', 'ta': 'Tamil',
        'tel': 'Telugu', 'te': 'Telugu',
        'hin': 'Hindi', 'hi': 'Hindi',
        'mal': 'Malayalam', 'ml': 'Malayalam',
        'kan': 'Kannada', 'kn': 'Kannada',
        'eng': 'English', 'en': 'English',
        'spa': 'Spanish', 'es': 'Spanish',
        'fra': 'French', 'fre': 'French', 'fr': 'French',
        'ger': 'German', 'deu': 'German', 'de': 'German',
        'ita': 'Italian', 'it': 'Italian',
        'ben': 'Bengali', 'bn': 'Bengali',
        'mar': 'Marathi', 'mr': 'Marathi',
        'guj': 'Gujarati', 'gu': 'Gujarati',
        'pan': 'Punjabi', 'pa': 'Punjabi',
        'kor': 'Korean', 'ko': 'Korean',
        'jpn': 'Japanese', 'ja': 'Japanese',
        'chi': 'Chinese', 'zho': 'Chinese', 'zh': 'Chinese'
    };

    let cachedAudioTracks = [];
    let currentAudioTrackIndex = 0;

    function openAudioSelectionDialog() {
        const dialog = document.getElementById('audio-dialog-backdrop');
        const listEl = document.getElementById('audio-tracks-list');
        if (!dialog || !listEl) return;

        listEl.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:12px;">Detecting audio tracks...</div>';
        dialog.classList.add('dialog-open');

        let tracks = [];
        if (isAVPlay && typeof webapis !== 'undefined' && webapis.avplay) {
            try {
                const totalTracks = webapis.avplay.getTotalTrackInfo();
                if (Array.isArray(totalTracks)) {
                    totalTracks.forEach(t => {
                        if (t.type === 'AUDIO') {
                            let extra = {};
                            if (typeof t.extra_info === 'string') {
                                try { extra = JSON.parse(t.extra_info); } catch (e) { extra = {}; }
                            } else if (t.extra_info && typeof t.extra_info === 'object') {
                                extra = t.extra_info;
                            }
                            const code = (extra.language || extra.track_lang || extra.lang || '').toLowerCase().trim();
                            const name = ISO_LANG_MAP[code] || (code ? code.toUpperCase() : `Audio Track ${t.index + 1}`);
                            tracks.push({
                                index: t.index,
                                code: code,
                                name: name
                            });
                        }
                    });
                }
            } catch (e) {
                console.warn('[Player] AVPlay getTotalTrackInfo:', e);
            }

            try {
                const cur = webapis.avplay.getCurrentStreamInfo();
                if (Array.isArray(cur)) {
                    for (let i = 0; i < cur.length; i++) {
                        if (cur[i].type === 'AUDIO') {
                            currentAudioTrackIndex = cur[i].index;
                            break;
                        }
                    }
                }
            } catch (e) {}
        }

        const renderTracksUI = (trackList) => {
            cachedAudioTracks = trackList;
            listEl.innerHTML = '';
            if (!trackList || trackList.length === 0) {
                listEl.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:16px;">Standard single audio track active (Default).</div>';
                return;
            }

            trackList.forEach(tr => {
                const btn = document.createElement('button');
                const isActive = (tr.index === currentAudioTrackIndex);
                btn.className = `focusable ${isActive ? 'active' : ''}`;
                btn.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 18px;
                    border-radius: 10px;
                    background: ${isActive ? 'linear-gradient(90deg, rgba(0, 242, 254, 0.25) 0%, rgba(123, 44, 191, 0.25) 100%)' : 'rgba(255, 255, 255, 0.08)'};
                    border: 1px solid ${isActive ? 'var(--primary-cyan)' : 'rgba(255, 255, 255, 0.15)'};
                    color: #fff;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    width: 100%;
                `;
                btn.tabIndex = 0;
                btn.innerHTML = `
                    <span style="display:flex; align-items:center; gap:10px;">
                        <span>🔊</span>
                        <span>${tr.name}</span>
                        ${tr.code ? `<span style="font-size:12px; opacity:0.6; text-transform:uppercase;">[${tr.code}]</span>` : ''}
                    </span>
                    <span style="color:${isActive ? 'var(--primary-cyan)' : 'transparent'}; font-weight:700;">
                        ${isActive ? '✓ Active' : ''}
                    </span>
                `;

                btn.addEventListener('click', function() {
                    selectAudioTrack(tr.index, tr.name);
                    closeAudioSelectionDialog();
                });

                listEl.appendChild(btn);
            });

            if (window.Navigation) {
                const first = listEl.querySelector('.focusable.active') || listEl.querySelector('.focusable');
                if (first) window.Navigation.setFocus(first);
            }
        };

        if (tracks.length > 0) {
            renderTracksUI(tracks);
        } else {
            // Fallback: query companion server /media_info?file=...
            const queryName = currentTitle || currentMediaUrl || '';
            fetch(`http://192.168.0.13:8080/media_info?file=${encodeURIComponent(queryName)}`)
                .then(res => res.json())
                .then(data => {
                    if (data && data.audioTracks && data.audioTracks.length > 0) {
                        renderTracksUI(data.audioTracks);
                    } else {
                        renderTracksUI([]);
                    }
                })
                .catch(() => renderTracksUI([]));
        }
    }

    function closeAudioSelectionDialog() {
        const dialog = document.getElementById('audio-dialog-backdrop');
        if (dialog) dialog.classList.remove('dialog-open');
        const audioBtn = document.getElementById('osd-audio-btn');
        if (audioBtn && window.Navigation) {
            window.Navigation.setFocus(audioBtn);
        }
    }

    function selectAudioTrack(index, name) {
        currentAudioTrackIndex = index;
        if (isAVPlay && typeof webapis !== 'undefined' && webapis.avplay) {
            try {
                webapis.avplay.setSelectTrack('AUDIO', index);
                console.log(`[Player] Switched AVPlay audio track to index: ${index} (${name})`);
            } catch (e) {
                console.warn('[Player] setSelectTrack failed:', e);
            }
        }
        if (window.FileReceiver && window.FileReceiver.showToast) {
            window.FileReceiver.showToast(`🔊 Audio Language: ${name}`);
        }
    }

    function setupOsdEvents() {
        const playBtn = document.getElementById('osd-play-btn');
        const episodesBtn = document.getElementById('osd-episodes-btn');
        const audioBtn = document.getElementById('osd-audio-btn');
        const audioCloseBtn = document.getElementById('audio-dialog-close-btn');
        const aspectBtn = document.getElementById('osd-aspect-btn');
        const infoBtn = document.getElementById('osd-info-btn');
        const subsBtn = document.getElementById('osd-subs-btn');
        const closeBtn = document.getElementById('osd-close-btn');
        const timelineBox = document.getElementById('osd-timeline-box');
        const scrubberTrack = document.querySelector('.osd-scrubber-track');

        if (playBtn) playBtn.addEventListener('click', togglePlayPause);
        if (episodesBtn) episodesBtn.addEventListener('click', function() {
            if (window.VideoPlayer && window.VideoPlayer.openEpisodesDialogForCurrent) {
                window.VideoPlayer.openEpisodesDialogForCurrent();
            }
        });
        if (audioBtn) audioBtn.addEventListener('click', openAudioSelectionDialog);
        if (audioCloseBtn) audioCloseBtn.addEventListener('click', closeAudioSelectionDialog);
        if (aspectBtn) aspectBtn.addEventListener('click', toggleAspectRatio);
        if (infoBtn) infoBtn.addEventListener('click', function() {
            if (window.VideoPlayer && window.VideoPlayer.toggleTorrentInfoHud) {
                window.VideoPlayer.toggleTorrentInfoHud(true, currentTitle || currentMediaUrl);
            }
        });
        if (subsBtn) subsBtn.addEventListener('click', function() {
            if (window.VideoPlayer && window.VideoPlayer.openSubtitleSearchModal) {
                window.VideoPlayer.openSubtitleSearchModal();
            }
        });
        if (closeBtn) closeBtn.addEventListener('click', close);

        if (timelineBox && scrubberTrack) {
            timelineBox.addEventListener('click', function(e) {
                if (durationSec <= 0) return;
                const rect = scrubberTrack.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                if (rect.width > 0) {
                    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
                    seekTo(Math.round(ratio * durationSec));
                }
            });
        }

        const container = document.getElementById('player-container');
        if (container) {
            container.addEventListener('mousemove', showOSD);
            container.addEventListener('click', function(e) {
                if (e.target === container || e.target.id === 'fallback-video' || e.target.id === 'subtitles-layer') {
                    if (isOsdVisible()) {
                        togglePlayPause();
                    } else {
                        showOSD();
                    }
                }
            });
        }
    }

    /* Subtitle Parsing and Rendering */
    function loadSubtitle(url) {
        fetch(url)
            .then(res => res.text())
            .then(text => {
                subtitles = parseSRT(text);
                console.log(`[Player] Loaded ${subtitles.length} subtitle cues.`);
                window.FileReceiver.showToast(`Subtitles loaded (${subtitles.length} cues)`);
            })
            .catch(err => {
                console.warn('[Player] Subtitle load failed:', err);
            });
    }

    function parseSRT(data) {
        const cues = [];
        const regex = /(\d+)\r?\n(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})\r?\n([\s\S]*?)(?=\r?\n\r?\n|\r?\n*$)/g;
        let match;
        while ((match = regex.exec(data)) !== null) {
            cues.push({
                start: parseTimestamp(match[2]),
                end: parseTimestamp(match[3]),
                text: match[4].replace(/\r?\n/g, '<br>')
            });
        }
        return cues;
    }

    function parseTimestamp(ts) {
        const parts = ts.split(/[:,\.]/);
        return parseInt(parts[0], 10) * 3600 +
               parseInt(parts[1], 10) * 60 +
               parseInt(parts[2], 10) +
               parseInt(parts[3], 10) / 1000;
    }

    function checkSubtitles(timeSec) {
        const layer = document.getElementById('subtitles-layer');
        if (!layer || subtitles.length === 0) return;

        const currentCue = subtitles.find(c => timeSec >= c.start && timeSec <= c.end);
        if (currentCue) {
            layer.innerHTML = `<span>${currentCue.text}</span>`;
        } else {
            layer.innerHTML = '';
        }
    }

    function clearSubtitles() {
        subtitles = [];
        const layer = document.getElementById('subtitles-layer');
        if (layer) layer.innerHTML = '';
    }

    function formatTime(sec) {
        if (!sec || isNaN(sec) || sec < 0) return '00:00';
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        if (h > 0) {
            return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
        }
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }

    return {
        init: init,
        openMedia: openMedia,
        play: play,
        pause: pause,
        togglePlayPause: togglePlayPause,
        seekRelative: seekRelative,
        seekTo: seekTo,
        finishScrubbing: finishScrubbing,
        isScrubbingActive: function() { return isScrubbing; },
        showOSD: showOSD,
        isOsdVisible: isOsdVisible,
        close: close,
        isActive: function() { return isPlayerOpen; },
        getCurrentTitle: function() { return currentTitle; },
        loadSubtitle: loadSubtitle,
        toggleAspectRatio: toggleAspectRatio,
        applyAspectRatio: applyAspectRatio
    };
})();
