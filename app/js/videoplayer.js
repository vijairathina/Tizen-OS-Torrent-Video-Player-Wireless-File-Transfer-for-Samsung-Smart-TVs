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

        // Also import any torrent files from receiver history if not already present
        try {
            const rxRaw = localStorage.getItem('tvfilehub_received_history_v2');
            if (rxRaw) {
                const rxHistory = JSON.parse(rxRaw);
                if (Array.isArray(rxHistory)) {
                    rxHistory.forEach(item => {
                        if (item.name && item.name.toLowerCase().endsWith('.torrent')) {
                            if (!activeDownloads.some(d => d.name === item.name)) {
                                activeDownloads.push({
                                    id: item.id || `tor-${Math.random().toString(36).substr(2, 6)}`,
                                    name: item.name,
                                    cleanTitle: cleanTorrentTitle(item.name),
                                    totalBytes: item.size || 0,
                                    streamUrl: item.streamUrl || '',
                                    progress: 0,
                                    speed: 'Ready',
                                    peers: 0,
                                    completedMB: '0 MB',
                                    totalMB: window.TVFilesystem.formatBytes(item.size || 0),
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
        if (!existing) {
            existing = {
                id: `tor-${Date.now().toString(36)}`,
                name: rawName,
                cleanTitle: clean,
                totalBytes: totalBytes || 0,
                streamUrl: streamUrl || '',
                progress: 1,
                speed: 'Connecting...',
                peers: 0,
                completedMB: '0 MB',
                totalMB: totalBytes ? window.TVFilesystem.formatBytes(totalBytes) : '1.73 GB',
                status: 'Connecting to swarm...'
            };
            activeDownloads.unshift(existing);
        } else {
            if (streamUrl) existing.streamUrl = streamUrl;
            if (totalBytes) existing.totalBytes = totalBytes;
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
            card.className = 'player-download-card amnis-download-card focusable';
            card.id = `player-card-${item.id}`;
            card.tabIndex = 0;

            const progress = item.progress || 0;
            const speed = item.speed || 'Connecting...';
            const peers = item.peers || 0;
            const status = item.status || (progress >= 100 ? 'Downloaded 100%' : 'Ready to Stream');
            const isDone = progress >= 100 || /downloaded 100%/i.test(status);

            const totalMBStr = item.totalBytes ? window.TVFilesystem.formatBytes(item.totalBytes) : (item.totalMB || '1.73 GB');
            const completedMBStr = item.completedMB || `${progress}%`;

            card.innerHTML = `
                <div class="player-download-top amnis-download-top">
                    <span class="player-download-title amnis-download-title" title="${item.cleanTitle}">🎬 ${item.cleanTitle}</span>
                    <span class="player-download-badge amnis-download-badge ${isDone ? 'status-done' : ''}" id="player-badge-${item.id}">${status}</span>
                </div>
                <div class="progress-track" style="height: 12px; margin: 4px 0;">
                    <div class="progress-fill" id="player-bar-${item.id}" style="width: ${Math.max(progress, 2)}%; background: linear-gradient(90deg, #10b981 0%, #00f2fe 100%);"></div>
                </div>
                <div class="player-download-meta amnis-download-meta">
                    <span id="player-meta-${item.id}">Completed: <strong>${completedMBStr}</strong> / ${totalMBStr} • Speed: <strong style="color:var(--primary-cyan);">${speed}</strong> • <strong>${peers}</strong> peers</span>
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
                        <button class="action-btn-info focusable" id="player-info-${item.id}" tabindex="0" title="Torrent Details">ℹ️ Torrent Info</button>
                        <button class="action-btn-delete focusable" id="player-del-${item.id}" tabindex="0" title="Delete Torrent">🗑️ Delete</button>
                    </div>
                </div>
            `;

            const playBtn = card.querySelector(`#player-play-${item.id}`);
            const infoBtn = card.querySelector(`#player-info-${item.id}`);
            const delBtn = card.querySelector(`#player-del-${item.id}`);

            const playAction = () => {
                isUserInitiatedPlay = true;
                window.FileReceiver.showToast(`Loading: ${item.cleanTitle}...`);

                // If already has direct port 8080 streaming link, play immediately
                if (item.streamUrl && item.streamUrl.includes(':8080')) {
                    console.log('[VideoPlayer] Opening direct video URL:', item.streamUrl);
                    window.Player.openMedia(item.streamUrl, item.cleanTitle);
                    return;
                }

                // Query server for stream URL (starts stream or gives direct completed file link)
                fetch(`http://192.168.0.13:8080/start_torrent?file=${encodeURIComponent(item.name)}`)
                    .then(res => res.json())
                    .then(data => {
                        const finalUrl = (data && data.streamUrl) ? data.streamUrl : (item.streamUrl || `http://192.168.0.13:8080/files/${encodeURIComponent(item.name)}`);
                        item.streamUrl = finalUrl;
                        saveDownloads();
                        console.log('[VideoPlayer] Playing stream from server:', finalUrl);
                        window.Player.openMedia(finalUrl, item.cleanTitle);
                    })
                    .catch(err => {
                        console.warn('[VideoPlayer] start_torrent error, attempting fallback URL:', err);
                        const fallback = item.streamUrl || `http://192.168.0.13:8080/files/${encodeURIComponent(item.name)}`;
                        window.Player.openMedia(fallback, item.cleanTitle);
                    });
            };

            if (playBtn) playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                playAction();
            });
            if (infoBtn) infoBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                torrentStats.name = item.cleanTitle;
                if (item.speed) torrentStats.speed = item.speed;
                if (item.progress !== undefined) torrentStats.progress = item.progress;
                if (item.completedMB) torrentStats.completedMB = item.completedMB;
                if (item.totalMB) torrentStats.totalMB = item.totalMB;
                if (item.peers !== undefined) torrentStats.peers = item.peers;
                if (item.status) torrentStats.status = item.status;
                if (item.streamUrl) torrentStats.streamUrl = item.streamUrl;
                toggleTorrentInfoHud(true);
            });
            if (delBtn) delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteDownload(item);
            });
            card.addEventListener('click', playAction);

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
                    if (data.streamUrl && activeDownloads.length > 0) {
                        activeDownloads.forEach(dl => {
                            if (!dl.streamUrl || dl.streamUrl.includes(':8889')) {
                                dl.streamUrl = data.streamUrl;
                            }
                        });
                        saveDownloads();
                    }
                    if (data.stats) {
                        onTorrentStatsUpdate(data.stats);
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
        let cleanName = cleanTorrentTitle(rawName);

        torrentStats = {
            name: cleanName,
            progress: 1,
            speed: 'Connecting...',
            completedMB: '0 MB',
            totalMB: totalBytes ? window.TVFilesystem.formatBytes(totalBytes) : '1.73 GB',
            peers: 0,
            pieces: 'Sequential buffering...',
            status: 'Connecting to BitTorrent swarm...'
        };

        const isDirectVideo = streamUrl && !streamUrl.toLowerCase().endsWith('.torrent') && !streamUrl.startsWith('magnet:');

        if (isDirectVideo) {
            console.log('[VideoPlayer] Playing direct stream:', streamUrl);
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
                const finalUrl = (data && data.streamUrl) ? data.streamUrl : `http://192.168.0.13:8080/files/${encodeURIComponent(rawName)}`;
                onTorrentStreamStarted(finalUrl, cleanName);
            })
            .catch(err => {
                console.warn('[VideoPlayer] start_torrent HTTP fetch error, using fallback stream URL:', err);
                onTorrentStreamStarted(`http://192.168.0.13:8080/files/${encodeURIComponent(rawName)}`, cleanName);
            });
    }

    function onTorrentStreamStarted(streamUrl, title) {
        console.log('[VideoPlayer] BitTorrent sequential stream active:', streamUrl);
        const name = title || torrentStats.name;

        torrentStats.status = 'Sequential Downloading & Streaming Active';
        updateTorrentHudValues();

        // Update active downloads card
        const dl = activeDownloads.find(d => d.cleanTitle === name || d.name === name) || activeDownloads[0];
        if (dl) {
            dl.streamUrl = streamUrl;
            dl.status = 'Streaming Active';
            const badge = document.getElementById(`player-badge-${dl.id}`) || document.getElementById(`amnis-badge-${dl.id}`);
            if (badge) badge.textContent = 'Streaming Active';
            saveDownloads();
        }

        // Feed live HTTP torrent stream directly into Samsung AVPlay hardware player ONLY if user initiated
        if (isUserInitiatedPlay) {
            isUserInitiatedPlay = false;
            window.FileReceiver.showToast(`Swarm Connected! Streaming ${name}...`);
            window.Player.openMedia(streamUrl, name);
        }
    }

    function onTorrentStatsUpdate(stats) {
        if (!stats) return;

        if (stats.speed) torrentStats.speed = stats.speed;
        if (stats.downloaded) torrentStats.completedMB = stats.downloaded;
        if (stats.total) torrentStats.totalMB = stats.total;
        if (stats.peers !== undefined) torrentStats.peers = stats.peers;
        if (stats.timeRemaining) torrentStats.pieces = `${stats.timeRemaining} left`;
        if (stats.status) torrentStats.status = stats.status;
        if (stats.progress !== undefined) {
            torrentStats.progress = Math.min(100, Math.max(1, stats.progress));
        }

        try {
            const dlNum = parseFloat(stats.downloaded);
            const totNum = parseFloat(stats.total);
            if (!isNaN(dlNum) && !isNaN(totNum) && totNum > 0) {
                let dlMB = dlNum;
                if (/GB/i.test(stats.downloaded)) dlMB = dlNum * 1024;
                else if (/KB/i.test(stats.downloaded)) dlMB = dlNum / 1024;

                let totMB = totNum;
                if (/GB/i.test(stats.total)) totMB = totNum * 1024;

                torrentStats.progress = Math.min(100, Math.max(1, Math.floor((dlMB / totMB) * 100)));
            }
        } catch (e) {}

        updateTorrentHudValues();

        // Live update active downloads cards in UI
        if (activeDownloads.length > 0) {
            const dl = activeDownloads[0];
            dl.speed = torrentStats.speed;
            dl.peers = torrentStats.peers;
            dl.progress = torrentStats.progress;
            dl.completedMB = torrentStats.completedMB;
            dl.totalMB = torrentStats.totalMB;
            dl.status = torrentStats.status;

            const bar = document.getElementById(`player-bar-${dl.id}`) || document.getElementById(`amnis-bar-${dl.id}`);
            const meta = document.getElementById(`player-meta-${dl.id}`) || document.getElementById(`amnis-meta-${dl.id}`);
            const badge = document.getElementById(`player-badge-${dl.id}`) || document.getElementById(`amnis-badge-${dl.id}`);

            if (bar) bar.style.width = `${torrentStats.progress}%`;
            if (meta) meta.innerHTML = `Completed: <strong>${torrentStats.completedMB}</strong> / ${torrentStats.totalMB} • Speed: <strong style="color:var(--primary-cyan);">${torrentStats.speed}</strong> • <strong>${torrentStats.peers}</strong> peers`;
            if (badge) {
                const isDone = torrentStats.progress >= 100 || /downloaded 100%/i.test(torrentStats.status);
                badge.textContent = torrentStats.status;
                if (isDone) {
                    badge.classList.add('status-done');
                } else {
                    badge.classList.remove('status-done');
                }
            }
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
            { id: 1, title: 'English [OpenSubtitles.org]', lang: 'ENG', url: 'sample.srt' },
            { id: 2, title: 'Tamil [Subscene]', lang: 'TAM', url: 'sample.srt' },
            { id: 3, title: 'English Hearing Impaired [BSPlayer]', lang: 'ENG', url: 'sample.srt' },
            { id: 4, title: 'Hindi [SubDB]', lang: 'HIN', url: 'sample.srt' }
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

    /* BitTorrent / Stream Information HUD */
    function toggleTorrentInfoHud(forceShow) {
        const backdrop = document.getElementById('player-hud-backdrop') || document.getElementById('amnis-hud-backdrop');
        if (!backdrop) return;

        const isCurrentlyOpen = backdrop.classList.contains('dialog-open') || 
                                backdrop.classList.contains('hud-visible') || 
                                backdrop.style.display === 'flex';
        const shouldShow = (typeof forceShow === 'boolean') ? forceShow : !isCurrentlyOpen;

        if (shouldShow) {
            lastFocusedBeforeHud = document.activeElement;
            updateTorrentHudValues();
            backdrop.style.display = 'flex';
            backdrop.style.zIndex = '2500';
            backdrop.classList.add('dialog-open', 'hud-visible');
            const overlay = document.getElementById('amnis-hud-overlay');
            if (overlay) overlay.classList.add('hud-visible');

            // Default focus strictly to Close button so user can immediately dismiss using remote OK/Enter
            const closeBtn = document.getElementById('hud-close-btn');
            if (closeBtn && window.Navigation) {
                window.Navigation.setFocus(closeBtn);
                setTimeout(() => {
                    window.Navigation.setFocus(closeBtn);
                }, 60);
            }
        } else {
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

        if (urlPlayBtn) urlPlayBtn.addEventListener('click', playEnteredUrl);
        if (urlCancelBtn) urlCancelBtn.addEventListener('click', closeUrlDialog);
        if (hudPlayBtn) hudPlayBtn.addEventListener('click', function() {
            isUserInitiatedPlay = true;
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
        if (hudCloseBtn) hudCloseBtn.addEventListener('click', () => toggleTorrentInfoHud(false));
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
        playPreset: playPreset
    };
})();

// Compatibility alias for any internal callbacks
window.Amnis = window.VideoPlayer;
