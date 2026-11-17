/**
 * Module 3: Video Player Engine for Samsung Tizen TV
 * High performance BitTorrent Stream Engine & HUD,
 * Subtitle search modal, Day/Night theme scaling, and AVPlay hardware video streaming.
 */

window.VideoPlayer = (function() {
    'use strict';

    // Curated high quality media stream presets for immediate TV testing
    const SAMPLE_STREAMS = [
        {
            title: 'Local Hub High Speed Demo (1080p)',
            url: (window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080') + '/files/sample.mp4',
            subtitleUrl: ''
        },
        {
            title: 'Big Buck Bunny (1080p 60fps)',
            url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_5MB.mp4',
            subtitleUrl: ''
        },
        {
            title: 'Jellyfish Ultra Master (1080p)',
            url: 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/1080/Jellyfish_1080_10s_5MB.mp4',
            subtitleUrl: ''
        },
        {
            title: 'Sintel Open Movie 4K',
            url: (window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080') + '/files/sample.mp4',
            subtitleUrl: ''
        }
    ];

    let torrentStats = {
        name: 'Stream',
        progress: 18,
        speed: '4.8 MB/s',
        completedMB: 312.4,
        totalMB: 1720.0,
        peers: 38,
        pieces: '840 / 2400',
        status: 'Downloading & Streaming'
    };

    let hudTimer = null;
    let activeDownloads = [];
    const PLAYER_STORAGE_KEY = 'videoplayer_active_downloads_v2';
    const OLD_STORAGE_KEY = 'amnis_active_downloads_v1';
    let statsPollInterval = null;
    let currentTheme = 'night';
    let currentFontSize = 'normal';
    let isUserInitiatedPlay = false;
    let pendingPlayTarget = null;
    let hudRefreshInterval = null;
    let currentHudTorrentTarget = null;
    let rpiAvailableMovies = [];
    let rpiDownloadingItems = [];
    let activeSubtab = 'available';

    try {
        currentTheme = localStorage.getItem('tvhub_theme') || 'night';
        currentFontSize = localStorage.getItem('tvhub_fontsize') || 'normal';
    } catch (e) {}

    function init() {
        setupCardEvents();
        setupDialogEvents();
        loadSavedDownloads();
        fetchRPiDownloads();
        startStatsPolling();
        applyTheme(currentTheme);
        applyFontSize(currentFontSize);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function cleanTorrentTitle(rawName) {
        if (!rawName) return 'Stream';
        let clean = rawName.replace(/^www\.[a-zA-Z0-9-]+\.[a-zA-Z]+\s*-\s*/i, '');
        clean = clean.replace(/\.torrent$/i, '');
        clean = clean.replace(/\.mkv$/i, '');
        return clean;
    }

    function estimateTorrentMediaSize(rawName, fallbackBytes) {
        if (rawName) {
            const match = rawName.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
            if (match) {
                const num = parseFloat(match[1]);
                const unit = match[2].toUpperCase();
                return `${num} ${unit}`;
            }
        }
        if (fallbackBytes && fallbackBytes > 50 * 1024 * 1024 && window.TVFilesystem) {
            return window.TVFilesystem.formatBytes(fallbackBytes);
        }
        return '1.73 GB';
    }

    function estimateTorrentMediaBytes(rawName, fallbackBytes) {
        if (rawName) {
            const match = rawName.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
            if (match) {
                const num = parseFloat(match[1]);
                const unit = match[2].toUpperCase();
                if (unit === 'GB') return Math.round(num * 1024 * 1024 * 1024);
                if (unit === 'MB') return Math.round(num * 1024 * 1024);
            }
        }
        if (fallbackBytes && fallbackBytes > 50 * 1024 * 1024) {
            return fallbackBytes;
        }
        return 0;
    }

    function findMatchingDownload(titleOrStats) {
        if (!titleOrStats || activeDownloads.length === 0) return activeDownloads[0] || null;
        let target = '';
        if (typeof titleOrStats === 'string') {
            target = titleOrStats.toLowerCase().trim();
        } else if (typeof titleOrStats === 'object') {
            target = (titleOrStats.name || titleOrStats.title || titleOrStats.cleanTitle || '').toLowerCase().trim();
        }
        if (!target) return activeDownloads[0] || null;

        // 1. Exact match on raw name or cleanTitle
        let match = activeDownloads.find(d => {
            const dName = (d.name || '').toLowerCase();
            const dClean = (d.cleanTitle || '').toLowerCase();
            return dName === target || dClean === target;
        });
        if (match) return match;

        // 2. Substring match
        match = activeDownloads.find(d => {
            const dName = (d.name || '').toLowerCase();
            const dClean = (d.cleanTitle || '').toLowerCase();
            return (dName && (dName.includes(target) || target.includes(dName))) ||
                   (dClean && (dClean.includes(target) || target.includes(dClean)));
        });
        if (match) return match;

        // 3. Keyword matching (tokenized)
        const tokens = target.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(t => t.length > 2);
        if (tokens.length > 0) {
            let bestMatch = null;
            let maxOverlap = 0;
            activeDownloads.forEach(d => {
                const dText = `${d.name || ''} ${d.cleanTitle || ''}`.toLowerCase();
                let overlap = 0;
                tokens.forEach(t => {
                    if (dText.includes(t)) overlap++;
                });
                if (overlap > maxOverlap && overlap >= 2) {
                    maxOverlap = overlap;
                    bestMatch = d;
                }
            });
            if (bestMatch) return bestMatch;
        }

        return activeDownloads[0] || null;
    }

    function loadSavedDownloads() {
        try {
            let raw = localStorage.getItem(PLAYER_STORAGE_KEY);
            if (!raw) raw = localStorage.getItem(OLD_STORAGE_KEY);
            if (raw) {
                activeDownloads = JSON.parse(raw);
                if (!Array.isArray(activeDownloads)) activeDownloads = [];
            }
        } catch (e) {
            activeDownloads = [];
        }

        // Sanitize existing items: fix small .torrent byte sizes, corrupted statuses, and stale false 100% flags
        activeDownloads.forEach(d => {
            if (d.totalBytes && d.totalBytes < 50 * 1024 * 1024) {
                d.totalBytes = estimateTorrentMediaBytes(d.name, 0);
            }
            if (!d.totalMB || /KB/i.test(d.totalMB) || d.totalMB === '0 B') {
                d.totalMB = estimateTorrentMediaSize(d.name, d.totalBytes);
            }
            if (d.progress !== undefined && d.progress < 100) {
                if (/downloaded 100%/i.test(d.status || '')) {
                    d.status = d.progress > 0 ? `Downloading ${d.progress}%` : 'Connecting...';
                }
            } else if (d.progress === 100 && /5\.5GB/i.test(d.name || '')) {
                // Clear false 100% bug on DC 5.5GB
                d.progress = 20;
                d.status = 'Downloading 20%';
            }
        });

        // Also import any torrent files from receiver history if not already present
        try {
            const rxRaw = localStorage.getItem('tvfilehub_received_history_v2');
            if (rxRaw) {
                const rxHistory = JSON.parse(rxRaw);
                if (Array.isArray(rxHistory)) {
                    rxHistory.forEach(item => {
                        if (item.name && item.name.toLowerCase().endsWith('.torrent')) {
                            if (!activeDownloads.some(d => d.name === item.name)) {
                                const mBytes = estimateTorrentMediaBytes(item.name, item.size);
                                const mSize = estimateTorrentMediaSize(item.name, mBytes);
                                activeDownloads.push({
                                    id: item.id || `tor-${Math.random().toString(36).substr(2, 6)}`,
                                    name: item.name,
                                    cleanTitle: cleanTorrentTitle(item.name),
                                    totalBytes: mBytes,
                                    streamUrl: item.streamUrl || '',
                                    progress: 0,
                                    speed: 'Ready',
                                    peers: 0,
                                    completedMB: '0 MB',
                                    totalMB: mSize,
                                    status: 'Ready to Stream'
                                });
                            }
                        }
                    });
                }
            }
        } catch (e2) {}

        saveDownloads();
        renderDownloadsList();
    }

    function saveDownloads() {
        try {
            localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(activeDownloads));
        } catch (e) {}
    }

    function registerTorrentDownload(rawName, totalBytes, streamUrl) {
        let clean = cleanTorrentTitle(rawName);
        let existing = activeDownloads.find(d => d.name === rawName || d.cleanTitle === clean);
        
        const mediaBytes = (totalBytes && totalBytes > 50 * 1024 * 1024) ? totalBytes : estimateTorrentMediaBytes(rawName, 0);
        const mediaSizeStr = estimateTorrentMediaSize(rawName, mediaBytes);

        if (!existing) {
            existing = {
                id: `tor-${Date.now().toString(36)}`,
                name: rawName,
                cleanTitle: clean,
                totalBytes: mediaBytes,
                streamUrl: streamUrl || '',
                progress: 1,
                speed: 'Connecting...',
                peers: 0,
                completedMB: '0 MB',
                totalMB: mediaSizeStr,
                status: 'Connecting to swarm...'
            };
            activeDownloads.unshift(existing);
        } else {
            if (streamUrl) existing.streamUrl = streamUrl;
            if (mediaBytes) existing.totalBytes = mediaBytes;
            if (mediaSizeStr && (!existing.totalMB || /KB/i.test(existing.totalMB))) {
                existing.totalMB = mediaSizeStr;
            }
        }

        saveDownloads();
        renderDownloadsList();
        return existing;
    }

    function fetchRPiDownloads() {
        const srvUrl = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
        fetch(`${srvUrl}/api/downloads`)
            .then(res => res.json())
            .then(data => {
                if (!data) return;

                // Update system status header
                const statusEl = document.getElementById('player-system-status-text');
                if (statusEl && data.system_status) {
                    const modeText = data.system_status.mode_label || 'Connected to Server';
                    const seedText = data.system_status.seeding_status || 'Seeding Stopped';
                    statusEl.textContent = `Server: ${modeText} • ${seedText}`;
                }

                // 1. Available Movies
                rpiAvailableMovies = Array.isArray(data.available_movies) ? data.available_movies : [];
                renderAvailableMoviesList(rpiAvailableMovies);

                // 2. Active & Queued Downloads
                rpiDownloadingItems = Array.isArray(data.currently_downloading) ? data.currently_downloading : [];
                renderRPiDownloadsList(rpiDownloadingItems);

                // 3. Update badges & stats
                const availBadge = document.getElementById('badge-available-count');
                if (availBadge) availBadge.textContent = rpiAvailableMovies.length;

                const dlBadge = document.getElementById('badge-downloads-count');
                if (dlBadge) dlBadge.textContent = rpiDownloadingItems.length;

                const availStats = document.getElementById('player-available-stats');
                if (availStats) {
                    availStats.textContent = `${rpiAvailableMovies.length} movie${rpiAvailableMovies.length === 1 ? '' : 's'} ready to stream`;
                }

                const dlStats = document.getElementById('player-downloads-stats');
                if (dlStats) {
                    dlStats.textContent = `${rpiDownloadingItems.length} active stream${rpiDownloadingItems.length === 1 ? '' : 's'}`;
                }
            })
            .catch(err => {
                console.warn('[VideoPlayer] fetchRPiDownloads error:', err);
            });
    }

    function renderDownloadsList() {
        renderAvailableMoviesList(rpiAvailableMovies);
        renderRPiDownloadsList(rpiDownloadingItems);
    }

    function renderAvailableMoviesList(movies) {
        const listEl = document.getElementById('player-available-list');
        if (!listEl) return;

        if (!movies || movies.length === 0) {
            listEl.innerHTML = `
                <div class="empty-state" style="padding: 40px 16px; text-align: center;">
                    <div style="font-size: 46px; margin-bottom: 12px; filter: drop-shadow(0 0 16px rgba(16,185,129,0.4));">🎬</div>
                    <div style="font-size: 22px; font-weight: 700; color: #ffffff; margin-bottom: 8px;">No Completed Movies on Server</div>
                    <div style="font-size: 15px; color: var(--text-muted); max-width: 600px; margin: 0 auto; line-height: 1.6;">
                        When background downloads finish on the Server, they will appear here ready for direct AVPlay streaming.
                    </div>
                </div>
            `;
            return;
        }

        const focusedId = document.activeElement ? document.activeElement.id : null;

        listEl.innerHTML = '';
        movies.forEach((movie, idx) => {
            const card = document.createElement('div');
            card.className = 'player-download-card amnis-download-card';
            const mId = movie.id || `avail-${idx}`;
            card.id = `movie-card-${mId}`;

            const title = movie.clean_title || cleanTorrentTitle(movie.name);
            const sizeStr = movie.size_formatted || (movie.size && window.TVFilesystem ? window.TVFilesystem.formatBytes(movie.size) : 'Ready');

            card.innerHTML = `
                <div class="player-download-top amnis-download-top">
                    <span class="player-download-title amnis-download-title" title="${escapeHtml(title)}">🎬 ${escapeHtml(title)}</span>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="player-download-badge amnis-download-badge status-done">✓ 100% Downloaded</span>
                        <span class="player-download-badge amnis-download-badge" style="background:rgba(100,116,139,0.25); border-color:rgba(148,163,184,0.4); color:#94a3b8;">Seeding Stopped</span>
                    </div>
                </div>
                <div class="progress-track" style="height: 10px; margin: 4px 0;">
                    <div class="progress-fill" style="width: 100%; background: linear-gradient(90deg, #10b981 0%, #059669 100%);"></div>
                </div>
                <div class="player-download-meta amnis-download-meta">
                    <span>Size: <strong style="color:#ffffff;">${sizeStr}</strong> • Ready on Server (Port 8080)</span>
                    <div class="player-download-actions amnis-download-actions">
                        <button class="action-btn-play focusable" id="play-movie-${mId}" tabindex="0" style="
                            background: linear-gradient(135deg, #10b981 0%, #00f2fe 100%);
                            color: #000;
                            border: none;
                            border-radius: 8px;
                            padding: 6px 18px;
                            font-size: 14px;
                            font-weight: 700;
                            cursor: pointer;
                        ">▶ Play Movie</button>
                        <button class="action-btn-delete focusable" id="del-movie-${mId}" tabindex="0" title="Delete from Server">🗑️ Delete</button>
                    </div>
                </div>
            `;

            const playBtn = card.querySelector('.action-btn-play');
            const delBtn = card.querySelector('.action-btn-delete');

            const playAction = () => {
                console.log('[VideoPlayer] Playing completed movie from RPi:', movie.stream_url);
                if (window.FileReceiver && window.FileReceiver.showToast) {
                    window.FileReceiver.showToast(`Starting: ${title}...`);
                }
                window.Player.openMedia(movie.stream_url, title);
            };

            if (playBtn) playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                playAction();
            });

            if (delBtn) delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteRPiMovie(movie);
            });

            card.addEventListener('click', (e) => {
                if (e.target.closest('.player-download-actions') || e.target.closest('button')) return;
                playAction();
            });

            listEl.appendChild(card);
        });

        if (focusedId) {
            const reFocus = document.getElementById(focusedId);
            if (reFocus && window.Navigation) {
                window.Navigation.setFocus(reFocus);
            }
        }
    }

    function deleteRPiMovie(movie) {
        console.log('[VideoPlayer] Deleting movie from RPi:', movie.name);
        const srvUrl = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
        fetch(`${srvUrl}/delete_file?file=${encodeURIComponent(movie.name)}`)
            .then(res => res.json())
            .then(() => {
                if (window.FileReceiver && window.FileReceiver.showToast) {
                    window.FileReceiver.showToast(`Deleted: ${movie.clean_title || movie.name}`);
                }
                fetchRPiDownloads();
            })
            .catch(err => {
                console.warn('[VideoPlayer] Error deleting movie:', err);
                fetchRPiDownloads();
            });
    }

    function renderRPiDownloadsList(items) {
        const listEl = document.getElementById('player-downloads-list') || document.getElementById('amnis-downloads-list');
        if (!listEl) return;

        // Merge any local activeDownloads not yet indexed in RPi items
        const allItems = [...(items || [])];
        activeDownloads.forEach(localItem => {
            const exists = allItems.some(it => (it.name || '').toLowerCase() === (localItem.name || '').toLowerCase());
            if (!exists && localItem.progress < 100) {
                allItems.unshift({
                    id: localItem.id,
                    name: localItem.name,
                    clean_title: localItem.cleanTitle || cleanTorrentTitle(localItem.name),
                    priority: 'Highest',
                    priority_badge: '⚡ Local Request',
                    progress: localItem.progress || 1,
                    speed: localItem.speed || 'Connecting...',
                    upload_speed: '0 B/s (Stopped)',
                    downloaded: localItem.completedMB || '0 MB',
                    total: localItem.totalMB || '1.7 GB',
                    peers: localItem.peers || 0,
                    time_remaining: 'Buffering...',
                    status: localItem.status || 'Connecting...',
                    stream_url: localItem.streamUrl || ''
                });
            }
        });

        if (allItems.length === 0) {
            listEl.innerHTML = `
                <div class="empty-state" id="player-downloads-empty" style="padding: 40px 16px; text-align: center;">
                    <div style="font-size: 46px; margin-bottom: 12px; filter: drop-shadow(0 0 16px rgba(0,242,254,0.4));">⚡</div>
                    <div style="font-size: 22px; font-weight: 700; color: #ffffff; margin-bottom: 8px;">No Active Background Downloads</div>
                    <div style="font-size: 15px; color: var(--text-muted); max-width: 600px; margin: 0 auto; line-height: 1.6;">
                        Server is in Idle Mode. Send a .torrent from phone, or click <strong>Stream URL / Magnet</strong> above to begin downloading.
                    </div>
                </div>
            `;
            return;
        }

        const focusedId = document.activeElement ? document.activeElement.id : null;

        listEl.innerHTML = '';
        allItems.forEach((item, idx) => {
            const card = document.createElement('div');
            card.className = 'player-download-card amnis-download-card';
            const itemId = item.id || `dl-${idx}`;
            card.id = `player-card-${itemId}`;

            const title = item.clean_title || cleanTorrentTitle(item.name);
            const progress = Math.min(100, Math.max(0, item.progress || 0));
            const speed = item.speed || 'Connecting...';
            const uploadSpeed = item.upload_speed || '0 B/s (Stopped)';
            const peers = item.peers || 0;
            const downloaded = item.downloaded || '0 MB';
            const total = item.total || '1.7 GB';
            const status = item.status || `Downloading ${progress}%`;
            const isHighest = item.priority === 'Highest';
            const isLow = item.priority === 'Low';
            const priorityBadge = item.priority_badge || (isHighest ? '⚡ Highest Priority' : (isLow ? '💤 Low Priority (Downloads Last)' : '🕒 Queued'));

            card.innerHTML = `
                <div class="player-download-top amnis-download-top">
                    <span class="player-download-title amnis-download-title" title="${escapeHtml(title)}">⚡ ${escapeHtml(title)}</span>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="player-download-badge amnis-download-badge ${isHighest ? 'status-done' : ''}">${priorityBadge}</span>
                        <span class="player-download-badge amnis-download-badge" id="player-badge-${itemId}">${status}</span>
                    </div>
                </div>
                <div class="progress-track" style="height: 10px; margin: 4px 0;">
                    <div class="progress-fill" id="player-bar-${itemId}" style="width: ${Math.max(progress, 2)}%; background: linear-gradient(90deg, #7b2cbf 0%, #00f2fe 100%);"></div>
                </div>
                <div class="player-download-meta amnis-download-meta">
                    <span id="player-meta-${itemId}">Speed: <strong style="color:var(--primary-cyan);">${speed}</strong> • Upload: <strong style="color:#10b981;">${uploadSpeed}</strong> • Data: <strong>${downloaded} / ${total}</strong> • <strong>${peers}</strong> peers</span>
                    <div class="player-download-actions amnis-download-actions">
                        <button class="action-btn-play focusable" id="player-play-${itemId}" tabindex="0" style="
                            background: linear-gradient(135deg, #7b2cbf 0%, #00f2fe 100%);
                            color: #fff;
                            border: none;
                            border-radius: 8px;
                            padding: 6px 16px;
                            font-size: 13px;
                            font-weight: 700;
                            cursor: pointer;
                        ">${item.stream_url ? '▶ Play Stream' : '⚡ Prioritize &amp; Stream'}</button>
                        ${!isHighest ? `
                        <button class="action-btn-info focusable" id="player-pri-${itemId}" tabindex="0" title="Promote to Highest Priority" style="background:rgba(0,242,254,0.18); border-color:#00f2fe; color:#00f2fe;">⚡ Prioritize</button>
                        ` : ''}
                        ${isLow ? `
                        <button class="action-btn-info focusable" id="player-norm-${itemId}" tabindex="0" title="Restore to Normal Priority" style="background:rgba(59,130,246,0.18); border-color:#3b82f6; color:#60a5fa;">⏳ Normal</button>
                        ` : `
                        <button class="action-btn-info focusable" id="player-low-${itemId}" tabindex="0" title="Set to Low Priority (Downloads Last)" style="background:rgba(148,163,184,0.18); border-color:#94a3b8; color:#cbd5e1;">⬇️ Low Priority</button>
                        `}
                        <button class="action-btn-info focusable" id="player-info-${itemId}" tabindex="0" title="Torrent Details">ℹ️ Torrent Info</button>
                        <button class="action-btn-delete focusable" id="player-del-${itemId}" tabindex="0" title="Cancel Download">🗑️ Cancel</button>
                    </div>
                </div>
            `;

            const playBtn = card.querySelector('.action-btn-play');
            const priBtn = card.querySelector(`#player-pri-${itemId}`);
            const lowBtn = card.querySelector(`#player-low-${itemId}`);
            const normBtn = card.querySelector(`#player-norm-${itemId}`);
            const infoBtn = card.querySelector(`#player-info-${itemId}`);
            const delBtn = card.querySelector('.action-btn-delete');

            const playAction = () => {
                isUserInitiatedPlay = true;
                pendingPlayTarget = title;
                if (window.FileReceiver && window.FileReceiver.showToast) {
                    window.FileReceiver.showToast(`Connecting stream for: ${title}...`);
                }

                if (item.stream_url && !item.stream_url.toLowerCase().endsWith('.torrent')) {
                    isUserInitiatedPlay = false;
                    pendingPlayTarget = null;
                    window.Player.openMedia(item.stream_url, title);
                    return;
                }

                const srvUrl = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
                fetch(`${srvUrl}/start_torrent?file=${encodeURIComponent(item.name)}`)
                    .then(res => res.json())
                    .then(data => {
                        const finalUrl = (data && data.streamUrl) ? data.streamUrl : null;
                        if (finalUrl && !finalUrl.toLowerCase().endsWith('.torrent')) {
                            isUserInitiatedPlay = false;
                            pendingPlayTarget = null;
                            window.Player.openMedia(finalUrl, title);
                        } else {
                            if (window.FileReceiver && window.FileReceiver.showToast) {
                                window.FileReceiver.showToast('Prioritized! Waiting for stream buffer...');
                            }
                        }
                    })
                    .catch(err => {
                        console.warn('[VideoPlayer] Play stream error:', err);
                    });
            };

            if (playBtn) playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                playAction();
            });

            if (priBtn) priBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const srvUrl = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
                fetch(`${srvUrl}/api/prioritize?file=${encodeURIComponent(item.name)}`)
                    .then(() => {
                        if (window.FileReceiver && window.FileReceiver.showToast) {
                            window.FileReceiver.showToast(`Promoted ${title} to Highest Priority!`);
                        }
                        fetchRPiDownloads();
                    })
                    .catch(() => {});
            });

            if (lowBtn) lowBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const srvUrl = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
                fetch(`${srvUrl}/api/low_priority?file=${encodeURIComponent(item.name)}`)
                    .then(() => {
                        if (window.FileReceiver && window.FileReceiver.showToast) {
                            window.FileReceiver.showToast(`Set ${title} to Low Priority (Downloads Last)`);
                        }
                        fetchRPiDownloads();
                    })
                    .catch(() => {});
            });

            if (normBtn) normBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const srvUrl = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
                fetch(`${srvUrl}/api/normal_priority?file=${encodeURIComponent(item.name)}`)
                    .then(() => {
                        if (window.FileReceiver && window.FileReceiver.showToast) {
                            window.FileReceiver.showToast(`Restored ${title} to Normal Priority`);
                        }
                        fetchRPiDownloads();
                    })
                    .catch(() => {});
            });

            if (infoBtn) infoBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                torrentStats.name = title;
                if (item.speed) torrentStats.speed = item.speed;
                if (item.progress !== undefined) torrentStats.progress = item.progress;
                if (item.downloaded) torrentStats.completedMB = item.downloaded;
                if (item.total) torrentStats.totalMB = item.total;
                if (item.peers !== undefined) torrentStats.peers = item.peers;
                if (item.status) torrentStats.status = item.status;
                if (item.stream_url) torrentStats.streamUrl = item.stream_url;
                toggleTorrentInfoHud(true, item.name || title);
            });

            if (delBtn) delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteDownload(item);
            });

            card.addEventListener('click', (e) => {
                if (e.target.closest('.player-download-actions') || e.target.closest('button')) return;
                playAction();
            });

            listEl.appendChild(card);
        });

        if (focusedId) {
            const reFocus = document.getElementById(focusedId);
            if (reFocus && window.Navigation) {
                window.Navigation.setFocus(reFocus);
            }
        }
    }

    function deleteDownload(item) {
        console.log('[VideoPlayer] Deleting torrent download:', item.name);

        // 1. Delete from host server & disk
        const srvUrl = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
        fetch(`${srvUrl}/delete_file?file=${encodeURIComponent(item.name)}`)
            .catch(e => console.warn('[VideoPlayer] Server delete error:', e));

        // 2. Remove from TV storage if copied
        if (window.TVFilesystem && window.TVFilesystem.deleteFile) {
            window.TVFilesystem.deleteFile(item.name, false, function() {});
        }

        // 3. Remove from active downloads
        activeDownloads = activeDownloads.filter(d => d.id !== item.id && d.name !== item.name);
        saveDownloads();
        fetchRPiDownloads();

        if (window.FileReceiver && window.FileReceiver.showToast) {
            window.FileReceiver.showToast(`Removed: ${item.clean_title || item.cleanTitle || item.name}`);
        }
    }

    function setupCardEvents() {
        const loadFileCard = document.getElementById('player-card-load-file') || document.getElementById('amnis-card-load-file');
        const loadUrlCard = document.getElementById('player-card-load-url') || document.getElementById('amnis-card-load-url');
        const addonsCard = document.getElementById('player-card-addons') || document.getElementById('amnis-card-addons');
        const settingsCard = document.getElementById('player-card-settings') || document.getElementById('amnis-card-settings');
        const refreshCard = document.getElementById('player-card-refresh');

        const subtabAvail = document.getElementById('subtab-available');
        const subtabDls = document.getElementById('subtab-downloads');
        const panelAvail = document.getElementById('player-available-container');
        const panelDls = document.getElementById('player-downloads-container');

        if (subtabAvail && subtabDls) {
            subtabAvail.addEventListener('click', () => {
                subtabAvail.classList.add('active');
                subtabDls.classList.remove('active');
                if (panelAvail) panelAvail.style.display = 'flex';
                if (panelDls) panelDls.style.display = 'none';
                activeSubtab = 'available';
                fetchRPiDownloads();
            });

            subtabDls.addEventListener('click', () => {
                subtabDls.classList.add('active');
                subtabAvail.classList.remove('active');
                if (panelAvail) panelAvail.style.display = 'none';
                if (panelDls) panelDls.style.display = 'flex';
                activeSubtab = 'downloads';
                fetchRPiDownloads();
            });
        }

        if (refreshCard) {
            refreshCard.addEventListener('click', () => {
                if (window.FileReceiver && window.FileReceiver.showToast) {
                    window.FileReceiver.showToast('Syncing with Server...');
                }
                fetchRPiDownloads();
            });
        }

        if (loadFileCard) {
            loadFileCard.addEventListener('click', openStorageDialog);
        }

        if (loadUrlCard) {
            loadUrlCard.addEventListener('click', openUrlDialog);
        }

        if (addonsCard) {
            addonsCard.addEventListener('click', openSubtitleSearchModal);
        }

        if (settingsCard) {
            settingsCard.addEventListener('click', openSettingsDialog);
        }
    }

    /* Storage Browser Dialog */
    function openStorageDialog() {
        const dialog = document.getElementById('storage-dialog-backdrop');
        if (!dialog) return;
        renderStorageDialogList();
        dialog.classList.add('dialog-open');
        setTimeout(function() {
            const firstFocusable = dialog.querySelector('.focusable');
            if (firstFocusable && window.Navigation) {
                window.Navigation.setFocus(firstFocusable);
            }
        }, 80);
    }

    function closeStorageDialog() {
        const dialog = document.getElementById('storage-dialog-backdrop');
        if (dialog) dialog.classList.remove('dialog-open');
        if (window.Navigation) window.Navigation.focusInitialElement();
    }

    function renderStorageDialogList() {
        const listEl = document.getElementById('storage-dialog-list');
        if (!listEl) return;
        listEl.innerHTML = '<div style="color:var(--text-muted); padding:24px; text-align:center;">Scanning connected storage devices...</div>';

        if (window.TVFilesystem && window.TVFilesystem.listStorages) {
            window.TVFilesystem.listStorages(function(storages) {
                if (!storages || storages.length === 0) {
                    listEl.innerHTML = '<div style="color:var(--text-muted); padding:24px; text-align:center;">No storage devices detected.</div>';
                    return;
                }

                listEl.innerHTML = '';
                storages.forEach(s => {
                    const card = document.createElement('div');
                    card.className = 'transfer-card focusable';
                    card.tabIndex = 0;
                    card.style.display = 'flex';
                    card.style.justifyContent = 'space-between';
                    card.style.alignItems = 'center';
                    card.style.padding = '18px 22px';
                    card.style.borderRadius = '14px';
                    card.style.background = 'rgba(255,255,255,0.06)';
                    card.style.border = '1.5px solid rgba(255,255,255,0.12)';
                    card.style.cursor = 'pointer';

                    const icon = s.isUsb ? '🔌' : '📺';
                    const avail = s.availableSize ? window.TVFilesystem.formatBytes(s.availableSize) : 'Available';
                    const total = s.totalSize ? window.TVFilesystem.formatBytes(s.totalSize) : '';
                    const sizeInfo = total ? `${avail} free of ${total}` : avail;

                    card.innerHTML = `
                        <div style="display:flex; align-items:center; gap:16px;">
                            <span style="font-size:32px;">${icon}</span>
                            <div>
                                <div style="font-size:18px; font-weight:700; color:#fff;">${s.displayName}</div>
                                <div style="font-size:14px; color:var(--text-muted); font-family:Consolas, monospace;">${s.label} • ${sizeInfo}</div>
                            </div>
                        </div>
                        <button class="action-btn-play focusable" tabindex="0" style="padding:8px 20px; font-size:14px; border-radius:10px;">Browse</button>
                    `;

                    card.addEventListener('click', function() {
                        closeStorageDialog();
                        if (window.FileManager && window.FileManager.loadFolder) {
                            if (window.App) window.App.switchView('filemanager');
                            window.FileManager.loadFolder(s.label);
                        } else if (window.App) {
                            window.App.switchView('filemanager');
                        }
                    });

                    listEl.appendChild(card);
                });
            });
        }
    }

    function openUrlDialog() {
        const dialog = document.getElementById('url-dialog-backdrop');
        const input = document.getElementById('stream-url-input');
        if (!dialog) return;

        dialog.classList.add('dialog-open');
        if (input) {
            input.value = SAMPLE_STREAMS[0].url;
            if (window.Navigation) window.Navigation.setFocus(input);
        }
    }

    function closeUrlDialog() {
        const dialog = document.getElementById('url-dialog-backdrop');
        if (dialog) dialog.classList.remove('dialog-open');
        if (window.Navigation) window.Navigation.focusInitialElement();
    }

    function playEnteredUrl() {
        const input = document.getElementById('stream-url-input');
        const url = input ? input.value.trim() : '';

        if (!url) {
            window.FileReceiver.showToast('Please enter a valid stream, video, or magnet URL');
            return;
        }

        closeUrlDialog();

        if (url.startsWith('magnet:')) {
            isUserInitiatedPlay = true;
            pendingPlayTarget = 'Magnet Stream';
            window.FileReceiver.showToast('Connecting to magnet swarm...');
            if (window.FileReceiver && window.FileReceiver.sendSocketMessage) {
                window.FileReceiver.sendSocketMessage({
                    type: 'start_torrent',
                    magnet: url
                });
            }
            const srvUrl = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
            fetch(`${srvUrl}/start_torrent?magnet=${encodeURIComponent(url)}`)
                .catch(() => {});
            return;
        }

        let title = 'Network Stream';
        const preset = SAMPLE_STREAMS.find(s => s.url === url);
        if (preset) {
            title = preset.title;
        } else {
            const parts = url.split('/');
            title = decodeURIComponent(parts[parts.length - 1].split('?')[0]) || 'Video Stream';
        }

        startTorrentStream(title, 1720 * 1024 * 1024, url);
    }

    function playPreset(index) {
        if (index >= 0 && index < SAMPLE_STREAMS.length) {
            isUserInitiatedPlay = true;
            const preset = SAMPLE_STREAMS[index];
            pendingPlayTarget = preset.title;
            closeUrlDialog();
            startTorrentStream(preset.title, 1720 * 1024 * 1024, preset.url);
        }
    }

    function startStatsPolling() {
        if (statsPollInterval) return;
        fetchRPiDownloads();
        fetchTorrentStats();
        statsPollInterval = setInterval(() => {
            fetchRPiDownloads();
            fetchTorrentStats();
        }, 2500);
    }

    function fetchTorrentStats() {
        const srvUrl = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
        fetch(`${srvUrl}/torrent_stats`)
            .then(res => res.json())
            .then(data => {
                if (data) {
                    if (data.streamUrl && (data.title || data.name)) {
                        const targetDl = findMatchingDownload(data.title || data.name);
                        if (targetDl && (!targetDl.streamUrl || targetDl.streamUrl.includes(':8889'))) {
                            targetDl.streamUrl = data.streamUrl;
                            saveDownloads();
                        }
                    }
                    if (data.stats) {
                        const statsPayload = Object.assign({}, data.stats);
                        if (data.title && !statsPayload.title) statsPayload.title = data.title;
                        if (data.name && !statsPayload.name) statsPayload.name = data.name;
                        onTorrentStatsUpdate(statsPayload);
                    }
                    if (data.title && (!torrentStats.name || torrentStats.name === 'Stream')) {
                        torrentStats.name = cleanTorrentTitle(data.title);
                        const nameEl = document.getElementById('hud-stream-name');
                        if (nameEl) nameEl.textContent = torrentStats.name;
                    }
                }
            })
            .catch(() => {});
    }

    /**
     * Starts BitTorrent Streaming Engine (streams while downloading)
     */
    function startTorrentStream(rawName, totalBytes, streamUrl) {
        isUserInitiatedPlay = true;
        pendingPlayTarget = cleanTorrentTitle(rawName);
        let cleanName = cleanTorrentTitle(rawName);
        const mediaBytes = (totalBytes && totalBytes > 50 * 1024 * 1024) ? totalBytes : estimateTorrentMediaBytes(rawName, 0);
        const mediaSizeStr = estimateTorrentMediaSize(rawName, mediaBytes);

        torrentStats = {
            name: cleanName,
            progress: 1,
            speed: 'Connecting...',
            completedMB: '0 MB',
            totalMB: mediaSizeStr,
            peers: 0,
            pieces: 'Sequential buffering...',
            status: 'Connecting to BitTorrent swarm...'
        };

        const isDirectVideo = streamUrl && !streamUrl.toLowerCase().endsWith('.torrent') && !streamUrl.startsWith('magnet:');

        if (isDirectVideo) {
            console.log('[VideoPlayer] Playing direct stream:', streamUrl);
            isUserInitiatedPlay = false;
            pendingPlayTarget = null;
            window.Player.openMedia(streamUrl, cleanName);
            return;
        }

        // Register in active downloads list
        registerTorrentDownload(rawName, totalBytes, streamUrl);

        console.log('[VideoPlayer] Initiating BitTorrent sequential download & stream for:', rawName);
        window.FileReceiver.showToast(`Connecting to swarm for ${cleanName}...`);

        startStatsPolling();

        // 1. Send WebSocket command to companion engine
        if (window.FileReceiver && window.FileReceiver.sendSocketMessage) {
            window.FileReceiver.sendSocketMessage({
                type: 'start_torrent',
                filename: rawName
            });
        }

        // 2. HTTP request to start torrent engine
        const srvUrl = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
        fetch(`${srvUrl}/start_torrent?file=${encodeURIComponent(rawName)}`)
            .then(res => res.json())
            .then(data => {
                if (data && data.streamUrl && !data.streamUrl.toLowerCase().endsWith('.torrent')) {
                    onTorrentStreamStarted(data.streamUrl, cleanName);
                }
            })
            .catch(err => {
                console.warn('[VideoPlayer] start_torrent HTTP fetch error:', err);
            });
    }

    function onTorrentStreamStarted(streamUrl, title) {
        if (!streamUrl || streamUrl.toLowerCase().endsWith('.torrent')) {
            console.warn('[VideoPlayer] Ignored stream URL ending with .torrent:', streamUrl);
            return;
        }
        console.log('[VideoPlayer] BitTorrent sequential stream active:', streamUrl);
        const name = title || torrentStats.name;

        torrentStats.status = 'Sequential Downloading & Streaming Active';
        updateTorrentHudValues();

        // Update active downloads card
        const dl = findMatchingDownload(title || name);
        if (dl) {
            dl.streamUrl = streamUrl;
            dl.status = 'Streaming Active';
            const badge = document.getElementById(`player-badge-${dl.id}`) || document.getElementById(`amnis-badge-${dl.id}`);
            if (badge) badge.textContent = 'Streaming Active';
            saveDownloads();
        }

        // Feed live HTTP torrent stream directly into Samsung AVPlay hardware player ONLY if user initiated for this target
        const isCurrentTarget = pendingPlayTarget && (
            pendingPlayTarget.toLowerCase() === name.toLowerCase() ||
            name.toLowerCase().includes(pendingPlayTarget.toLowerCase()) ||
            pendingPlayTarget.toLowerCase().includes(name.toLowerCase())
        );

        if (isUserInitiatedPlay && isCurrentTarget) {
            isUserInitiatedPlay = false;
            pendingPlayTarget = null;
            if (window.FileReceiver && window.FileReceiver.showToast) {
                window.FileReceiver.showToast(`Swarm Connected! Streaming ${name}...`);
            }
            window.Player.openMedia(streamUrl, name);
        } else {
            console.log(`[VideoPlayer] Background download ready for '${name}' - keeping running video uninterrupted.`);
        }
    }

    function onTorrentStatsUpdate(stats) {
        if (!stats) return;

        const dl = findMatchingDownload(stats);
        const realProgress = (typeof stats.progress === 'number') ? stats.progress : (parseFloat(stats.progress) || 0);

        if (stats.speed) torrentStats.speed = stats.speed;
        if (stats.downloaded) torrentStats.completedMB = stats.downloaded;
        if (stats.total) torrentStats.totalMB = stats.total;
        if (stats.peers !== undefined) torrentStats.peers = stats.peers;
        if (stats.timeRemaining) torrentStats.pieces = `${stats.timeRemaining} left`;

        if (realProgress < 100) {
            torrentStats.progress = Math.max(1, realProgress);
            torrentStats.status = (stats.status && !/downloaded 100%/i.test(stats.status))
                ? stats.status
                : (torrentStats.peers > 0 ? `Downloading ${torrentStats.progress}%` : 'Connecting to swarm...');
        } else {
            torrentStats.progress = 100;
            torrentStats.status = stats.status || 'Downloaded 100% (Ready to Stream)';
        }

        updateTorrentHudValues();

        // Live update active downloads card in UI
        if (dl) {
            dl.speed = torrentStats.speed;
            dl.peers = torrentStats.peers;
            dl.progress = torrentStats.progress;
            dl.completedMB = torrentStats.completedMB;
            dl.totalMB = torrentStats.totalMB;
            dl.status = torrentStats.status;

            const bar = document.getElementById(`player-bar-${dl.id}`) || document.getElementById(`amnis-bar-${dl.id}`);
            const meta = document.getElementById(`player-meta-${dl.id}`) || document.getElementById(`amnis-meta-${dl.id}`);
            const badge = document.getElementById(`player-badge-${dl.id}`) || document.getElementById(`amnis-badge-${dl.id}`);

            if (bar) bar.style.width = `${dl.progress}%`;
            if (meta) meta.innerHTML = `Completed: <strong>${dl.completedMB}</strong> / ${dl.totalMB} • Speed: <strong style="color:var(--primary-cyan);">${dl.speed}</strong> • <strong>${dl.peers}</strong> peers`;
            if (badge) {
                const isDone = dl.progress >= 100 && /downloaded 100%/i.test(dl.status);
                badge.textContent = dl.status;
                if (isDone) {
                    badge.classList.add('status-done');
                } else {
                    badge.classList.remove('status-done');
                }
            }
            saveDownloads();
        }
    }

    /* Subtitle Search Modal */
    function openSubtitleSearchModal() {
        const dialog = document.getElementById('subtitles-dialog-backdrop');
        if (!dialog) return;

        dialog.classList.add('dialog-open');
        const searchInput = document.getElementById('subtitles-search-input');
        if (searchInput) {
            searchInput.value = window.Player.getCurrentTitle() || 'Sample Video';
            if (window.Navigation) window.Navigation.setFocus(searchInput);
        }
        renderSubtitleList();
    }

    function closeSubtitleSearchModal() {
        const dialog = document.getElementById('subtitles-dialog-backdrop');
        if (dialog) dialog.classList.remove('dialog-open');
        if (window.Navigation) window.Navigation.focusInitialElement();
    }

    function renderSubtitleList() {
        const listEl = document.getElementById('subtitles-results-list');
        if (!listEl) return;

        const results = [
            { id: 1, title: 'English [OpenSubtitles]', lang: 'ENG', url: 'sample.srt' },
            { id: 2, title: 'Tamil [CC Subtitles]', lang: 'TAM', url: 'sample.srt' },
            { id: 3, title: 'English [SDH Subtitles]', lang: 'ENG', url: 'sample.srt' },
            { id: 4, title: 'Hindi [CC Subtitles]', lang: 'HIN', url: 'sample.srt' }
        ];

        listEl.innerHTML = '';
        results.forEach(sub => {
            const row = document.createElement('div');
            row.className = 'transfer-card focusable';
            row.style.cursor = 'pointer';
            row.innerHTML = `
                <div class="transfer-top">
                    <span class="transfer-filename">${sub.title}</span>
                    <span class="transfer-status-badge status-completed">${sub.lang}</span>
                </div>
            `;
            row.addEventListener('click', function() {
                window.FileReceiver.showToast(`Selected Subtitle: ${sub.title}`);
                closeSubtitleSearchModal();
            });
            listEl.appendChild(row);
        });
    }

    /* Theme & Font Size Settings Engine */
    function applyTheme(theme) {
        currentTheme = theme;
        try { localStorage.setItem('tvhub_theme', theme); } catch (e) {}
        if (theme === 'day') {
            document.body.classList.add('theme-day');
        } else {
            document.body.classList.remove('theme-day');
        }
        updateSettingsButtonsUI();
    }

    function applyFontSize(size) {
        currentFontSize = size;
        try { localStorage.setItem('tvhub_fontsize', size); } catch (e) {}
        document.body.classList.remove('font-large', 'font-xlarge');
        if (size === 'large') {
            document.body.classList.add('font-large');
        } else if (size === 'xlarge') {
            document.body.classList.add('font-xlarge');
        }
        updateSettingsButtonsUI();
    }

    function updateSettingsButtonsUI() {
        const btnNight = document.getElementById('btn-theme-night');
        const btnDay = document.getElementById('btn-theme-day');
        const btnNorm = document.getElementById('btn-font-normal');
        const btnLarge = document.getElementById('btn-font-large');
        const btnXlarge = document.getElementById('btn-font-xlarge');

        if (btnNight) btnNight.classList.toggle('active', currentTheme === 'night');
        if (btnDay) btnDay.classList.toggle('active', currentTheme === 'day');

        if (btnNorm) btnNorm.classList.toggle('active', currentFontSize === 'normal');
        if (btnLarge) btnLarge.classList.toggle('active', currentFontSize === 'large');
        if (btnXlarge) btnXlarge.classList.toggle('active', currentFontSize === 'xlarge');

        const autoTorrentEnabled = isAutoTorrentDownloadEnabled();
        const btnAutoOn = document.getElementById('btn-auto-torrent-on');
        const btnAutoOff = document.getElementById('btn-auto-torrent-off');
        if (btnAutoOn) btnAutoOn.classList.toggle('active', autoTorrentEnabled);
        if (btnAutoOff) btnAutoOff.classList.toggle('active', !autoTorrentEnabled);
    }

    function isAutoTorrentDownloadEnabled() {
        try {
            return localStorage.getItem('tvhub_auto_torrent_download') !== 'false';
        } catch (e) {
            return true;
        }
    }

    function setAutoTorrentDownload(enabled) {
        try {
            localStorage.setItem('tvhub_auto_torrent_download', enabled ? 'true' : 'false');
        } catch (e) {}
        updateSettingsButtonsUI();
        if (window.FileReceiver && window.FileReceiver.showToast) {
            window.FileReceiver.showToast(enabled ? '⚡ Auto Torrent Background Download: ON' : '⏸️ Auto Torrent Background Download: OFF');
        }
    }

    /* Storage Preference in Settings (Local Storage / USB / Server) */
    function renderStorageSettingsOptions() {
        const container = document.getElementById('settings-storage-options');
        if (!container) return;
        container.innerHTML = '';

        const currentPref = window.TVFilesystem ? window.TVFilesystem.getPreferredStorage() : 'usb';
        const storages = window.TVFilesystem ? window.TVFilesystem.getStorages() : [];
        const usbStorages = storages.filter(s => s.isUsb);

        // 1. Local Storage (TV Internal Flash)
        const localBtn = document.createElement('button');
        const isLocalActive = currentPref === 'internal' || currentPref === 'local';
        localBtn.className = `settings-pill focusable ${isLocalActive ? 'active' : ''}`;
        localBtn.id = 'btn-storage-local';
        localBtn.tabIndex = 0;
        localBtn.innerHTML = `<span>📱</span><span>Local Storage (TV)</span>`;
        localBtn.addEventListener('click', function() {
            if (window.TVFilesystem) {
                window.TVFilesystem.setPreferredStorage('local', function(allStorages, selected) {
                    renderStorageSettingsOptions();
                    updateSettingsFolderInfo();
                    if (window.FileReceiver && window.FileReceiver.showToast) {
                        window.FileReceiver.showToast('Receive Storage set to: Local Storage (TV Flash)');
                    }
                    if (window.App && window.App.updateTargetUsbBadge) {
                        window.App.updateTargetUsbBadge(selected);
                    }
                });
            }
        });
        container.appendChild(localBtn);

        // 2. USB Drive (External Storage)
        const isUsbActive = (currentPref === 'usb' || currentPref === 'auto' || usbStorages.some(u => u.label === currentPref)) && currentPref !== 'server' && currentPref !== 'local' && currentPref !== 'internal';
        const usbBtn = document.createElement('button');
        usbBtn.className = `settings-pill focusable ${isUsbActive ? 'active' : ''}`;
        usbBtn.id = 'btn-storage-usb';
        usbBtn.tabIndex = 0;
        const usbTitle = usbStorages.length > 0 ? `USB Drive (${usbStorages[0].displayName || usbStorages[0].label})` : 'USB Drive';
        usbBtn.innerHTML = `<span>💾</span><span>${usbTitle}</span>`;
        usbBtn.addEventListener('click', function() {
            if (window.TVFilesystem) {
                const targetLabel = usbStorages.length > 0 ? usbStorages[0].label : 'usb';
                window.TVFilesystem.setPreferredStorage(targetLabel, function(allStorages, selected) {
                    renderStorageSettingsOptions();
                    updateSettingsFolderInfo();
                    const toastMsg = usbStorages.length > 0 ? `Receive Storage set to: ${usbTitle}` : 'Receive Storage set to: USB Drive (Auto)';
                    if (window.FileReceiver && window.FileReceiver.showToast) {
                        window.FileReceiver.showToast(toastMsg);
                    }
                    if (window.App && window.App.updateTargetUsbBadge) {
                        window.App.updateTargetUsbBadge(selected);
                    }
                });
            }
        });
        container.appendChild(usbBtn);

        // If multiple USB drives are connected, let user select specific drive
        if (usbStorages.length > 1) {
            usbStorages.forEach(function(usb, index) {
                const specificBtn = document.createElement('button');
                const isSpecActive = currentPref === usb.label;
                specificBtn.className = `settings-pill focusable ${isSpecActive ? 'active' : ''}`;
                specificBtn.id = `btn-storage-usb-${index}`;
                specificBtn.tabIndex = 0;
                specificBtn.innerHTML = `<span>🔌</span><span>${usb.displayName || usb.label}</span>`;
                specificBtn.addEventListener('click', function() {
                    if (window.TVFilesystem) {
                        window.TVFilesystem.setPreferredStorage(usb.label, function(allStorages, selected) {
                            renderStorageSettingsOptions();
                            updateSettingsFolderInfo();
                            if (window.FileReceiver && window.FileReceiver.showToast) {
                                window.FileReceiver.showToast(`Receive Storage set to: ${usb.displayName || usb.label}`);
                            }
                            if (window.App && window.App.updateTargetUsbBadge) {
                                window.App.updateTargetUsbBadge(selected);
                            }
                        });
                    }
                });
                container.appendChild(specificBtn);
            });
        }

        // 3. Companion Server (Zero TV Memory)
        const serverBtn = document.createElement('button');
        const isServerActive = currentPref === 'server';
        serverBtn.className = `settings-pill focusable ${isServerActive ? 'active' : ''}`;
        serverBtn.id = 'btn-storage-server';
        serverBtn.tabIndex = 0;
        serverBtn.innerHTML = `<span>🖥️</span><span>Server</span>`;
        serverBtn.addEventListener('click', function() {
            if (window.TVFilesystem) {
                window.TVFilesystem.setPreferredStorage('server', function(allStorages, selected) {
                    renderStorageSettingsOptions();
                    updateSettingsFolderInfo();
                    if (window.FileReceiver && window.FileReceiver.showToast) {
                        window.FileReceiver.showToast('Receive Storage set to: Server (Zero TV space used, instant streaming)');
                    }
                    if (window.App && window.App.updateTargetUsbBadge) {
                        window.App.updateTargetUsbBadge(selected);
                    }
                });
            }
        });
        container.appendChild(serverBtn);

        updateSettingsFolderInfo();
    }

    function updateSettingsFolderInfo() {
        const folderInfoEl = document.getElementById('settings-target-folder-info');
        if (!folderInfoEl) return;
        const currentPref = window.TVFilesystem ? window.TVFilesystem.getPreferredStorage() : 'usb';
        const sel = window.TVFilesystem ? window.TVFilesystem.getSelectedStorage() : null;

        if (currentPref === 'server' || (sel && sel.isServer)) {
            const hostIp = (window.getServerHostIP ? window.getServerHostIP() : '192.168.0.14');
            folderInfoEl.textContent = `Companion Server (${hostIp}) • /app/uploads/ (Zero TV Memory)`;
        } else if (sel && sel.isUsb) {
            folderInfoEl.textContent = `${sel.displayName || sel.label} • /TVFileHub/Received/`;
        } else {
            folderInfoEl.textContent = `Internal TV Storage • /TVFileHub/Received/`;
        }
    }

    /* Settings Dialog */
    function openSettingsDialog() {
        const dialog = document.getElementById('settings-dialog-backdrop');
        if (!dialog) return;
        updateSettingsButtonsUI();
        renderStorageSettingsOptions();
        dialog.classList.add('dialog-open');
        const firstBtn = dialog.querySelector('.focusable');
        if (firstBtn && window.Navigation) {
            window.Navigation.setFocus(firstBtn);
        }
    }

    function closeSettingsDialog() {
        const dialog = document.getElementById('settings-dialog-backdrop');
        if (dialog) dialog.classList.remove('dialog-open');
        if (window.Navigation) window.Navigation.focusInitialElement();
    }

    let lastFocusedBeforeHud = null;

    function fetchTorrentHudStats(targetName) {
        const query = targetName || currentHudTorrentTarget || torrentStats.name || '';
        const srvUrl = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
        fetch(`${srvUrl}/torrent_stats?file=${encodeURIComponent(query)}`)
            .then(res => res.json())
            .then(data => {
                if (!data) return;
                if (data.title && (!torrentStats.name || torrentStats.name === 'Stream')) {
                    torrentStats.name = cleanTorrentTitle(data.title);
                }
                if (data.stats) {
                    const st = data.stats;
                    if (st.speed) torrentStats.speed = st.speed;
                    if (st.downloaded) torrentStats.completedMB = st.downloaded;
                    if (st.total) torrentStats.totalMB = st.total;
                    if (st.peers !== undefined) torrentStats.peers = st.peers;
                    if (st.progress !== undefined) torrentStats.progress = st.progress;
                    if (st.timeRemaining) torrentStats.pieces = `${st.timeRemaining} left`;
                    if (st.status) torrentStats.status = st.status;
                }
                updateTorrentHudValues();
            })
            .catch(() => {});
    }

    let currentlyPlayingSeriesItem = null;
    let currentlyPlayingEpisode = null;
    let hudOpenedTimestamp = 0;

    function checkTorrentEpisodes(item) {
        if (!item || item.episodesChecked) return;
        item.episodesChecked = true;
        const srvUrl = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
        fetch(`${srvUrl}/torrent_files?file=${encodeURIComponent(item.name || item.cleanTitle)}`)
            .then(res => res.json())
            .then(data => {
                if (data && data.episodes && data.episodes.length > 1) {
                    item.episodes = data.episodes;
                    saveDownloads();
                    renderDownloadsList();
                }
            })
            .catch(() => {});
    }

    function openEpisodesDialog(item) {
        const dialog = document.getElementById('episodes-dialog-backdrop');
        const listEl = document.getElementById('episodes-list-container');
        const titleEl = document.getElementById('episodes-dialog-title');
        const subEl = document.getElementById('episodes-dialog-subtitle');
        if (!dialog || !listEl) return;

        if (titleEl) titleEl.textContent = `📑 ${item.cleanTitle || 'Series Episodes'}`;
        if (subEl) subEl.textContent = `Select an episode to stream or play (${(item.episodes && item.episodes.length) || 0} episodes available):`;

        const renderEpisodes = (episodes) => {
            listEl.innerHTML = '';
            if (!episodes || episodes.length === 0) {
                listEl.innerHTML = '<div style="color:var(--text-muted); padding:20px; text-align:center;">No multiple episodes found.</div>';
                return;
            }

            episodes.forEach((ep, idx) => {
                const epCard = document.createElement('div');
                epCard.className = 'transfer-card focusable';
                epCard.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 14px 18px;
                    background: rgba(255, 255, 255, 0.07);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                `;
                epCard.tabIndex = 0;
                const statusBadge = ep.isDownloaded 
                    ? '<span class="player-download-badge status-done">Downloaded 100%</span>'
                    : '<span class="player-download-badge">Live Stream</span>';

                epCard.innerHTML = `
                    <div style="display:flex; flex-direction:column; gap:4px; max-width:70%;">
                        <span style="font-weight:700; font-size:16px; color:#fff;">🎬 Episode ${idx + 1}: ${ep.name}</span>
                        <span style="font-size:13px; color:var(--text-muted);">Size: ${ep.sizeStr || window.TVFilesystem.formatBytes(ep.length)}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:12px;">
                        ${statusBadge}
                        <button class="action-btn-play" style="
                            background: linear-gradient(135deg, #7b2cbf 0%, #00f2fe 100%);
                            color: #fff;
                            border: none;
                            border-radius: 8px;
                            padding: 8px 16px;
                            font-size: 14px;
                            font-weight: 700;
                            pointer-events: none;
                        ">▶️ Play</button>
                    </div>
                `;

                epCard.addEventListener('click', function() {
                    dialog.classList.remove('dialog-open');
                    playSpecificEpisode(item, ep);
                });

                listEl.appendChild(epCard);
            });

            dialog.classList.add('dialog-open');
            if (window.Navigation) {
                const first = listEl.querySelector('.focusable');
                if (first) window.Navigation.setFocus(first);
            }
        };

        if (item.episodes && item.episodes.length > 0) {
            renderEpisodes(item.episodes);
        } else {
            listEl.innerHTML = '<div style="color:var(--text-muted); padding:20px; text-align:center;">Loading episodes from server...</div>';
            dialog.classList.add('dialog-open');
            const srvUrl = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
            fetch(`${srvUrl}/torrent_files?file=${encodeURIComponent(item.name || item.cleanTitle)}`)
                .then(res => res.json())
                .then(data => {
                    if (data && data.episodes && data.episodes.length > 0) {
                        item.episodes = data.episodes;
                        saveDownloads();
                        renderEpisodes(data.episodes);
                    } else {
                        renderEpisodes([]);
                    }
                })
                .catch(() => renderEpisodes([]));
        }
    }

    function playSpecificEpisode(item, ep) {
        isUserInitiatedPlay = true;
        pendingPlayTarget = ep.name;
        currentlyPlayingSeriesItem = item;
        currentlyPlayingEpisode = ep;
        window.FileReceiver.showToast(`Loading: ${ep.name}...`);

        if (ep.isDownloaded && ep.streamUrl) {
            isUserInitiatedPlay = false;
            pendingPlayTarget = null;
            window.Player.openMedia(ep.streamUrl, ep.name);
            return;
        }

        const srvUrl = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
        const streamBase = window.getTorrentStreamBaseUrl ? window.getTorrentStreamBaseUrl() : 'http://192.168.0.14:8889';

        fetch(`${srvUrl}/start_torrent?file=${encodeURIComponent(item.name)}&fileIdx=${ep.index}&episode=${encodeURIComponent(ep.name)}`)
            .then(res => res.json())
            .then(data => {
                const finalUrl = (data && data.streamUrl) ? data.streamUrl : `${streamBase}/${ep.index}`;
                isUserInitiatedPlay = false;
                pendingPlayTarget = null;
                window.Player.openMedia(finalUrl, ep.name);
            })
            .catch(err => {
                console.warn('[VideoPlayer] start_torrent episode error:', err);
                const fallbackUrl = `${streamBase}/${ep.index}`;
                isUserInitiatedPlay = false;
                pendingPlayTarget = null;
                window.Player.openMedia(fallbackUrl, ep.name);
            });
    }

    function openEpisodesDialogForCurrent() {
        const curTitle = window.Player.getCurrentTitle();
        let matchedItem = currentlyPlayingSeriesItem;
        if (!matchedItem && curTitle) {
            matchedItem = activeDownloads.find(d => {
                if (d.cleanTitle && curTitle.toLowerCase().includes(d.cleanTitle.toLowerCase())) return true;
                if (d.name && curTitle.toLowerCase().includes(d.name.toLowerCase())) return true;
                if (d.episodes && d.episodes.some(ep => ep.name.toLowerCase() === curTitle.toLowerCase())) return true;
                return false;
            });
        }
        if (matchedItem) {
            openEpisodesDialog(matchedItem);
        } else if (curTitle) {
            openEpisodesDialog({ cleanTitle: curTitle, name: curTitle });
        }
    }

    function hasMultipleEpisodes(title) {
        if (currentlyPlayingSeriesItem && currentlyPlayingSeriesItem.episodes && currentlyPlayingSeriesItem.episodes.length > 1) return true;
        if (!title) return false;
        const matched = activeDownloads.find(d => {
            if (d.cleanTitle && title.toLowerCase().includes(d.cleanTitle.toLowerCase())) return true;
            if (d.name && title.toLowerCase().includes(d.name.toLowerCase())) return true;
            if (d.episodes && d.episodes.some(ep => ep.name.toLowerCase() === title.toLowerCase())) return true;
            return false;
        });
        return Boolean(matched && matched.episodes && matched.episodes.length > 1);
    }

    /* BitTorrent / Stream Information HUD */
    function toggleTorrentInfoHud(forceShow, targetFilenameOrTitle) {
        const backdrop = document.getElementById('player-hud-backdrop') || document.getElementById('amnis-hud-backdrop');
        if (!backdrop) return;

        const isCurrentlyOpen = backdrop.classList.contains('dialog-open') || 
                                backdrop.classList.contains('hud-visible') || 
                                backdrop.style.display === 'flex';
        const shouldShow = (typeof forceShow === 'boolean') ? forceShow : !isCurrentlyOpen;

        if (shouldShow) {
            hudOpenedTimestamp = Date.now();
            lastFocusedBeforeHud = document.activeElement;
            currentHudTorrentTarget = targetFilenameOrTitle || torrentStats.name || '';
            if (targetFilenameOrTitle) {
                torrentStats.name = cleanTorrentTitle(targetFilenameOrTitle);
            }

            // If player is currently open, hide the "Play Stream" button inside HUD since video is ALREADY playing!
            const hudPlayBtn = document.getElementById('hud-play-btn');
            if (hudPlayBtn) {
                const isPlayerActive = window.Player && window.Player.isActive && window.Player.isActive();
                hudPlayBtn.style.display = isPlayerActive ? 'none' : 'inline-block';
            }

            updateTorrentHudValues();
            backdrop.style.display = 'flex';
            backdrop.style.zIndex = '2500';
            backdrop.classList.add('dialog-open', 'hud-visible');
            const overlay = document.getElementById('amnis-hud-overlay');
            if (overlay) overlay.classList.add('hud-visible');

            // Immediately poll server stats for this torrent
            fetchTorrentHudStats(currentHudTorrentTarget);
            clearInterval(hudRefreshInterval);
            hudRefreshInterval = setInterval(() => {
                fetchTorrentHudStats(currentHudTorrentTarget);
            }, 1000);

            // Delay focusing Close button slightly so the initial Enter key event does not trigger an immediate close!
            setTimeout(() => {
                const closeBtn = document.getElementById('hud-close-btn');
                if (closeBtn && window.Navigation) {
                    window.Navigation.setFocus(closeBtn);
                }
            }, 150);
        } else {
            clearInterval(hudRefreshInterval);
            hudRefreshInterval = null;
            currentHudTorrentTarget = null;
            backdrop.style.display = 'none';
            backdrop.classList.remove('dialog-open', 'hud-visible');
            const overlay = document.getElementById('amnis-hud-overlay');
            if (overlay) overlay.classList.remove('hud-visible');
            if (lastFocusedBeforeHud && document.body.contains(lastFocusedBeforeHud) && window.Navigation) {
                window.Navigation.setFocus(lastFocusedBeforeHud);
            } else if (window.Navigation) {
                window.Navigation.focusInitialElement();
            }
        }
    }

    function updateTorrentHudValues() {
        const nameEl = document.getElementById('hud-stream-name');
        const speedEl = document.getElementById('hud-speed');
        const progressEl = document.getElementById('hud-progress-bar');
        const progressPctEl = document.getElementById('hud-progress-pct');
        const compEl = document.getElementById('hud-completed');
        const peersEl = document.getElementById('hud-peers');
        const piecesEl = document.getElementById('hud-pieces');
        const statusEl = document.getElementById('hud-status');

        if (nameEl) nameEl.textContent = torrentStats.name;
        if (speedEl) speedEl.textContent = torrentStats.speed;
        if (progressPctEl) progressPctEl.textContent = `${torrentStats.progress}%`;
        if (progressEl) progressEl.style.width = `${torrentStats.progress}%`;
        if (compEl) compEl.textContent = `${torrentStats.completedMB} / ${torrentStats.totalMB} (${torrentStats.progress}%)`;
        if (peersEl) peersEl.textContent = `${torrentStats.peers} active peers`;
        if (piecesEl) piecesEl.textContent = torrentStats.pieces;
        if (statusEl) statusEl.textContent = torrentStats.status;
    }

    function setupDialogEvents() {
        const urlPlayBtn = document.getElementById('url-dialog-play-btn');
        const urlCancelBtn = document.getElementById('url-dialog-cancel-btn');
        const hudPlayBtn = document.getElementById('hud-play-btn');
        const hudCloseBtn = document.getElementById('hud-close-btn');
        const episodesCloseBtn = document.getElementById('episodes-close-btn');
        const subsCloseBtn = document.getElementById('subtitles-close-btn');
        const settingsCloseBtn = document.getElementById('settings-close-btn');

        const btnNight = document.getElementById('btn-theme-night');
        const btnDay = document.getElementById('btn-theme-day');
        const btnNorm = document.getElementById('btn-font-normal');
        const btnLarge = document.getElementById('btn-font-large');
        const btnXlarge = document.getElementById('btn-font-xlarge');

        if (btnNight) btnNight.addEventListener('click', () => applyTheme('night'));
        if (btnDay) btnDay.addEventListener('click', () => applyTheme('day'));

        if (btnNorm) btnNorm.addEventListener('click', () => applyFontSize('normal'));
        if (btnLarge) btnLarge.addEventListener('click', () => applyFontSize('large'));
        if (btnXlarge) btnXlarge.addEventListener('click', () => applyFontSize('xlarge'));

        const btnAutoOn = document.getElementById('btn-auto-torrent-on');
        const btnAutoOff = document.getElementById('btn-auto-torrent-off');
        if (btnAutoOn) btnAutoOn.addEventListener('click', () => setAutoTorrentDownload(true));
        if (btnAutoOff) btnAutoOff.addEventListener('click', () => setAutoTorrentDownload(false));

        if (urlPlayBtn) urlPlayBtn.addEventListener('click', playEnteredUrl);
        if (urlCancelBtn) urlCancelBtn.addEventListener('click', closeUrlDialog);
        if (hudPlayBtn) hudPlayBtn.addEventListener('click', function() {
            isUserInitiatedPlay = true;
            pendingPlayTarget = torrentStats.name;
            toggleTorrentInfoHud(false);
            let streamUrl = torrentStats.streamUrl;
            if (!streamUrl && activeDownloads.length > 0 && activeDownloads[0].streamUrl) {
                streamUrl = activeDownloads[0].streamUrl;
            }
            if (!streamUrl) {
                const streamBase = window.getTorrentStreamBaseUrl ? window.getTorrentStreamBaseUrl() : 'http://192.168.0.14:8889';
                streamUrl = `${streamBase}/`;
            }
            window.Player.openMedia(streamUrl, torrentStats.name);
        });
        if (hudCloseBtn) {
            hudCloseBtn.addEventListener('click', () => {
                if (Date.now() - hudOpenedTimestamp < 350) {
                    console.log('[VideoPlayer] Debounced rapid close on HUD');
                    return;
                }
                toggleTorrentInfoHud(false);
            });
        }
        if (episodesCloseBtn) {
            episodesCloseBtn.addEventListener('click', () => {
                const dialog = document.getElementById('episodes-dialog-backdrop');
                if (dialog) dialog.classList.remove('dialog-open');
                if (window.Navigation) window.Navigation.focusInitialElement();
            });
        }
        if (subsCloseBtn) subsCloseBtn.addEventListener('click', closeSubtitleSearchModal);
        if (settingsCloseBtn) settingsCloseBtn.addEventListener('click', closeSettingsDialog);

        const storageCloseBtn = document.getElementById('storage-dialog-close-btn');
        if (storageCloseBtn) storageCloseBtn.addEventListener('click', closeStorageDialog);

        const storageFmBtn = document.getElementById('storage-dialog-filemanager-btn');
        if (storageFmBtn) {
            storageFmBtn.addEventListener('click', function() {
                closeStorageDialog();
                if (window.App) window.App.switchView('filemanager');
            });
        }

        // Preset stream buttons in URL modal
        const presetButtons = document.querySelectorAll('.preset-stream-btn');
        presetButtons.forEach((btn, idx) => {
            btn.addEventListener('click', () => playPreset(idx));
        });
    }

    return {
        init: init,
        openStorageDialog: openStorageDialog,
        openUrlDialog: openUrlDialog,
        openSubtitleSearchModal: openSubtitleSearchModal,
        openSettingsDialog: openSettingsDialog,
        toggleTorrentInfoHud: toggleTorrentInfoHud,
        startTorrentStream: startTorrentStream,
        onTorrentStreamStarted: onTorrentStreamStarted,
        onTorrentStatsUpdate: onTorrentStatsUpdate,
        registerTorrentDownload: registerTorrentDownload,
        renderDownloadsList: renderDownloadsList,
        refreshRPiDownloads: fetchRPiDownloads,
        getAvailableMovies: function() { return rpiAvailableMovies; },
        renderStorageSettingsOptions: renderStorageSettingsOptions,
        isAutoTorrentDownloadEnabled: isAutoTorrentDownloadEnabled,
        setAutoTorrentDownload: setAutoTorrentDownload,
        cleanTorrentTitle: cleanTorrentTitle,
        playPreset: playPreset,
        openEpisodesDialog: openEpisodesDialog,
        openEpisodesDialogForCurrent: openEpisodesDialogForCurrent,
        hasMultipleEpisodes: hasMultipleEpisodes
    };
})();

// Compatibility alias for any internal callbacks
window.Amnis = window.VideoPlayer;
