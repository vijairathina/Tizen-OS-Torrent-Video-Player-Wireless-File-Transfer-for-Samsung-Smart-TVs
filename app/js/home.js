/**
 * Home Launcher & Dashboard for Samsung Tizen TV
 * Optimized for low-latency D-pad navigation and 4K Crystal UHD.
 * Features:
 * - Dynamic Hero Spotlight: shows Last Played movie (with Continue Watch & Play from Start)
 *   or Last Downloaded movie on fresh installs.
 * - Continue Watching & Recent Media Carousel (directly below hero)
 * - Quick Launch Tiles (moved down below media)
 * - Storage Health & Companion Bridge Network Gauges
 */

window.HomeLauncher = (function() {
    'use strict';

    let currentSpotlightItem = null;
    let cachedHistory = [];
    let isFetching = false;

    function init() {
        console.log('[HomeLauncher] Initializing TV Home Dashboard...');
        setupEventListeners();
        refresh();
    }

    function setupEventListeners() {
        // Quick Launch Tile Clicks
        const tilePlayer = document.getElementById('home-tile-player');
        const tileReceiver = document.getElementById('home-tile-receiver');
        const tileFileManager = document.getElementById('home-tile-filemanager');

        if (tilePlayer) {
            tilePlayer.addEventListener('click', () => {
                if (window.App) window.App.switchView('player', true);
            });
        }
        if (tileReceiver) {
            tileReceiver.addEventListener('click', () => {
                if (window.App) window.App.switchView('receiver', true);
            });
        }
        if (tileFileManager) {
            tileFileManager.addEventListener('click', () => {
                if (window.App) window.App.switchView('filemanager', true);
            });
        }

        // Hero Action Buttons
        const heroPlayBtn = document.getElementById('hero-btn-play');
        const heroSecondaryBtn = document.getElementById('hero-btn-secondary');

        if (heroPlayBtn) {
            heroPlayBtn.addEventListener('click', () => {
                if (currentSpotlightItem) {
                    launchSpotlightMedia(false);
                } else if (window.App) {
                    window.App.switchView('player', true);
                }
            });
        }
        if (heroSecondaryBtn) {
            heroSecondaryBtn.addEventListener('click', () => {
                if (currentSpotlightItem && currentSpotlightItem.resumeSec > 8) {
                    launchSpotlightMedia(true); // Restart from beginning
                } else if (window.App) {
                    window.App.switchView('player', true);
                }
            });
        }
    }

    function refresh() {
        loadHistoryData();
        renderStorageHealth();
        renderSystemStatus();
    }

    function getResumePoints() {
        try {
            const raw = localStorage.getItem('tvhub_resume_points');
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    }

    function getLastPlayedRecord() {
        try {
            const raw = localStorage.getItem('tvhub_last_played');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function formatTime(seconds) {
        if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function cleanTitle(filename) {
        if (!filename) return 'Live Media Stream';
        let name = filename.replace(/^www\.[a-zA-Z0-9.\-_]+\s*-\s*/i, '');
        name = name.replace(/\.(mkv|mp4|avi|mov|webm|torrent|ts)$/i, '');
        name = name.replace(/-\s*\(.*?AAC.*?\)/gi, '');
        name = name.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, (match) => {
            return /^\(\d{4}\)$/.test(match) ? match : '';
        });
        name = name.replace(/\s+/g, ' ').trim();
        return name || filename;
    }

    function loadHistoryData() {
        if (isFetching) return;
        isFetching = true;

        let savedHistory = [];
        try {
            const raw = localStorage.getItem('tvfilehub_received_history_v2');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) savedHistory = parsed;
            }
        } catch (e) {}

        const srvUrl = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';

        // Fetch completed movies from Server hub
        fetch(`${srvUrl}/api/downloads`, { cache: 'no-cache' })
            .then(res => res.json())
            .then(data => {
                isFetching = false;
                const availableMovies = (data && Array.isArray(data.available_movies)) ? data.available_movies : [];
                const downloadingItems = (data && Array.isArray(data.currently_downloading)) ? data.currently_downloading : [];

                const validatedMovies = availableMovies.map(m => ({
                    name: m.name,
                    cleanTitle: m.clean_title || cleanTitle(m.name),
                    size: m.size || 0,
                    sizeFormatted: m.size_formatted || '',
                    isUsb: false,
                    isTorrent: false,
                    isVideo: true,
                    streamUrl: m.stream_url
                }));

                const cleanedSaved = savedHistory.filter(h => {
                    const hName = (h.name || h.filename || '').toLowerCase();
                    const onPi = availableMovies.some(m => m.name.toLowerCase() === hName) ||
                                 downloadingItems.some(d => d.name.toLowerCase() === hName);
                    return onPi || Boolean(h.isUsb);
                });

                cachedHistory = [...validatedMovies];
                cleanedSaved.forEach(item => {
                    if (!cachedHistory.some(c => (c.name || '').toLowerCase() === (item.name || item.filename || '').toLowerCase())) {
                        cachedHistory.push(item);
                    }
                });

                determineAndRenderSpotlight();
                renderContinueWatching();
            })
            .catch(() => {
                isFetching = false;
                // Offline fallback
                cachedHistory = savedHistory.filter(h => h.isUsb || (h.streamUrl && h.streamUrl.length > 5));
                determineAndRenderSpotlight();
                renderContinueWatching();
            });
    }

    function determineAndRenderSpotlight() {
        const resumeMap = getResumePoints();
        const lastPlayed = getLastPlayedRecord();

        let spotlight = null;

        // 1. Priority: Last Played Movie
        if (lastPlayed && (lastPlayed.streamUrl || lastPlayed.name)) {
            const resumeKey = lastPlayed.name || lastPlayed.title;
            const rEntry = resumeMap[resumeKey];
            const rSec = (rEntry && rEntry.time) ? rEntry.time : (typeof rEntry === 'number' ? rEntry : 0);

            // Match with cachedHistory for file size or details if available
            const matching = cachedHistory.find(c => (c.name || '').toLowerCase() === (lastPlayed.name || '').toLowerCase());

            spotlight = {
                name: lastPlayed.name || lastPlayed.title,
                cleanTitle: cleanTitle(lastPlayed.title || lastPlayed.name),
                streamUrl: lastPlayed.streamUrl || (matching ? matching.streamUrl : ''),
                subtitleUrl: lastPlayed.subtitleUrl || '',
                size: (matching && matching.size) ? matching.size : (lastPlayed.size || 0),
                sizeFormatted: (matching && matching.sizeFormatted) ? matching.sizeFormatted : '',
                isLastPlayed: true,
                resumeSec: rSec,
                isUsb: matching ? matching.isUsb : false
            };
        }

        // Check if resumeMap has a more recent resume point
        if (!spotlight || spotlight.resumeSec <= 0) {
            let topResumeKey = null;
            let topResumeEntry = null;
            let topUpdated = 0;
            for (const [key, val] of Object.entries(resumeMap)) {
                if (val && typeof val === 'object' && val.time > 5) {
                    if ((val.updatedAt || 0) > topUpdated) {
                        topUpdated = val.updatedAt || 0;
                        topResumeKey = key;
                        topResumeEntry = val;
                    }
                }
            }
            if (topResumeKey && topResumeEntry) {
                const matching = cachedHistory.find(c => (c.name || '').toLowerCase() === topResumeKey.toLowerCase());
                spotlight = {
                    name: topResumeKey,
                    cleanTitle: cleanTitle(topResumeKey),
                    streamUrl: matching ? matching.streamUrl : '',
                    subtitleUrl: '',
                    size: matching ? matching.size : 0,
                    sizeFormatted: matching ? matching.sizeFormatted : '',
                    isLastPlayed: true,
                    resumeSec: topResumeEntry.time,
                    isUsb: matching ? matching.isUsb : false
                };
            }
        }

        // 2. Fallback for First-Time Users: Last Downloaded Show
        if (!spotlight && cachedHistory.length > 0) {
            const lastDownloaded = cachedHistory[0]; // Server's newest/top completed movie
            spotlight = {
                name: lastDownloaded.name,
                cleanTitle: lastDownloaded.cleanTitle || cleanTitle(lastDownloaded.name),
                streamUrl: lastDownloaded.streamUrl,
                subtitleUrl: '',
                size: lastDownloaded.size || 0,
                sizeFormatted: lastDownloaded.sizeFormatted || '',
                isLastDownloaded: true,
                resumeSec: 0,
                isUsb: lastDownloaded.isUsb
            };
        }

        currentSpotlightItem = spotlight;
        renderSpotlightUI();
    }

    function renderSpotlightUI() {
        const titleEl = document.getElementById('hero-title');
        const descEl = document.getElementById('hero-desc');
        const badgesContainer = document.getElementById('hero-badges');
        const playBtn = document.getElementById('hero-btn-play');
        const playBtnIcon = document.getElementById('hero-play-icon');
        const playBtnText = document.getElementById('hero-play-text');
        const secondaryBtn = document.getElementById('hero-btn-secondary');
        const secondaryBtnIcon = document.getElementById('hero-secondary-icon');
        const secondaryBtnText = document.getElementById('hero-secondary-text');

        if (!currentSpotlightItem) {
            // Default Welcome Hero
            if (titleEl) titleEl.textContent = 'LinkPlay';
            if (descEl) descEl.textContent = 'High-Performance Media Hub • Wireless Phone Transfer • Seamless Video Streaming';
            if (badgesContainer) {
                badgesContainer.innerHTML = `
                    <span class="hero-badge badge-accent">★ WELCOME</span>
                    <span class="hero-badge">AVPLAY 4K</span>
                    <span class="hero-badge">USB READY</span>
                `;
            }
            if (playBtnIcon) playBtnIcon.textContent = '🎬';
            if (playBtnText) playBtnText.textContent = 'Open Video Player';
            if (secondaryBtnIcon) secondaryBtnIcon.textContent = '📥';
            if (secondaryBtnText) secondaryBtnText.textContent = 'Wireless Receiver';
            return;
        }

        const item = currentSpotlightItem;
        const title = item.cleanTitle || cleanTitle(item.name);
        const hasResume = item.resumeSec > 8;

        if (titleEl) titleEl.textContent = title;

        const sizeStr = item.sizeFormatted || (item.size && window.TVFilesystem ? window.TVFilesystem.formatBytes(item.size) : 'Ready to Stream');
        const locStr = item.isUsb ? 'USB Drive' : 'Server Storage';

        if (descEl) {
            if (hasResume) {
                descEl.textContent = `${sizeStr} • Stored on ${locStr} • Saved Resume Point: ${formatTime(item.resumeSec)}`;
            } else if (item.isLastPlayed) {
                descEl.textContent = `${sizeStr} • Stored on ${locStr} • Recently Played • High-Fidelity AVPlay Engine`;
            } else {
                descEl.textContent = `${sizeStr} • Stored on ${locStr} • Latest Download • High-Fidelity AVPlay Engine`;
            }
        }

        if (badgesContainer) {
            if (hasResume) {
                badgesContainer.innerHTML = `
                    <span class="hero-badge badge-accent">★ CONTINUE WATCHING</span>
                    <span class="hero-badge">${item.isUsb ? 'USB MEDIA' : 'SERVER 4K'}</span>
                    <span class="hero-badge badge-resume">RESUME AT ${formatTime(item.resumeSec)}</span>
                `;
            } else if (item.isLastPlayed) {
                badgesContainer.innerHTML = `
                    <span class="hero-badge badge-accent">★ LAST PLAYED</span>
                    <span class="hero-badge">${item.isUsb ? 'USB MEDIA' : 'SERVER 4K'}</span>
                    <span class="hero-badge">AVPLAY 1080P</span>
                `;
            } else {
                badgesContainer.innerHTML = `
                    <span class="hero-badge badge-accent">★ LATEST DOWNLOAD</span>
                    <span class="hero-badge">${item.isUsb ? 'USB MEDIA' : 'SERVER 4K'}</span>
                    <span class="hero-badge">READY TO STREAM</span>
                `;
            }
        }

        if (hasResume) {
            // Continue Watch as primary, Play from Start as secondary
            if (playBtnIcon) playBtnIcon.textContent = '▶';
            if (playBtnText) playBtnText.textContent = `Continue Watch (${formatTime(item.resumeSec)})`;
            if (secondaryBtnIcon) secondaryBtnIcon.textContent = '↺';
            if (secondaryBtnText) secondaryBtnText.textContent = 'Play from Start';
            if (secondaryBtn) secondaryBtn.style.display = 'inline-flex';
        } else {
            // Play Video as primary, Explore as secondary
            if (playBtnIcon) playBtnIcon.textContent = '▶';
            if (playBtnText) playBtnText.textContent = 'Play Video';
            if (secondaryBtnIcon) secondaryBtnIcon.textContent = '🎬';
            if (secondaryBtnText) secondaryBtnText.textContent = 'All Downloads';
            if (secondaryBtn) secondaryBtn.style.display = 'inline-flex';
        }
    }

    function launchSpotlightMedia(restartFromBeginning = false) {
        if (!currentSpotlightItem) {
            if (window.App) window.App.switchView('player', true);
            return;
        }

        const item = currentSpotlightItem;
        const name = item.name;
        const isTorrent = name.toLowerCase().endsWith('.torrent');

        if (window.FileReceiver && window.FileReceiver.showToast) {
            const actionText = restartFromBeginning ? 'Restarting' : (item.resumeSec > 8 ? 'Continuing' : 'Playing');
            window.FileReceiver.showToast(`${actionText} ${cleanTitle(name)}...`);
        }

        if (isTorrent) {
            if (window.App) window.App.switchView('player');
            const playerModule = window.VideoPlayer || window.Amnis;
            if (playerModule) {
                playerModule.registerTorrentDownload(name, item.size, item.streamUrl);
                playerModule.startTorrentStream(name, item.size, item.streamUrl);
            }
        } else {
            if (window.Player && window.Player.openMedia) {
                window.Player.openMedia(item.streamUrl || item.path, name, item.subtitleUrl, {
                    restartFromBeginning: restartFromBeginning
                });
            }
        }
    }

    function renderContinueWatching() {
        const carousel = document.getElementById('continue-watching-carousel');
        if (!carousel) return;

        carousel.innerHTML = '';
        const resumeMap = getResumePoints();

        // Separate items with active resume points vs others
        const resumeItems = [];
        const otherItems = [];

        cachedHistory.forEach(item => {
            const rEntry = resumeMap[item.name];
            const rSec = (rEntry && rEntry.time) ? rEntry.time : (typeof rEntry === 'number' ? rEntry : 0);
            const dur = (rEntry && rEntry.duration) ? rEntry.duration : 0;
            if (rSec > 8) {
                resumeItems.push({ ...item, resumeSec: rSec, durationSec: dur });
            } else {
                otherItems.push({ ...item, resumeSec: 0, durationSec: 0 });
            }
        });

        const displayItems = [...resumeItems, ...otherItems].slice(0, 12);

        if (displayItems.length === 0) {
            const starterCards = [
                {
                    title: 'Wireless Phone Transfer',
                    subtitle: 'Send Videos & Media from Mobile',
                    badge: 'FILE RECEIVER',
                    icon: '📱',
                    color: 'linear-gradient(135deg, rgba(123,44,191,0.7) 0%, rgba(0,242,254,0.4) 100%)',
                    action: () => window.App && window.App.switchView('receiver', true)
                },
                {
                    title: 'Stream BitTorrent Media',
                    subtitle: 'AVPlay 4K Hardware Playback',
                    badge: 'VIDEO PLAYER',
                    icon: '🎬',
                    color: 'linear-gradient(135deg, rgba(37,99,235,0.7) 0%, rgba(56,189,248,0.4) 100%)',
                    action: () => window.App && window.App.switchView('player', true)
                },
                {
                    title: 'Browse Connected Drives',
                    subtitle: 'USB Flash Drives & Local Storage',
                    badge: 'STORAGE',
                    icon: '💾',
                    color: 'linear-gradient(135deg, rgba(5,150,105,0.7) 0%, rgba(16,185,129,0.4) 100%)',
                    action: () => window.App && window.App.switchView('filemanager', true)
                }
            ];

            starterCards.forEach((starter, idx) => {
                const card = document.createElement('div');
                card.className = 'media-poster-card focusable';
                card.id = `starter-card-${idx}`;
                card.tabIndex = 0;
                card.innerHTML = `
                    <div class="poster-art" style="background: ${starter.color};">
                        <span class="poster-icon">${starter.icon}</span>
                        <span class="poster-badge">${starter.badge}</span>
                    </div>
                    <div class="poster-content">
                        <div class="poster-title">${starter.title}</div>
                        <div class="poster-desc">${starter.subtitle}</div>
                    </div>
                `;
                card.addEventListener('click', starter.action);
                carousel.appendChild(card);
            });
            return;
        }

        displayItems.forEach((item, idx) => {
            const card = document.createElement('div');
            card.className = 'media-poster-card focusable';
            card.id = `recent-card-${idx}`;
            card.tabIndex = 0;

            const title = cleanTitle(item.cleanTitle || item.name);
            const isTorrent = (item.name || '').toLowerCase().endsWith('.torrent');
            const sizeStr = item.sizeFormatted || (item.size && window.TVFilesystem ? window.TVFilesystem.formatBytes(item.size) : 'Ready');
            const hasResume = item.resumeSec > 8;
            const progressPercent = (hasResume && item.durationSec > 0) ? Math.min(Math.round((item.resumeSec / item.durationSec) * 100), 98) : 40;

            const gradients = [
                'linear-gradient(135deg, #7b2cbf 0%, #00f2fe 100%)',
                'linear-gradient(135deg, #2563eb 0%, #38bdf8 100%)',
                'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
                'linear-gradient(135deg, #9333ea 0%, #ec4899 100%)'
            ];
            const bgGrad = gradients[idx % gradients.length];

            card.innerHTML = `
                <div class="poster-art" style="background:${bgGrad};">
                    <span class="poster-play-icon">▶</span>
                    <span class="poster-badge">${hasResume ? 'RESUME' : (item.isUsb ? 'USB' : 'SERVER')}</span>
                    ${item.isUsb ? '<span class="poster-usb-tag">💾 USB</span>' : ''}
                    ${hasResume ? `
                        <div class="poster-progress-track">
                            <div class="poster-progress-fill" style="width: ${progressPercent}%;"></div>
                        </div>
                    ` : ''}
                </div>
                <div class="poster-content">
                    <div class="poster-title" title="${item.name}">${title}</div>
                    <div class="poster-desc">
                        <span>${sizeStr}</span>
                        ${hasResume ? `<span style="color:#00f2fe; font-weight:600;">• ${formatTime(item.resumeSec)}</span>` : ''}
                    </div>
                </div>
            `;

            card.addEventListener('click', () => {
                if (window.FileReceiver && window.FileReceiver.showToast) {
                    window.FileReceiver.showToast(`Opening ${title}...`);
                }
                if (isTorrent) {
                    if (window.App) window.App.switchView('player');
                    const playerModule = window.VideoPlayer || window.Amnis;
                    if (playerModule) {
                        playerModule.registerTorrentDownload(item.name, item.size, item.streamUrl);
                        playerModule.startTorrentStream(item.name, item.size, item.streamUrl);
                    }
                } else if (window.Player && window.Player.openMedia) {
                    window.Player.openMedia(item.streamUrl || item.path, item.name, item.subtitleUrl);
                } else if (window.App) {
                    window.App.switchView('player');
                }
            });

            carousel.appendChild(card);
        });
    }

    function renderStorageHealth() {
        const titleEl = document.getElementById('home-storage-title');
        const descEl = document.getElementById('home-storage-desc');
        const detailsEl = document.getElementById('home-storage-details');

        if (!window.TVFilesystem) return;

        const storages = window.TVFilesystem.getStorages() || [];
        const selected = window.TVFilesystem.getSelectedStorage();
        const pref = window.TVFilesystem.getPreferredStorage ? window.TVFilesystem.getPreferredStorage() : 'usb';
        const usbCount = storages.filter(s => s.isUsb).length;

        if (pref === 'server' || (selected && selected.isServer)) {
            if (titleEl) titleEl.textContent = 'Companion Server (Zero TV Memory)';
            if (descEl) descEl.textContent = 'Save Target: Server Storage /app/uploads/ (Streaming)';
            if (detailsEl) detailsEl.textContent = 'Server Storage Active • Zero TV Space Consumed ✓';
        } else if (titleEl) {
            titleEl.textContent = selected && selected.isUsb ? (selected.displayName || selected.label) : 'Local TV Storage';
            if (descEl) {
                const path = (selected && selected.isUsb) ? `${selected.label}/TVFileHub/Received/` : 'downloads/TVFileHub/Received/';
                descEl.textContent = `Save Target: ${path}`;
            }
            if (detailsEl) {
                detailsEl.textContent = `${usbCount} USB Drive(s) Connected • Storage Active ✓`;
            }
        }
    }

    function renderSystemStatus() {
        const ipEl = document.getElementById('home-tv-ip');
        const serverEl = document.getElementById('home-server-url');

        if (ipEl) {
            ipEl.textContent = (window.FileReceiver && window.FileReceiver.getLocalIP) ? window.FileReceiver.getLocalIP() : '192.168.0.12';
        }
        if (serverEl) {
            serverEl.textContent = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
        }

        if (window.FileReceiver && window.FileReceiver.renderQRCode) {
            window.FileReceiver.renderQRCode('home-qrcode-container');
        }
    }

    return {
        init: init,
        refresh: refresh,
        determineAndRenderSpotlight: determineAndRenderSpotlight
    };
})();
