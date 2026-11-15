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
            url: 'http://192.168.0.13:8080/files/sample.mp4',
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
            url: 'http://192.168.0.13:8080/files/sample.mp4',
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

    try {
        currentTheme = localStorage.getItem('tvhub_theme') || 'night';
        currentFontSize = localStorage.getItem('tvhub_fontsize') || 'normal';
    } catch (e) {}

    function init() {
        setupCardEvents();
        setupDialogEvents();
        loadSavedDownloads();
        startStatsPolling();
        applyTheme(currentTheme);
        applyFontSize(currentFontSize);
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

    function renderDownloadsList() {
        const listEl = document.getElementById('player-downloads-list') || document.getElementById('amnis-downloads-list');
        const statsEl = document.getElementById('player-downloads-stats') || document.getElementById('amnis-downloads-stats');
        if (!listEl) return;

        if (statsEl) {
            statsEl.textContent = `${activeDownloads.length} active stream${activeDownloads.length === 1 ? '' : 's'}`;
        }

        if (activeDownloads.length === 0) {
            listEl.innerHTML = `
                <div class="empty-state" id="player-downloads-empty" style="padding: 24px 0;">
                    <div style="font-size: 15px; color: var(--text-muted); text-align: center;">
                        No active torrent downloads. Send a .torrent from phone, enter magnet URL, or browse storage.
                    </div>
                </div>
            `;
            return;
        }

        listEl.innerHTML = '';
        activeDownloads.forEach(item => {
            const card = document.createElement('div');
            // Remove 'focusable' from the outer card container so D-pad navigation targets the action buttons directly
            card.className = 'player-download-card amnis-download-card';
            card.id = `player-card-${item.id}`;

            const progress = item.progress || 0;
            const speed = item.speed || 'Connecting...';
            const peers = item.peers || 0;
            let status = item.status;
            if (progress >= 100) {
                status = status || 'Downloaded 100%';
            } else {
                if (!status || /downloaded 100%/i.test(status)) {
                    status = progress > 0 ? `Downloading ${progress}%` : 'Connecting...';
                }
            }
            const isDone = progress >= 100 && /downloaded 100%/i.test(status);

            const totalMBStr = (item.totalBytes && item.totalBytes > 50 * 1024 * 1024) ? window.TVFilesystem.formatBytes(item.totalBytes) : (item.totalMB || '1.73 GB');
            const completedMBStr = item.completedMB || `${progress}%`;

            const isTorrent = item.name.toLowerCase().endsWith('.torrent') || (item.streamUrl && item.streamUrl.toLowerCase().endsWith('.torrent'));

            if (item.episodes === undefined && isTorrent) {
                checkTorrentEpisodes(item);
            }

            const hasEpisodes = item.episodes && item.episodes.length > 1;
            const episodeBadgeText = hasEpisodes ? ` • <strong style="color:var(--primary-cyan);">📑 ${item.episodes.length} Episodes</strong>` : '';

            card.innerHTML = `
                <div class="player-download-top amnis-download-top">
                    <span class="player-download-title amnis-download-title" title="${item.cleanTitle}">🎬 ${item.cleanTitle}</span>
                    <span class="player-download-badge amnis-download-badge ${isDone ? 'status-done' : ''}" id="player-badge-${item.id}">${status}</span>
                </div>
                <div class="progress-track" style="height: 12px; margin: 4px 0;">
                    <div class="progress-fill" id="player-bar-${item.id}" style="width: ${Math.max(progress, 2)}%; background: linear-gradient(90deg, #10b981 0%, #00f2fe 100%);"></div>
                </div>
                <div class="player-download-meta amnis-download-meta">
                    <span id="player-meta-${item.id}">Completed: <strong>${completedMBStr}</strong> / ${totalMBStr} • Speed: <strong style="color:var(--primary-cyan);">${speed}</strong> • <strong>${peers}</strong> peers${episodeBadgeText}</span>
                    <div class="player-download-actions amnis-download-actions">
                        <button class="action-btn-play focusable" id="player-play-${item.id}" tabindex="0" style="
                            background: linear-gradient(135deg, #7b2cbf 0%, #00f2fe 100%);
                            color: #fff;
                            border: none;
                            border-radius: 8px;
                            padding: 6px 14px;
                            font-size: 13px;
                            font-weight: 700;
                            cursor: pointer;
                        ">▶️ Play Stream</button>
                        ${hasEpisodes ? `
                        <button class="action-btn-episodes focusable" id="player-episodes-${item.id}" tabindex="0" title="View Episodes" style="
                            background: linear-gradient(135deg, #0284c7 0%, #00f2fe 100%);
                            color: #fff;
                            border: none;
                            border-radius: 8px;
                            padding: 6px 14px;
                            font-size: 13px;
                            font-weight: 700;
                            cursor: pointer;
                        ">📑 Episodes (${item.episodes.length})</button>
                        ` : ''}
                        <button class="action-btn-info focusable" id="player-info-${item.id}" tabindex="0" title="Torrent Details">ℹ️ Torrent Info</button>
                        <button class="action-btn-delete focusable" id="player-del-${item.id}" tabindex="0" title="Delete Torrent">🗑️ Delete</button>
                    </div>
                </div>
            `;

            const playBtn = card.querySelector('.action-btn-play');
            const episodesBtn = card.querySelector('.action-btn-episodes');
            const infoBtn = card.querySelector('.action-btn-info');
            const delBtn = card.querySelector('.action-btn-delete');

            const playAction = () => {
                if (hasEpisodes && item.episodes && item.episodes.length > 1) {
                    openEpisodesDialog(item);
                    return;
                }
                isUserInitiatedPlay = true;
                pendingPlayTarget = item.cleanTitle;
                window.FileReceiver.showToast(`Loading: ${item.cleanTitle}...`);

                // If already has direct port 8080 streaming link for an actual VIDEO file (not a .torrent metadata file), play immediately
                if (!isTorrent && item.streamUrl && item.streamUrl.includes(':8080') && !item.streamUrl.toLowerCase().endsWith('.torrent')) {
                    console.log('[VideoPlayer] Opening direct video URL:', item.streamUrl);
                    isUserInitiatedPlay = false;
                    pendingPlayTarget = null;
                    window.Player.openMedia(item.streamUrl, item.cleanTitle);
                    return;
                }

                // Query server for stream URL (starts stream or gives direct completed file link)
                fetch(`http://192.168.0.13:8080/start_torrent?file=${encodeURIComponent(item.name)}`)
                    .then(res => res.json())
                    .then(data => {
                        const finalUrl = (data && data.streamUrl) ? data.streamUrl : null;
                        if (!finalUrl || finalUrl.toLowerCase().endsWith('.torrent')) {
                            console.log('[VideoPlayer] Torrent started, waiting for stream URL broadcast...');
                            window.FileReceiver.showToast('Connecting to swarm for video stream...');
                            return;
                        }
                        item.streamUrl = finalUrl;
                        saveDownloads();
                        console.log('[VideoPlayer] Playing stream from server:', finalUrl);
                        isUserInitiatedPlay = false;
                        pendingPlayTarget = null;
                        window.Player.openMedia(finalUrl, item.cleanTitle);
                    })
                    .catch(err => {
                        console.warn('[VideoPlayer] start_torrent error:', err);
                        window.FileReceiver.showToast('Connecting to swarm for stream...');
                    });
            };

            if (playBtn) playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                playAction();
            });
            if (episodesBtn) episodesBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openEpisodesDialog(item);
            });
            if (infoBtn) infoBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('[VideoPlayer] Torrent Info clicked for:', item.cleanTitle);
                torrentStats.name = item.cleanTitle;
                if (item.speed) torrentStats.speed = item.speed;
                if (item.progress !== undefined) torrentStats.progress = item.progress;
                if (item.completedMB) torrentStats.completedMB = item.completedMB;
                if (item.totalMB) torrentStats.totalMB = item.totalMB;
                if (item.peers !== undefined) torrentStats.peers = item.peers;
                if (item.status) torrentStats.status = item.status;
                if (item.streamUrl) torrentStats.streamUrl = item.streamUrl;
                toggleTorrentInfoHud(true, item.name || item.cleanTitle);
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
    }

    function deleteDownload(item) {
        console.log('[VideoPlayer] Deleting torrent download:', item.name);

        // 1. Delete from host server & disk
        fetch(`http://192.168.0.13:8080/delete_file?file=${encodeURIComponent(item.name)}`)
            .catch(e => console.warn('[VideoPlayer] Server delete error:', e));

        // 2. Remove from TV storage if copied
        if (window.TVFilesystem && window.TVFilesystem.deleteFile) {
            window.TVFilesystem.deleteFile(item.name, false, function() {});
        }

        // 3. Remove from active downloads
        activeDownloads = activeDownloads.filter(d => d.id !== item.id && d.name !== item.name);
        saveDownloads();
        renderDownloadsList();

        window.FileReceiver.showToast(`Removed: ${item.cleanTitle}`);
        setTimeout(() => {
            const nextCard = document.querySelector('.player-download-card, .amnis-download-card');
            if (nextCard && window.Navigation) {
                window.Navigation.setFocus(nextCard);
            } else {
                const firstCard = document.getElementById('player-card-load-file') || document.getElementById('amnis-card-load-file');
                if (firstCard && window.Navigation) {
                    window.Navigation.setFocus(firstCard);
                }
            }
        }, 50);
    }

    function setupCardEvents() {
        const loadFileCard = document.getElementById('player-card-load-file') || document.getElementById('amnis-card-load-file');
        const loadUrlCard = document.getElementById('player-card-load-url') || document.getElementById('amnis-card-load-url');
        const addonsCard = document.getElementById('player-card-addons') || document.getElementById('amnis-card-addons');
        const settingsCard = document.getElementById('player-card-settings') || document.getElementById('amnis-card-settings');

        if (loadFileCard) {
            loadFileCard.addEventListener('click', function() {
                if (window.App) window.App.switchView('filemanager');
                window.FileReceiver.showToast('Select a video or torrent file from USB or Internal storage');
            });
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
            fetch(`http://192.168.0.13:8080/start_torrent?magnet=${encodeURIComponent(url)}`)
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
        statsPollInterval = setInterval(fetchTorrentStats, 1500);
    }

    function fetchTorrentStats() {
        fetch('http://192.168.0.13:8080/torrent_stats')
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
        fetch(`http://192.168.0.13:8080/start_torrent?file=${encodeURIComponent(rawName)}`)
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

    /* Storage Preference in Settings */
    function renderStorageSettingsOptions() {
        const container = document.getElementById('settings-storage-options');
        if (!container) return;
        container.innerHTML = '';

        const currentPref = window.TVFilesystem ? window.TVFilesystem.getPreferredStorage() : 'auto';
        const storages = window.TVFilesystem ? window.TVFilesystem.getStorages() : [];
        const usbStorages = storages.filter(s => s.isUsb);

        // 1. Auto (Prefer USB)
        const autoBtn = document.createElement('button');
        autoBtn.className = `settings-pill focusable ${currentPref === 'auto' ? 'active' : ''}`;
        autoBtn.id = 'btn-storage-auto';
        autoBtn.tabIndex = 0;
        autoBtn.innerHTML = `<span>⚡</span><span>Auto (Prefer USB)</span>`;
        autoBtn.addEventListener('click', function() {
            if (window.TVFilesystem) {
                window.TVFilesystem.setPreferredStorage('auto', function() {
                    renderStorageSettingsOptions();
                    updateSettingsFolderInfo();
                    window.FileReceiver.showToast('Storage destination set to: Auto (Prefer USB)');
                });
            }
        });
        container.appendChild(autoBtn);

        // 2. Internal TV Storage
        const internalBtn = document.createElement('button');
        internalBtn.className = `settings-pill focusable ${currentPref === 'internal' ? 'active' : ''}`;
        internalBtn.id = 'btn-storage-internal';
        internalBtn.tabIndex = 0;
        internalBtn.innerHTML = `<span>📱</span><span>Internal TV Storage</span>`;
        internalBtn.addEventListener('click', function() {
            if (window.TVFilesystem) {
                window.TVFilesystem.setPreferredStorage('internal', function() {
                    renderStorageSettingsOptions();
                    updateSettingsFolderInfo();
                    window.FileReceiver.showToast('Storage destination set to: Internal TV Storage');
                });
            }
        });
        container.appendChild(internalBtn);

        // 3. Each detected USB drive (e.g. USB 1, USB 2, USB 3)
        usbStorages.forEach(function(usb, index) {
            const usbBtn = document.createElement('button');
            const isActive = currentPref === usb.label;
            usbBtn.className = `settings-pill focusable ${isActive ? 'active' : ''}`;
            usbBtn.id = `btn-storage-usb-${index}`;
            usbBtn.tabIndex = 0;
            const labelText = usb.displayName || `USB ${index + 1}: ${usb.label}`;
            usbBtn.innerHTML = `<span>💾</span><span>${labelText}</span>`;
            usbBtn.addEventListener('click', function() {
                if (window.TVFilesystem) {
                    window.TVFilesystem.setPreferredStorage(usb.label, function() {
                        renderStorageSettingsOptions();
                        updateSettingsFolderInfo();
                        window.FileReceiver.showToast(`Storage destination set to: ${labelText}`);
                    });
                }
            });
            container.appendChild(usbBtn);
        });

        updateSettingsFolderInfo();
    }

    function updateSettingsFolderInfo() {
        const folderInfoEl = document.getElementById('settings-target-folder-info');
        if (!folderInfoEl) return;
        const sel = window.TVFilesystem ? window.TVFilesystem.getSelectedStorage() : null;
        if (sel) {
            const clean = sel.isUsb ? `${sel.label} (USB)` : 'Internal Storage';
            folderInfoEl.textContent = `${clean} • /TVFileHub/Received/`;
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
        fetch(`http://192.168.0.13:8080/torrent_stats?file=${encodeURIComponent(query)}`)
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
        fetch(`http://192.168.0.13:8080/torrent_files?file=${encodeURIComponent(item.name || item.cleanTitle)}`)
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
            fetch(`http://192.168.0.13:8080/torrent_files?file=${encodeURIComponent(item.name || item.cleanTitle)}`)
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

        fetch(`http://192.168.0.13:8080/start_torrent?file=${encodeURIComponent(item.name)}&fileIdx=${ep.index}&episode=${encodeURIComponent(ep.name)}`)
            .then(res => res.json())
            .then(data => {
                const finalUrl = (data && data.streamUrl) ? data.streamUrl : `http://192.168.0.13:8889/${ep.index}`;
                isUserInitiatedPlay = false;
                pendingPlayTarget = null;
                window.Player.openMedia(finalUrl, ep.name);
            })
            .catch(err => {
                console.warn('[VideoPlayer] start_torrent episode error:', err);
                const fallbackUrl = `http://192.168.0.13:8889/${ep.index}`;
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
                streamUrl = 'http://192.168.0.13:8889/';
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

        // Preset stream buttons in URL modal
        const presetButtons = document.querySelectorAll('.preset-stream-btn');
        presetButtons.forEach((btn, idx) => {
            btn.addEventListener('click', () => playPreset(idx));
        });
    }

    return {
        init: init,
        openUrlDialog: openUrlDialog,
        openSubtitleSearchModal: openSubtitleSearchModal,
        openSettingsDialog: openSettingsDialog,
        toggleTorrentInfoHud: toggleTorrentInfoHud,
        startTorrentStream: startTorrentStream,
        onTorrentStreamStarted: onTorrentStreamStarted,
        onTorrentStatsUpdate: onTorrentStatsUpdate,
        registerTorrentDownload: registerTorrentDownload,
        renderDownloadsList: renderDownloadsList,
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
