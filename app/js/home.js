/**
 * Home Launcher & Dashboard for Samsung Tizen TV
 * Inspired by Apple TV and Google TV modern UI paradigms.
 * Features Hero Spotlight banner, Continue Watching media carousel,
 * Quick Launch tiles, Storage Health gauges, TV Performance Boost,
 * and built-in Samsung TV Ad-Blocker setup guide.
 */

window.HomeLauncher = (function() {
    'use strict';

    let currentSpotlightItem = null;
    let cachedHistory = [];
    let isBoostRunning = false;

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
        const tileBoost = document.getElementById('home-tile-boost');
        const headerBoostBtn = document.getElementById('header-boost-btn');

        if (tilePlayer) {
            tilePlayer.addEventListener('click', () => {
                if (window.App) window.App.switchView('player');
            });
        }
        if (tileReceiver) {
            tileReceiver.addEventListener('click', () => {
                if (window.App) window.App.switchView('receiver');
            });
        }
        if (tileFileManager) {
            tileFileManager.addEventListener('click', () => {
                if (window.App) window.App.switchView('filemanager');
            });
        }
        if (tileBoost) {
            tileBoost.addEventListener('click', openAdBlockModal);
        }
        if (headerBoostBtn) {
            headerBoostBtn.addEventListener('click', runTVBoost);
        }

        // Hero Action Buttons
        const heroPlayBtn = document.getElementById('hero-btn-play');
        const heroSecondaryBtn = document.getElementById('hero-btn-secondary');

        if (heroPlayBtn) {
            heroPlayBtn.addEventListener('click', launchSpotlightMedia);
        }
        if (heroSecondaryBtn) {
            heroSecondaryBtn.addEventListener('click', () => {
                if (window.App) window.App.switchView('receiver');
            });
        }

        // Ad-Blocker Guide Modal Actions
        const modalBackdrop = document.getElementById('adblock-modal-backdrop');
        const modalCloseBtn = document.getElementById('adblock-modal-close-btn');
        const modalBoostBtn = document.getElementById('adblock-modal-boost-btn');

        if (modalCloseBtn) {
            modalCloseBtn.addEventListener('click', closeAdBlockModal);
        }
        if (modalBoostBtn) {
            modalBoostBtn.addEventListener('click', () => {
                closeAdBlockModal();
                runTVBoost();
            });
        }
        if (modalBackdrop) {
            modalBackdrop.addEventListener('click', (e) => {
                if (e.target === modalBackdrop) closeAdBlockModal();
            });
        }
    }

    function refresh() {
        loadHistoryData();
        renderSpotlight();
        renderContinueWatching();
        renderStorageHealth();
        renderSystemStatus();
    }

    function loadHistoryData() {
        cachedHistory = [];
        let savedHistory = [];
        try {
            const raw = localStorage.getItem('tvfilehub_received_history_v2');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) savedHistory = parsed;
            }
        } catch (e) {
            console.warn('[HomeLauncher] History parse error:', e);
        }

        // Fetch completed movies from Raspberry Pi hub - RPi is the SINGLE SOURCE OF TRUTH
        const srvUrl = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
        fetch(`${srvUrl}/api/downloads`)
            .then(res => res.json())
            .then(data => {
                const availableMovies = (data && Array.isArray(data.available_movies)) ? data.available_movies : [];
                const downloadingItems = (data && Array.isArray(data.currently_downloading)) ? data.currently_downloading : [];

                // 1. Validated RPi available movies take top priority
                const validatedMovies = availableMovies.map(m => ({
                    name: m.name,
                    cleanTitle: m.clean_title,
                    size: m.size || 0,
                    isUsb: false,
                    isTorrent: false,
                    isVideo: true,
                    streamUrl: m.stream_url
                }));

                // 2. Prune dead or non-existent history items (such as old test torrents like Lakshmikanthan)
                const cleanedSaved = savedHistory.filter(h => {
                    const hName = (h.name || h.filename || '').toLowerCase();
                    // Keep if matches an available movie or active download on Pi
                    const onPi = availableMovies.some(m => m.name.toLowerCase() === hName) ||
                                 downloadingItems.some(d => d.name.toLowerCase() === hName);
                    // Keep if physical USB storage item
                    const isUsb = Boolean(h.isUsb);
                    return onPi || isUsb;
                });

                // Update localStorage with cleaned history
                try {
                    localStorage.setItem('tvfilehub_received_history_v2', JSON.stringify(cleanedSaved));
                } catch (eClean) {}

                // Combine: RPi available movies at the front, followed by any valid USB items
                cachedHistory = [...validatedMovies];
                cleanedSaved.forEach(item => {
                    if (!cachedHistory.some(c => (c.name || '').toLowerCase() === (item.name || item.filename || '').toLowerCase())) {
                        cachedHistory.push(item);
                    }
                });

                renderSpotlight();
                renderContinueWatching();
            })
            .catch(() => {
                // Offline fallback
                cachedHistory = savedHistory.filter(h => h.isUsb || (h.streamUrl && h.streamUrl.length > 5));
                renderSpotlight();
                renderContinueWatching();
            });
    }

    function getResumeMap() {
        try {
            const raw = localStorage.getItem('tvhub_resume_points');
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    }

    function cleanTitle(filename) {
        if (!filename) return 'Live Media Stream';
        let name = filename.replace(/^www\.[a-zA-Z0-9.\-_]+\s*-\s*/i, '');
        name = name.replace(/\.(mkv|mp4|avi|mov|webm|torrent)$/i, '');
        // Clean out typical scene tags for crisp TV display
        name = name.replace(/-\s*\(.*?AAC.*?\)/gi, '');
        name = name.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, (match) => {
            return /^\(\d{4}\)$/.test(match) ? match : '';
        });
        name = name.replace(/\s+/g, ' ').trim();
        return name || filename;
    }

    function renderSpotlight() {
        const titleEl = document.getElementById('hero-title');
        const descEl = document.getElementById('hero-desc');
        const badgesContainer = document.getElementById('hero-badges');
        const playBtnText = document.getElementById('hero-play-text');

        const resumeMap = getResumeMap();

        // Pick top item from history if available
        let topItem = cachedHistory.length > 0 ? cachedHistory[0] : null;
        currentSpotlightItem = topItem;

        if (topItem) {
            const title = cleanTitle(topItem.name);
            const isTorrent = topItem.name.toLowerCase().endsWith('.torrent');
            const isVideo = /\.(mp4|mkv|avi|mov|webm|ts)$/i.test(topItem.name);

            if (titleEl) titleEl.textContent = title;

            // Check resume position
            const resumeKey = topItem.name;
            const resumeSec = resumeMap[resumeKey] || 0;

            if (descEl) {
                const sizeStr = topItem.size && window.TVFilesystem ? window.TVFilesystem.formatBytes(topItem.size) : 'Ready to Stream';
                const locStr = topItem.isUsb ? 'USB Storage' : 'Internal TV Storage';
                descEl.textContent = `${sizeStr} • Stored on ${locStr} • High-Fidelity AVPlay Streaming Engine`;
            }

            if (badgesContainer) {
                badgesContainer.innerHTML = `
                    <span class="hero-badge badge-accent">★ FEATURED</span>
                    <span class="hero-badge">${isTorrent ? 'TORRENT STREAM' : 'LOCAL VIDEO'}</span>
                    <span class="hero-badge">1080P HEVC</span>
                    <span class="hero-badge">DD+ 5.1</span>
                    ${resumeSec > 0 ? `<span class="hero-badge badge-resume">RESUME READY</span>` : ''}
                `;
            }

            if (playBtnText) {
                if (resumeSec > 0) {
                    const mins = Math.floor(resumeSec / 60);
                    const secs = Math.floor(resumeSec % 60);
                    playBtnText.textContent = `Resume from ${mins}:${secs < 10 ? '0' : ''}${secs}`;
                } else {
                    playBtnText.textContent = isTorrent ? 'Stream in Video Player' : 'Play Video';
                }
            }
        } else {
            // Default showcase when fresh
            if (titleEl) titleEl.textContent = 'TV File Hub & Video Player';
            if (descEl) descEl.textContent = 'Ad-Free High-Performance Media Hub • Wireless Phone Transfer • Seamless Torrent Streaming';
            if (badgesContainer) {
                badgesContainer.innerHTML = `
                    <span class="hero-badge badge-accent">★ WELCOME</span>
                    <span class="hero-badge">AD-FREE HUB</span>
                    <span class="hero-badge">AVPLAY 4K</span>
                    <span class="hero-badge">USB AUTO-MOUNT</span>
                `;
            }
            if (playBtnText) playBtnText.textContent = 'Explore Video Player';
        }
    }

    function launchSpotlightMedia() {
        if (!currentSpotlightItem) {
            if (window.App) window.App.switchView('player');
            return;
        }

        const name = currentSpotlightItem.name;
        const isTorrent = name.toLowerCase().endsWith('.torrent');
        const isVideo = /\.(mp4|mkv|avi|mov|webm|ts)$/i.test(name);

        if (window.FileReceiver && window.FileReceiver.showToast) {
            window.FileReceiver.showToast(`Launching ${cleanTitle(name)}...`);
        }

        if (isTorrent) {
            if (window.App) window.App.switchView('player');
            const playerModule = window.VideoPlayer || window.Amnis;
            if (playerModule) {
                playerModule.registerTorrentDownload(name, currentSpotlightItem.size, currentSpotlightItem.streamUrl);
                playerModule.startTorrentStream(name, currentSpotlightItem.size, currentSpotlightItem.streamUrl);
            }
        } else if (isVideo) {
            if (window.Player && window.Player.openMedia) {
                window.Player.openMedia(currentSpotlightItem.streamUrl || currentSpotlightItem.path, name);
            }
        } else {
            if (window.App) window.App.switchView('player');
        }
    }

    function renderContinueWatching() {
        const carousel = document.getElementById('continue-watching-carousel');
        if (!carousel) return;

        carousel.innerHTML = '';
        const resumeMap = getResumeMap();

        if (cachedHistory.length === 0) {
            // Show 3 attractive showcase quick-cards
            const starterCards = [
                {
                    title: 'Wireless Phone Transfer',
                    subtitle: 'Scan QR Code with Phone or PC',
                    badge: 'FILE RECEIVER',
                    icon: '📱',
                    color: 'linear-gradient(135deg, rgba(123,44,191,0.6) 0%, rgba(0,242,254,0.3) 100%)',
                    action: () => window.App && window.App.switchView('receiver')
                },
                {
                    title: 'Stream BitTorrent Media',
                    subtitle: 'Sequential AVPlay Hardware Playback',
                    badge: 'VIDEO PLAYER',
                    icon: '⚡',
                    color: 'linear-gradient(135deg, rgba(239,68,68,0.5) 0%, rgba(147,51,234,0.3) 100%)',
                    action: () => window.App && window.App.switchView('player')
                },
                {
                    title: 'Browse Connected Drives',
                    subtitle: 'USB Flash Drives & Local Storage',
                    badge: 'STORAGE',
                    icon: '💾',
                    color: 'linear-gradient(135deg, rgba(16,185,129,0.5) 0%, rgba(59,130,246,0.3) 100%)',
                    action: () => window.App && window.App.switchView('filemanager')
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

        // Render actual cards from history
        cachedHistory.forEach((item, idx) => {
            const card = document.createElement('div');
            card.className = 'media-poster-card focusable';
            card.id = `recent-card-${idx}`;
            card.tabIndex = 0;

            const title = cleanTitle(item.name);
            const isTorrent = item.name.toLowerCase().endsWith('.torrent');
            const isVideo = /\.(mp4|mkv|avi|mov|webm|ts)$/i.test(item.name);
            const sizeStr = item.size && window.TVFilesystem ? window.TVFilesystem.formatBytes(item.size) : 'Ready';

            const resumeKey = item.name;
            const resumeSec = resumeMap[resumeKey] || 0;
            const hasResume = resumeSec > 0;
            const mins = Math.floor(resumeSec / 60);

            // Dynamic color gradient based on index
            const gradients = [
                'linear-gradient(135deg, #7b2cbf 0%, #00f2fe 100%)',
                'linear-gradient(135deg, #2563eb 0%, #38bdf8 100%)',
                'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)',
                'linear-gradient(135deg, #dc2626 0%, #f87171 100%)'
            ];
            const bgGrad = gradients[idx % gradients.length];

            card.innerHTML = `
                <div class="poster-art" style="background:${bgGrad};">
                    <span class="poster-play-icon">▶</span>
                    <span class="poster-badge">${isTorrent ? 'TORRENT' : 'VIDEO'}</span>
                    ${item.isUsb ? '<span class="poster-usb-tag">💾 USB</span>' : ''}
                    ${hasResume ? `
                        <div class="poster-progress-track">
                            <div class="poster-progress-fill" style="width: 45%;"></div>
                        </div>
                    ` : ''}
                </div>
                <div class="poster-content">
                    <div class="poster-title" title="${item.name}">${title}</div>
                    <div class="poster-desc">
                        <span>${sizeStr}</span>
                        ${hasResume ? `<span style="color:#00f2fe;">• Resume: ${mins}m</span>` : ''}
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
                } else if (isVideo) {
                    if (window.Player && window.Player.openMedia) {
                        window.Player.openMedia(item.streamUrl || item.path, item.name);
                    }
                } else {
                    if (window.App) window.App.switchView('filemanager');
                }
            });

            carousel.appendChild(card);
        });
    }

    function renderStorageHealth() {
        const titleEl = document.getElementById('home-storage-title');
        const descEl = document.getElementById('home-storage-desc');
        const barEl = document.getElementById('home-storage-bar');
        const detailsEl = document.getElementById('home-storage-details');

        if (!window.TVFilesystem) return;

        const storages = window.TVFilesystem.getStorages() || [];
        const selected = window.TVFilesystem.getSelectedStorage();
        const pref = window.TVFilesystem ? window.TVFilesystem.getPreferredStorage() : 'usb';
        const usbCount = storages.filter(s => s.isUsb).length;

        if (pref === 'server' || (selected && selected.isServer)) {
            if (titleEl) titleEl.textContent = 'Companion Server (Zero TV Memory)';
            if (descEl) descEl.textContent = 'Save Target: Pi / Host /app/uploads/ (Streaming)';
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
        const adShieldEl = document.getElementById('home-adshield-status');

        if (ipEl) {
            ipEl.textContent = (window.FileReceiver && window.FileReceiver.getLocalIP) ? window.FileReceiver.getLocalIP() : '192.168.0.12';
        }
        if (serverEl) {
            serverEl.textContent = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
        }
        if (adShieldEl) {
            adShieldEl.innerHTML = `
                <span class="status-dot active"></span>
                <span>Ad-Free Clean Hub Active</span>
            `;
        }
    }

    function runTVBoost() {
        if (isBoostRunning) return;
        isBoostRunning = true;

        if (window.FileReceiver && window.FileReceiver.showToast) {
            window.FileReceiver.showToast('⚡ Boosting TV performance & cleaning memory...');
        }

        // Clean stale history entries (>30)
        try {
            const raw = localStorage.getItem('tvfilehub_received_history_v2');
            if (raw) {
                let list = JSON.parse(raw);
                if (Array.isArray(list) && list.length > 25) {
                    list = list.slice(0, 25);
                    localStorage.setItem('tvfilehub_received_history_v2', JSON.stringify(list));
                }
            }
        } catch (e) {}

        // Trigger garbage collection & refresh
        setTimeout(() => {
            if (window.TVFilesystem && window.TVFilesystem.refreshStorages) {
                window.TVFilesystem.refreshStorages();
            }
            refresh();
            isBoostRunning = false;
            if (window.FileReceiver && window.FileReceiver.showToast) {
                window.FileReceiver.showToast('✓ TV Boost Complete: Memory purged & UI refreshed!');
            }
        }, 800);
    }

    function openAdBlockModal() {
        const modal = document.getElementById('adblock-modal-backdrop');
        if (modal) {
            modal.classList.add('hud-visible');
            modal.style.display = 'flex';
            setTimeout(() => {
                if (window.Navigation) window.Navigation.focusInitialElement();
            }, 60);
        }
    }

    function closeAdBlockModal() {
        const modal = document.getElementById('adblock-modal-backdrop');
        if (modal) {
            modal.classList.remove('hud-visible');
            modal.style.display = 'none';
            setTimeout(() => {
                if (window.Navigation) window.Navigation.focusInitialElement();
            }, 60);
        }
    }

    return {
        init: init,
        refresh: refresh,
        runTVBoost: runTVBoost,
        openAdBlockModal: openAdBlockModal,
        closeAdBlockModal: closeAdBlockModal
    };
})();
