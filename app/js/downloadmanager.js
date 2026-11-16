/**
 * Module 4: Download Management Dashboard for Samsung Tizen TV
 * Connects to Companion Bridge API: http://192.168.0.14:8080/api/downloads
 * Dynamically displays:
 * - List of all available movies (completed downloads)
 * - List of currently downloading movies (priority queue)
 * - Live download status, progress percentage, speed, and completion status
 * - Priority-based management: Highest Priority (streaming), Normal Priority, Idle Mode
 * - Stops uploading (seeding) on completion status
 */

window.DownloadManager = (function() {
    'use strict';

    let pollInterval = null;
    let isFetching = false;
    let cachedData = null;

    function init() {
        console.log('[DownloadManager] Initializing Download Management Dashboard...');
        setupEvents();
    }

    function setupEvents() {
        const refreshBtn = document.getElementById('dm-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                fetchDashboardData(true);
            });
        }

        const tabDownloads = document.getElementById('tab-downloads');
        if (tabDownloads) {
            tabDownloads.addEventListener('click', function() {
                if (window.App) window.App.switchView('downloads');
            });
        }

        const homeTile = document.getElementById('home-tile-downloads');
        if (homeTile) {
            homeTile.addEventListener('click', function() {
                if (window.App) window.App.switchView('downloads');
            });
        }

        const playerBtn = document.getElementById('player-btn-downloads');
        if (playerBtn) {
            playerBtn.addEventListener('click', function() {
                if (window.App) window.App.switchView('downloads');
            });
        }
    }

    function getApiUrl() {
        const base = (window.getServerBaseUrl && window.getServerBaseUrl()) ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
        return `${base}/api/downloads`;
    }

    function startPolling() {
        console.log('[DownloadManager] Starting active dashboard polling...');
        fetchDashboardData(true);
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(function() {
            fetchDashboardData(false);
        }, 1500);
    }

    function stopPolling() {
        console.log('[DownloadManager] Stopping dashboard polling.');
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    function fetchDashboardData(isManual) {
        if (isFetching && !isManual) return;
        isFetching = true;

        const url = getApiUrl();
        fetch(url, { cache: 'no-store' })
            .then(function(res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function(data) {
                isFetching = false;
                cachedData = data;
                renderDashboard(data);
                updateApiStatusBadge(true, url);
            })
            .catch(function(err) {
                isFetching = false;
                console.warn('[DownloadManager] Fetch error:', err);
                updateApiStatusBadge(false, url);
            });
    }

    function updateApiStatusBadge(isOnline, url) {
        const statusEl = document.getElementById('dm-api-status');
        if (!statusEl) return;
        if (isOnline) {
            statusEl.innerHTML = `<span class="dm-dot online"></span><span>API: ${url} (Connected)</span>`;
            statusEl.className = 'dm-status-pill online';
        } else {
            statusEl.innerHTML = `<span class="dm-dot offline"></span><span>API: ${url} (Connecting...)</span>`;
            statusEl.className = 'dm-status-pill offline';
        }
    }

    function renderDashboard(data) {
        if (!data) return;

        // 1. Render System Status Header
        const sys = data.system_status || {};
        const modeEl = document.getElementById('dm-system-mode');
        const speedEl = document.getElementById('dm-total-speed');
        const seedingEl = document.getElementById('dm-seeding-status');

        if (modeEl) {
            const isStream = sys.mode === 'streaming_priority';
            const isBg = sys.mode === 'background_downloading';
            modeEl.textContent = sys.mode_label || 'Idle Mode (Monitoring Queue)';
            modeEl.className = 'dm-mode-pill ' + (isStream ? 'stream-active' : (isBg ? 'bg-active' : 'idle'));
        }

        if (speedEl) {
            const dlCount = (data.currently_downloading || []).length;
            speedEl.textContent = `${dlCount} Active / In-Queue`;
        }

        if (seedingEl) {
            seedingEl.textContent = sys.seeding_status || 'Stopped (Zero Upload)';
        }

        // 2. Render Currently Downloading Movies
        renderDownloadingList(data.currently_downloading || []);

        // 3. Render Available Movies
        renderAvailableList(data.available_movies || []);
    }

    function renderDownloadingList(downloadingList) {
        const listEl = document.getElementById('dm-downloading-list');
        const countBadge = document.getElementById('dm-downloading-count');
        if (countBadge) countBadge.textContent = `${downloadingList.length} items`;
        if (!listEl) return;

        // Remember currently focused element id to preserve remote focus across polls
        const activeEl = document.activeElement;
        const activeId = activeEl ? activeEl.id : null;

        if (downloadingList.length === 0) {
            listEl.innerHTML = `
                <div class="dm-empty-state">
                    <div class="dm-empty-icon">⚡</div>
                    <div class="dm-empty-title">No Active Background Downloads</div>
                    <div class="dm-empty-desc">
                        System is in <strong>Idle Mode</strong>. Incomplete torrents are automatically downloaded in sequence on the Raspberry Pi without requiring the TV to remain on.
                    </div>
                </div>
            `;
            return;
        }

        listEl.innerHTML = '';

        downloadingList.forEach(function(item, idx) {
            const card = document.createElement('div');
            card.className = 'dm-download-card focusable';
            card.id = `dm-dl-card-${idx}`;
            card.tabIndex = 0;

            const isStream = !!item.is_active_stream;
            const isHighest = item.priority === 'Highest';
            const isNormal = item.priority === 'Normal';

            const badgeClass = isHighest ? 'badge-highest' : (isNormal ? 'badge-normal' : 'badge-queued');
            const badgeText = item.priority_badge || (isHighest ? '⚡ Highest Priority' : (isNormal ? '⏳ Normal Priority' : '🕒 Queued'));

            const progress = Math.min(100, Math.max(0, item.progress || 0));

            card.innerHTML = `
                <div class="dm-card-top">
                    <div class="dm-card-title-group">
                        <span class="dm-priority-tag ${badgeClass}">${badgeText}</span>
                        <span class="dm-item-title" title="${item.clean_title || item.name}">${item.clean_title || item.name}</span>
                    </div>
                    <div class="dm-card-pct">${progress}%</div>
                </div>

                <div class="dm-progress-track">
                    <div class="dm-progress-fill ${isHighest ? 'fill-highest' : ''}" style="width: ${progress}%;"></div>
                </div>

                <div class="dm-metrics-row">
                    <div class="dm-metric">
                        <span class="dm-metric-label">Download Speed:</span>
                        <span class="dm-metric-val ${isStream || isNormal ? 'text-accent' : ''}">${item.speed || '0 B/s'}</span>
                    </div>
                    <div class="dm-metric">
                        <span class="dm-metric-label">Upload (Seeding):</span>
                        <span class="dm-metric-val text-muted">${item.upload_speed || '0 B/s (Stopped)'}</span>
                    </div>
                    <div class="dm-metric">
                        <span class="dm-metric-label">Downloaded / Total:</span>
                        <span class="dm-metric-val">${item.downloaded || '0 B'} / ${item.total || '...'}</span>
                    </div>
                    <div class="dm-metric">
                        <span class="dm-metric-label">Peers &amp; ETA:</span>
                        <span class="dm-metric-val">${item.peers || 0} peers • ${item.time_remaining || 'In Queue'}</span>
                    </div>
                </div>

                <div class="dm-card-status-bar">
                    <span class="dm-status-text">Status: <strong>${item.status || 'Active'}</strong></span>
                    <div class="dm-card-actions">
                        <button class="dm-action-btn btn-play focusable" id="dm-btn-play-${idx}" tabindex="0" title="Prioritize & Play Video">
                            <span>▶️</span>
                            <span>${isStream ? 'Resume Playing' : 'Prioritize & Play'}</span>
                        </button>
                        ${!isHighest ? `
                        <button class="dm-action-btn btn-prioritize focusable" id="dm-btn-pri-${idx}" tabindex="0" title="Promote to Highest Priority">
                            <span>⚡</span>
                            <span>Highest Priority</span>
                        </button>
                        ` : ''}
                        <button class="dm-action-btn btn-cancel focusable" id="dm-btn-del-${idx}" tabindex="0" title="Cancel Download">
                            <span>🗑️</span>
                            <span>Cancel</span>
                        </button>
                    </div>
                </div>
            `;

            // Action: Prioritize & Play
            const playBtn = card.querySelector(`#dm-btn-play-${idx}`);
            if (playBtn) {
                playBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    prioritizeAndPlay(item);
                });
            }

            // Action: Bump to Highest Priority without immediately switching view
            const priBtn = card.querySelector(`#dm-btn-pri-${idx}`);
            if (priBtn) {
                priBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    promotePriority(item);
                });
            }

            // Action: Cancel Download
            const delBtn = card.querySelector(`#dm-btn-del-${idx}`);
            if (delBtn) {
                delBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    cancelDownload(item);
                });
            }

            // Clicking card defaults to Prioritize & Play
            card.addEventListener('click', function(e) {
                if (e.target.closest('button')) return;
                prioritizeAndPlay(item);
            });

            listEl.appendChild(card);
        });

        // Restore focus if same element exists
        if (activeId) {
            const toFocus = document.getElementById(activeId);
            if (toFocus && window.Navigation) {
                window.Navigation.setFocus(toFocus);
            }
        }
    }

    function renderAvailableList(availableList) {
        const listEl = document.getElementById('dm-available-list');
        const countBadge = document.getElementById('dm-available-count');
        if (countBadge) countBadge.textContent = `${availableList.length} movies ready`;
        if (!listEl) return;

        const activeEl = document.activeElement;
        const activeId = activeEl ? activeEl.id : null;

        if (availableList.length === 0) {
            listEl.innerHTML = `
                <div class="dm-empty-state">
                    <div class="dm-empty-icon">🎬</div>
                    <div class="dm-empty-title">No Completed Movies on Server</div>
                    <div class="dm-empty-desc">
                        When a torrent finishes downloading in the background, it appears here immediately with full AVPlay hardware playback support.
                    </div>
                </div>
            `;
            return;
        }

        listEl.innerHTML = '';

        availableList.forEach(function(movie, idx) {
            const card = document.createElement('div');
            card.className = 'dm-movie-card focusable';
            card.id = `dm-movie-card-${idx}`;
            card.tabIndex = 0;

            card.innerHTML = `
                <div class="dm-movie-icon-box">
                    <span>🎬</span>
                </div>
                <div class="dm-movie-details">
                    <div class="dm-movie-title" title="${movie.clean_title || movie.name}">${movie.clean_title || movie.name}</div>
                    <div class="dm-movie-meta-row">
                        <span class="dm-done-badge">✓ 100% Downloaded</span>
                        <span class="dm-seeding-badge">Upload: Seeding Stopped</span>
                        <span class="dm-size-text">${movie.size_formatted || '0 B'}</span>
                    </div>
                </div>
                <div class="dm-movie-actions">
                    <button class="dm-action-btn btn-play-movie focusable" id="dm-movie-play-${idx}" tabindex="0" title="Play Movie in AVPlay">
                        <span>▶️</span>
                        <span>Play Movie</span>
                    </button>
                    <button class="dm-action-btn btn-del-movie focusable" id="dm-movie-del-${idx}" tabindex="0" title="Delete from Server">
                        <span>🗑️</span>
                    </button>
                </div>
            `;

            const playBtn = card.querySelector(`#dm-movie-play-${idx}`);
            if (playBtn) {
                playBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    playCompletedMovie(movie);
                });
            }

            const delBtn = card.querySelector(`#dm-movie-del-${idx}`);
            if (delBtn) {
                delBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    deleteCompletedMovie(movie);
                });
            }

            card.addEventListener('click', function(e) {
                if (e.target.closest('button')) return;
                playCompletedMovie(movie);
            });

            listEl.appendChild(card);
        });

        if (activeId) {
            const toFocus = document.getElementById(activeId);
            if (toFocus && window.Navigation) {
                window.Navigation.setFocus(toFocus);
            }
        }
    }

    function prioritizeAndPlay(item) {
        const title = item.clean_title || item.name;
        if (window.FileReceiver && window.FileReceiver.showToast) {
            window.FileReceiver.showToast(`Prioritizing: ${title}...`);
        }

        const base = (window.getServerBaseUrl && window.getServerBaseUrl()) ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
        fetch(`${base}/api/prioritize?file=${encodeURIComponent(item.name)}`)
            .then(res => res.json())
            .then(data => {
                const streamUrl = data ? data.streamUrl : null;
                if (streamUrl && window.Player) {
                    if (window.App) window.App.switchView('player');
                    window.Player.openMedia(streamUrl, title);
                } else if (window.VideoPlayer && window.VideoPlayer.startTorrentStream) {
                    if (window.App) window.App.switchView('player');
                    window.VideoPlayer.startTorrentStream(item.name, item.total_bytes || 0);
                }
            })
            .catch(err => {
                console.warn('[DownloadManager] Prioritize error:', err);
                if (window.VideoPlayer && window.VideoPlayer.startTorrentStream) {
                    if (window.App) window.App.switchView('player');
                    window.VideoPlayer.startTorrentStream(item.name, item.total_bytes || 0);
                }
            });
    }

    function promotePriority(item) {
        const title = item.clean_title || item.name;
        const base = (window.getServerBaseUrl && window.getServerBaseUrl()) ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
        fetch(`${base}/api/prioritize?file=${encodeURIComponent(item.name)}`)
            .then(() => {
                if (window.FileReceiver && window.FileReceiver.showToast) {
                    window.FileReceiver.showToast(`Elevated to Highest Priority: ${title}`);
                }
                fetchDashboardData(true);
            })
            .catch(err => console.warn('[DownloadManager] Promote error:', err));
    }

    function cancelDownload(item) {
        const title = item.clean_title || item.name;
        const base = (window.getServerBaseUrl && window.getServerBaseUrl()) ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
        fetch(`${base}/delete_file?file=${encodeURIComponent(item.name)}`)
            .then(() => {
                if (window.FileReceiver && window.FileReceiver.showToast) {
                    window.FileReceiver.showToast(`Cancelled download: ${title}`);
                }
                fetchDashboardData(true);
            })
            .catch(err => console.warn('[DownloadManager] Cancel error:', err));
    }

    function playCompletedMovie(movie) {
        const title = movie.clean_title || movie.name;
        const streamUrl = movie.stream_url;
        console.log('[DownloadManager] Playing completed movie:', title, streamUrl);
        if (window.Player && streamUrl) {
            if (window.App) window.App.switchView('player');
            window.Player.openMedia(streamUrl, title);
        }
    }

    function deleteCompletedMovie(movie) {
        const title = movie.clean_title || movie.name;
        const base = (window.getServerBaseUrl && window.getServerBaseUrl()) ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
        fetch(`${base}/delete_file?file=${encodeURIComponent(movie.name)}`)
            .then(() => {
                if (window.FileReceiver && window.FileReceiver.showToast) {
                    window.FileReceiver.showToast(`Deleted movie: ${title}`);
                }
                fetchDashboardData(true);
            })
            .catch(err => console.warn('[DownloadManager] Delete error:', err));
    }

    return {
        init: init,
        startPolling: startPolling,
        stopPolling: stopPolling,
        refresh: function() { fetchDashboardData(true); },
        prioritizeAndPlay: prioritizeAndPlay,
        playCompletedMovie: playCompletedMovie
    };
})();
