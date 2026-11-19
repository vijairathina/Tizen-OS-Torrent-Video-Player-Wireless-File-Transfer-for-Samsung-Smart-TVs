/**
 * Spatial Navigation and Samsung TV Remote Control Key Handling Engine
 * Supports Tizen TV WebAPIs and Standard DOM Key Events
 */

// Global Companion Server Configuration Helpers
window.getServerHostIP = function() {
    return localStorage.getItem('tvhub_server_ip') || '192.168.0.14';
};
window.setServerHostIP = function(ip) {
    if (ip) {
        localStorage.setItem('tvhub_server_ip', ip);
        if (window.FileReceiver && window.FileReceiver.setServerHostIP) {
            window.FileReceiver.setServerHostIP(ip);
        }
    }
};
window.getServerBaseUrl = function() {
    return 'http://' + window.getServerHostIP() + ':8080';
};
window.getTorrentStreamBaseUrl = function() {
    return 'http://' + window.getServerHostIP() + ':8889';
};

window.Navigation = (function() {
    'use strict';

    // Tizen and Standard Remote Key Codes
    const KEY_CODES = {
        TAB: 9,
        RETURN: 10009,
        BACKSPACE: 8,
        ESCAPE: 27,
        LEFT: 37,
        UP: 38,
        RIGHT: 39,
        DOWN: 40,
        ENTER: 13,
        PLAY: 415,
        PAUSE: 19,
        STOP: 413,
        FAST_FORWARD: 417,
        REWIND: 412,
        PLAY_PAUSE: 10252,
        RED: 403,
        GREEN: 404,
        YELLOW: 405,
        BLUE: 406
    };

    let currentFocusedElement = null;
    let isNavigationEnabled = true;

    function init() {
        registerTizenKeys();
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('scroll', function() {
            if (window.scrollX !== 0 || window.scrollY !== 0) {
                window.scrollTo(0, 0);
            }
        }, { passive: false });
        // Default focus on first available tab or card
        setTimeout(focusInitialElement, 200);
    }

    function registerTizenKeys() {
        if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
            const keysToRegister = [
                'MediaPlay',
                'MediaPause',
                'MediaStop',
                'MediaFastForward',
                'MediaRewind',
                'MediaPlayPause',
                'ColorF0Red',
                'ColorF1Green',
                'ColorF2Yellow',
                'ColorF3Blue'
            ];
            keysToRegister.forEach(key => {
                try {
                    tizen.tvinputdevice.registerKey(key);
                } catch (e) {
                    console.warn('[Navigation] Could not register TV key:', key, e);
                }
            });
        }
    }

    function isCandidateVisible(el) {
        if (!el || el.disabled) return false;
        if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0) return false;
        return el.offsetWidth > 0 && el.offsetHeight > 0;
    }

    function getActiveModal() {
        const modal = document.querySelector('.app-dialog-backdrop.dialog-open, .app-dialog-backdrop.hud-visible');
        if (modal && (modal.offsetWidth > 0 || modal.offsetHeight > 0 || modal.style.display === 'flex' || modal.style.display === 'block')) {
            return modal;
        }
        return null;
    }

    function getVisibleFocusables() {
        // 1. If any modal dialog (Torrent HUD, Settings, Subtitles, URL) is currently active,
        // focus navigation MUST be strictly restricted inside this dialog!
        const activeModal = getActiveModal();
        if (activeModal) {
            const modalCandidates = Array.from(activeModal.querySelectorAll('.focusable:not([disabled])'));
            return modalCandidates.filter(isCandidateVisible);
        }

        // 2. If player is active, ONLY search in player-container!
        if (window.Player && window.Player.isActive()) {
            const playerContainer = document.getElementById('player-container');
            if (playerContainer) {
                const candidates = Array.from(playerContainer.querySelectorAll('.focusable:not([disabled])'));
                return candidates.filter(isCandidateVisible);
            }
        }

        // 3. Otherwise, search within the top navigation header AND the active view!
        const header = document.querySelector('.app-header');
        const activeView = document.querySelector('.app-view.active-view');

        const headerCandidates = header ? Array.from(header.querySelectorAll('.focusable:not([disabled])')) : [];
        const viewCandidates = activeView ? Array.from(activeView.querySelectorAll('.focusable:not([disabled])')) : [];
        const candidates = headerCandidates.concat(viewCandidates);

        return candidates.filter(isCandidateVisible);
    }

    function focusInitialElement() {
        // If current focus is already on a top navigation tab, KEEP IT THERE! Do not jump down!
        if (currentFocusedElement && (currentFocusedElement.classList.contains('nav-tab') || currentFocusedElement.closest('.app-nav'))) {
            return;
        }

        // If modal dialog is open, focus inside it (prefer Close button on HUD so user can easily dismiss)
        const activeModal = getActiveModal();
        if (activeModal) {
            const closeBtn = activeModal.querySelector('#hud-close-btn');
            if (closeBtn) {
                setFocus(closeBtn);
                return;
            }
            const modalFocusables = getVisibleFocusables();
            if (modalFocusables.length > 0) {
                setFocus(modalFocusables[0]);
                return;
            }
        }

        // If inside an active view, focus the primary logical element inside that view!
        const activeView = document.querySelector('.app-view.active-view');
        if (activeView) {
            if (activeView.id === 'view-home') {
                const target = document.getElementById('hero-btn-play') || document.getElementById('home-tile-player');
                if (target) { setFocus(target); return; }
            } else if (activeView.id === 'view-player') {
                const target = document.querySelector('.player-subtab.active') || document.getElementById('subtab-available');
                if (target) { setFocus(target); return; }
            } else if (activeView.id === 'view-receiver') {
                const target = document.getElementById('receiver-clear-list-btn') || document.getElementById('receiver-usb-target');
                if (target) { setFocus(target); return; }
            } else if (activeView.id === 'view-filemanager') {
                const target = document.querySelector('.storage-pill.active') || document.querySelector('.storage-pill') || document.getElementById('fm-up-btn');
                if (target) { setFocus(target); return; }
            }

            const viewFocusables = Array.from(activeView.querySelectorAll('.focusable:not([disabled])')).filter(isCandidateVisible);
            if (viewFocusables.length > 0) {
                setFocus(viewFocusables[0]);
                return;
            }
        }

        // If no view element, focus the active tab in header
        const activeTab = document.querySelector('.nav-tab.active') || document.querySelector('.nav-tab');
        if (activeTab) {
            setFocus(activeTab);
            return;
        }

        const focusables = getVisibleFocusables();
        if (focusables.length > 0) {
            setFocus(focusables[0]);
        }
    }

    function setFocus(element) {
        if (!element) return;
        const activeModal = getActiveModal();
        if (activeModal && !activeModal.contains(element)) {
            // Block background elements from stealing focus while a modal is active
            return;
        }
        if (currentFocusedElement && currentFocusedElement !== element) {
            currentFocusedElement.classList.remove('focused');
            currentFocusedElement.blur();
        }
        currentFocusedElement = element;
        currentFocusedElement.classList.add('focused');
        currentFocusedElement.focus();

        // If a navigation tab is focused, always scroll the underlying active view to the top
        if (currentFocusedElement.classList.contains('nav-tab') || currentFocusedElement.closest('.app-nav')) {
            if (window.App && window.App.scrollActiveViewToTop) {
                window.App.scrollActiveViewToTop();
            }
        }
        
        // Only scroll internal list containers (e.g. downloads list, carousel, dialog list, file grid)
        // Never allow the outer window or document body to scroll or drift off-axis!
        const scrollContainer = currentFocusedElement.closest('#view-home, .home-container, .amnis-downloads-list, .player-downloads-list, .media-carousel-container, .transfer-list, .storage-dialog-list, .settings-panel, .episodes-dialog-list, .file-grid');
        if (scrollContainer) {
            const cRect = scrollContainer.getBoundingClientRect();
            const eRect = currentFocusedElement.getBoundingClientRect();
            if (eRect.top < cRect.top + 20) {
                scrollContainer.scrollTop -= (cRect.top + 20 - eRect.top);
            } else if (eRect.bottom > cRect.bottom - 20) {
                scrollContainer.scrollTop += (eRect.bottom - (cRect.bottom - 20));
            }
        }
        // Force window coordinates to always stay rigidly locked at (0, 0)
        if (window.scrollX !== 0 || window.scrollY !== 0 || window.pageXOffset !== 0 || window.pageYOffset !== 0) {
            window.scrollTo(0, 0);
        }
        if (document.documentElement.scrollTop !== 0 || document.documentElement.scrollLeft !== 0) {
            document.documentElement.scrollTop = 0;
            document.documentElement.scrollLeft = 0;
        }
        if (document.body.scrollTop !== 0 || document.body.scrollLeft !== 0) {
            document.body.scrollTop = 0;
            document.body.scrollLeft = 0;
        }
    }

    function move(direction) {
        const activeModal = getActiveModal();

        // If modal is active, focus MUST be inside it.
        // If current focus is lost or outside, snap to modal immediately!
        if (activeModal) {
            if (!currentFocusedElement || !activeModal.contains(currentFocusedElement)) {
                focusInitialElement();
                return;
            }
        } else if (!currentFocusedElement) {
            focusInitialElement();
            return;
        }

        const focusables = getVisibleFocusables();
        if (focusables.length <= 1) return;

        // If inside a modal with 2 buttons (e.g. Play and Close in HUD)
        if (activeModal && focusables.length === 2) {
            const currentIndex = focusables.indexOf(currentFocusedElement);
            if (currentIndex !== -1) {
                if (direction === 'left' || direction === 'right') {
                    const otherIndex = (currentIndex === 0) ? 1 : 0;
                    setFocus(focusables[otherIndex]);
                    return;
                } else if (direction === 'up' || direction === 'down') {
                    // Stay inside modal on current button
                    return;
                }
            }
        }

        // 1. Header Navigation Tabs (Home, Video Player, Receiver, File Manager)
        const headerNav = document.querySelector('.app-nav');
        if (headerNav && headerNav.contains(currentFocusedElement)) {
            const tabs = Array.from(headerNav.querySelectorAll('.nav-tab.focusable:not([disabled])'));
            const tabIdx = tabs.indexOf(currentFocusedElement);
            if (tabIdx !== -1) {
                if (direction === 'left') {
                    if (tabIdx > 0) {
                        const targetTab = tabs[tabIdx - 1];
                        setFocus(targetTab);
                        const vName = targetTab.id.replace('tab-', '');
                        if (window.App && window.App.switchView) {
                            window.App.switchView(vName, false);
                        }
                        if (window.App && window.App.scrollActiveViewToTop) {
                            window.App.scrollActiveViewToTop();
                        }
                    }
                    return;
                } else if (direction === 'right') {
                    if (tabIdx < tabs.length - 1) {
                        const targetTab = tabs[tabIdx + 1];
                        setFocus(targetTab);
                        const vName = targetTab.id.replace('tab-', '');
                        if (window.App && window.App.switchView) {
                            window.App.switchView(vName, false);
                        }
                        if (window.App && window.App.scrollActiveViewToTop) {
                            window.App.scrollActiveViewToTop();
                        }
                    }
                    return;
                } else if (direction === 'down') {
                    // Navigate down into the first element of this view
                    const vName = currentFocusedElement.id.replace('tab-', '');
                    if (window.App && window.App.switchView) {
                        window.App.switchView(vName, false);
                    }

                    if (currentFocusedElement.id === 'tab-home') {
                        const target = document.getElementById('hero-btn-play') || document.querySelector('#continue-watching-carousel .media-poster-card.focusable') || document.getElementById('home-tile-player');
                        if (target) { setFocus(target); return; }
                    } else if (currentFocusedElement.id === 'tab-player') {
                        const target = document.querySelector('.player-subtab.active') || document.getElementById('subtab-available');
                        if (target) { setFocus(target); return; }
                    } else if (currentFocusedElement.id === 'tab-receiver') {
                        const target = document.getElementById('receiver-clear-list-btn') || document.getElementById('receiver-usb-target');
                        if (target) { setFocus(target); return; }
                    } else if (currentFocusedElement.id === 'tab-filemanager') {
                        const target = document.querySelector('.storage-pill.active') || document.querySelector('.storage-pill') || document.getElementById('fm-up-btn');
                        if (target) { setFocus(target); return; }
                    }
                    return;
                } else if (direction === 'up') {
                    return;
                }
            }
        }

        // 2. HOME VIEW: Hero primary/secondary action buttons
        if (currentFocusedElement.id === 'hero-btn-play' || currentFocusedElement.id === 'hero-btn-secondary') {
            if (direction === 'up') {
                const tabHome = document.getElementById('tab-home');
                if (tabHome) { setFocus(tabHome); return; }
            } else if (direction === 'right' && currentFocusedElement.id === 'hero-btn-play') {
                const sec = document.getElementById('hero-btn-secondary');
                if (sec && sec.style.display !== 'none') { setFocus(sec); return; }
            } else if (direction === 'left' && currentFocusedElement.id === 'hero-btn-secondary') {
                const pri = document.getElementById('hero-btn-play');
                if (pri) { setFocus(pri); return; }
            } else if (direction === 'down') {
                // Navigate DOWN to Continue Watching Carousel directly below hero
                const carouselCard = document.querySelector('#continue-watching-carousel .media-poster-card.focusable') ||
                                     document.querySelector('#continue-watching-carousel .carousel-card.focusable');
                if (carouselCard) { setFocus(carouselCard); return; }
                const tile = document.getElementById('home-tile-player');
                if (tile) { setFocus(tile); return; }
            }
        }

        // 3. HOME VIEW: Continue Watching & Recent Media Carousel (Directly below Hero)
        if (currentFocusedElement.classList.contains('media-poster-card') || currentFocusedElement.classList.contains('carousel-card')) {
            const carousel = currentFocusedElement.closest('.media-carousel-container');
            if (carousel) {
                const cards = Array.from(carousel.querySelectorAll('.media-poster-card.focusable, .carousel-card.focusable'));
                const cIdx = cards.indexOf(currentFocusedElement);
                if (direction === 'left' && cIdx > 0) {
                    setFocus(cards[cIdx - 1]);
                    return;
                } else if (direction === 'right' && cIdx < cards.length - 1) {
                    setFocus(cards[cIdx + 1]);
                    return;
                } else if (direction === 'up') {
                    const heroBtn = document.getElementById('hero-btn-play') || document.getElementById('tab-home');
                    if (heroBtn) { setFocus(heroBtn); return; }
                } else if (direction === 'down') {
                    // Navigate DOWN to Quick Launch tiles
                    const tile = document.getElementById('home-tile-player') || document.querySelector('.home-tile.focusable');
                    if (tile) { setFocus(tile); return; }
                    const widget = document.getElementById('widget-storage') || document.querySelector('.dashboard-widget.focusable');
                    if (widget) { setFocus(widget); return; }
                }
            }
        }

        // 4. HOME VIEW: Quick Launch Tiles (Player, Receiver, FileManager) (Moved down below media)
        if (currentFocusedElement.classList.contains('home-tile')) {
            const tileGrid = currentFocusedElement.closest('.home-tiles-grid');
            if (tileGrid) {
                const tiles = Array.from(tileGrid.querySelectorAll('.home-tile.focusable'));
                const tIdx = tiles.indexOf(currentFocusedElement);
                if (direction === 'left' && tIdx > 0) {
                    setFocus(tiles[tIdx - 1]);
                    return;
                } else if (direction === 'right' && tIdx < tiles.length - 1) {
                    setFocus(tiles[tIdx + 1]);
                    return;
                } else if (direction === 'up') {
                    // Navigate UP to Continue Watching Carousel
                    const carouselCard = document.querySelector('#continue-watching-carousel .media-poster-card.focusable') ||
                                         document.querySelector('#continue-watching-carousel .carousel-card.focusable') ||
                                         document.getElementById('hero-btn-play');
                    if (carouselCard) { setFocus(carouselCard); return; }
                } else if (direction === 'down') {
                    // Navigate DOWN to Dashboard Widgets
                    const widget = document.getElementById('widget-storage') || document.querySelector('.dashboard-widget.focusable');
                    if (widget) { setFocus(widget); return; }
                }
            }
        }

        // 5. HOME VIEW: Dashboard Widgets
        if (currentFocusedElement.classList.contains('dashboard-widget')) {
            const wGrid = currentFocusedElement.closest('.home-widgets-grid');
            if (wGrid) {
                const widgets = Array.from(wGrid.querySelectorAll('.dashboard-widget.focusable'));
                const wIdx = widgets.indexOf(currentFocusedElement);
                if (direction === 'left' && wIdx > 0) {
                    setFocus(widgets[wIdx - 1]);
                    return;
                } else if (direction === 'right' && wIdx < widgets.length - 1) {
                    setFocus(widgets[wIdx + 1]);
                    return;
                } else if (direction === 'up') {
                    // Navigate UP to Quick Launch tiles
                    const tile = document.getElementById('home-tile-player') || document.querySelector('.home-tile.focusable');
                    if (tile) { setFocus(tile); return; }
                } else if (direction === 'down') {
                    return;
                }
            }
        }

        // 6. VIDEO PLAYER: Top Action Icon Buttons
        if (currentFocusedElement.classList.contains('player-header-btn')) {
            const container = document.getElementById('player-header-actions');
            if (container) {
                const btns = Array.from(container.querySelectorAll('.player-header-btn.focusable'));
                const bIdx = btns.indexOf(currentFocusedElement);
                if (direction === 'left') {
                    if (bIdx > 0) {
                        setFocus(btns[bIdx - 1]);
                        return;
                    } else {
                        const subtab = document.querySelector('.player-subtab.active') || document.getElementById('subtab-downloads');
                        if (subtab) { setFocus(subtab); return; }
                    }
                } else if (direction === 'right') {
                    if (bIdx < btns.length - 1) {
                        setFocus(btns[bIdx + 1]);
                        return;
                    }
                } else if (direction === 'up') {
                    const tabPlayer = document.getElementById('tab-player');
                    if (tabPlayer) { setFocus(tabPlayer); return; }
                } else if (direction === 'down') {
                    const subtab = document.querySelector('.player-subtab.active') || document.getElementById('subtab-available');
                    if (subtab) { setFocus(subtab); return; }
                }
            }
        }

        // 7. VIDEO PLAYER: Sub-tabs (Available Movies vs Active Downloads)
        if (currentFocusedElement.id === 'subtab-available' || currentFocusedElement.id === 'subtab-downloads') {
            if (direction === 'up') {
                const tabPlayer = document.getElementById('tab-player');
                if (tabPlayer) { setFocus(tabPlayer); return; }
            } else if (direction === 'right') {
                if (currentFocusedElement.id === 'subtab-available') {
                    const subDls = document.getElementById('subtab-downloads');
                    if (subDls) {
                        subDls.click();
                        setFocus(subDls);
                        return;
                    }
                } else {
                    const refreshBtn = document.getElementById('player-card-refresh');
                    if (refreshBtn) { setFocus(refreshBtn); return; }
                }
            } else if (direction === 'left') {
                if (currentFocusedElement.id === 'subtab-downloads') {
                    const subAvail = document.getElementById('subtab-available');
                    if (subAvail) {
                        subAvail.click();
                        setFocus(subAvail);
                        return;
                    }
                }
            } else if (direction === 'down') {
                const isAvail = currentFocusedElement.id === 'subtab-available';
                const activeContainer = isAvail
                    ? document.getElementById('player-available-list')
                    : document.getElementById('player-downloads-list');
                if (activeContainer) {
                    const firstBtn = activeContainer.querySelector('.action-btn-play.focusable, .player-download-card.focusable, .focusable:not([disabled])');
                    if (firstBtn) { setFocus(firstBtn); return; }
                }
            }
        }

        // 8. VIDEO PLAYER: Movie cards / Download items
        const playerCard = currentFocusedElement.closest('.player-download-card');
        if (playerCard) {
            const listContainer = playerCard.closest('.player-downloads-list, .amnis-downloads-list');
            if (direction === 'up') {
                const prevCard = playerCard.previousElementSibling;
                if (prevCard && prevCard.classList.contains('player-download-card')) {
                    const prevBtn = prevCard.querySelector('.action-btn-play.focusable') || prevCard.querySelector('.focusable');
                    if (prevBtn) { setFocus(prevBtn); return; }
                } else {
                    const subtab = document.querySelector('.player-subtab.active') || document.getElementById('subtab-available');
                    if (subtab) { setFocus(subtab); return; }
                }
            } else if (direction === 'down') {
                const nextCard = playerCard.nextElementSibling;
                if (nextCard && nextCard.classList.contains('player-download-card')) {
                    const nextBtn = nextCard.querySelector('.action-btn-play.focusable') || nextCard.querySelector('.focusable');
                    if (nextBtn) { setFocus(nextBtn); return; }
                } else if (listContainer && listContainer.id === 'player-available-list') {
                    // At bottom of available movies, pressing DOWN smoothly transitions to downloads subtab
                    const subDls = document.getElementById('subtab-downloads');
                    if (subDls) {
                        subDls.click();
                        setFocus(subDls);
                        return;
                    }
                }
            } else if (direction === 'right' && currentFocusedElement.classList.contains('action-btn-play')) {
                const delBtn = playerCard.querySelector('.action-btn-delete.focusable');
                if (delBtn) { setFocus(delBtn); return; }
            } else if (direction === 'left' && currentFocusedElement.classList.contains('action-btn-delete')) {
                const playBtn = playerCard.querySelector('.action-btn-play.focusable');
                if (playBtn) { setFocus(playBtn); return; }
            }
        }

        // 9. FILE RECEIVER: Target box and Clear List button
        if (currentFocusedElement.id === 'receiver-usb-target' || currentFocusedElement.id === 'receiver-clear-list-btn') {
            if (direction === 'up') {
                const tabReceiver = document.getElementById('tab-receiver');
                if (tabReceiver) { setFocus(tabReceiver); return; }
            } else if (direction === 'right' && currentFocusedElement.id === 'receiver-usb-target') {
                const clearBtn = document.getElementById('receiver-clear-list-btn');
                if (clearBtn) { setFocus(clearBtn); return; }
            } else if (direction === 'left' && currentFocusedElement.id === 'receiver-clear-list-btn') {
                const usbBox = document.getElementById('receiver-usb-target');
                if (usbBox) { setFocus(usbBox); return; }
            } else if (direction === 'down') {
                const firstCard = document.querySelector('#transfer-queue-list .transfer-card.focusable, #transfer-queue-list .action-btn-play.focusable');
                if (firstCard) { setFocus(firstCard); return; }
            }
        }

        // 10. FILE RECEIVER: Transfer queue items
        if (currentFocusedElement.closest('#transfer-queue-list')) {
            const queueList = document.getElementById('transfer-queue-list');
            const items = Array.from(queueList.querySelectorAll('.focusable:not([disabled])'));
            const qIdx = items.indexOf(currentFocusedElement);
            if (direction === 'up') {
                if (qIdx > 0) {
                    setFocus(items[qIdx - 1]);
                    return;
                } else {
                    const clearBtn = document.getElementById('receiver-clear-list-btn') || document.getElementById('tab-receiver');
                    if (clearBtn) { setFocus(clearBtn); return; }
                }
            } else if (direction === 'down') {
                if (qIdx < items.length - 1) {
                    setFocus(items[qIdx + 1]);
                    return;
                }
            } else if (direction === 'left') {
                const usbBox = document.getElementById('receiver-usb-target');
                if (usbBox) { setFocus(usbBox); return; }
            }
        }

        // 11. FILE MANAGER: Storage selector pills & refresh button
        if (currentFocusedElement.classList.contains('storage-pill') || currentFocusedElement.id === 'fm-refresh-btn') {
            const container = document.getElementById('storage-pills-container');
            const pills = container ? Array.from(container.querySelectorAll('.storage-pill.focusable')) : [];
            const refreshBtn = document.getElementById('fm-refresh-btn');
            const allTop = refreshBtn ? pills.concat([refreshBtn]) : pills;
            const pIdx = allTop.indexOf(currentFocusedElement);

            if (direction === 'up') {
                const tabFm = document.getElementById('tab-filemanager');
                if (tabFm) { setFocus(tabFm); return; }
            } else if (direction === 'left' && pIdx > 0) {
                setFocus(allTop[pIdx - 1]);
                return;
            } else if (direction === 'right' && pIdx < allTop.length - 1) {
                setFocus(allTop[pIdx + 1]);
                return;
            } else if (direction === 'down') {
                const navBtn = document.getElementById('fm-up-btn') || document.getElementById('fm-root-btn');
                if (navBtn) { setFocus(navBtn); return; }
            }
        }

        // 12. FILE MANAGER: Action bar (Up Level, Root, Received)
        if (currentFocusedElement.id === 'fm-up-btn' || currentFocusedElement.id === 'fm-root-btn' || currentFocusedElement.id === 'fm-received-btn') {
            const bar = document.querySelector('.fm-quick-nav-actions');
            const btns = bar ? Array.from(bar.querySelectorAll('.osd-btn.focusable')) : [];
            const bIdx = btns.indexOf(currentFocusedElement);

            if (direction === 'up') {
                const pill = document.querySelector('.storage-pill.active') || document.querySelector('.storage-pill') || document.getElementById('tab-filemanager');
                if (pill) { setFocus(pill); return; }
            } else if (direction === 'left' && bIdx > 0) {
                setFocus(btns[bIdx - 1]);
                return;
            } else if (direction === 'right' && bIdx < btns.length - 1) {
                setFocus(btns[bIdx + 1]);
                return;
            } else if (direction === 'down') {
                const cards = Array.from(document.querySelectorAll('#fm-file-grid .file-item-card.focusable'));
                if (cards.length > 0) {
                    const targetIdx = Math.min(bIdx, cards.length - 1);
                    setFocus(cards[targetIdx]);
                    return;
                }
            }
        }

        // 13. FILE MANAGER: File Grid cards (3-column layout)
        if (currentFocusedElement.classList.contains('file-item-card')) {
            const grid = currentFocusedElement.closest('.file-grid') || document.getElementById('fm-file-grid');
            if (grid) {
                const cards = Array.from(grid.querySelectorAll('.file-item-card.focusable'));
                const cIdx = cards.indexOf(currentFocusedElement);
                if (cIdx !== -1) {
                    const numCards = cards.length;
                    const col = cIdx % 3;
                    const row = Math.floor(cIdx / 3);

                    if (direction === 'left') {
                        if (col > 0) {
                            setFocus(cards[cIdx - 1]);
                            return;
                        }
                    } else if (direction === 'right') {
                        if (col < 2 && cIdx + 1 < numCards) {
                            setFocus(cards[cIdx + 1]);
                            return;
                        }
                    } else if (direction === 'up') {
                        if (row === 0) {
                            const navBtns = [
                                document.getElementById('fm-up-btn'),
                                document.getElementById('fm-root-btn'),
                                document.getElementById('fm-received-btn')
                            ].filter(Boolean);
                            const targetNav = navBtns[Math.min(col, navBtns.length - 1)] || document.getElementById('tab-filemanager');
                            if (targetNav) { setFocus(targetNav); return; }
                        } else {
                            setFocus(cards[cIdx - 3]);
                            return;
                        }
                    } else if (direction === 'down') {
                        if (cIdx + 3 < numCards) {
                            setFocus(cards[cIdx + 3]);
                            return;
                        } else {
                            const lastCardIdx = numCards - 1;
                            if (Math.floor(lastCardIdx / 3) > row) {
                                setFocus(cards[lastCardIdx]);
                                return;
                            }
                        }
                    }
                }
            }
        }

        const currentRect = currentFocusedElement.getBoundingClientRect();
        const currentCenter = {
            x: currentRect.left + currentRect.width / 2,
            y: currentRect.top + currentRect.height / 2
        };

        let bestCandidate = null;
        let minDistance = Infinity;

        focusables.forEach(target => {
            if (target === currentFocusedElement) return;

            const targetRect = target.getBoundingClientRect();
            const targetCenter = {
                x: targetRect.left + targetRect.width / 2,
                y: targetRect.top + targetRect.height / 2
            };

            const dx = targetCenter.x - currentCenter.x;
            const dy = targetCenter.y - currentCenter.y;

            // Directional filter
            let isValidDirection = false;
            if (direction === 'left' && dx < -8 && Math.abs(dx) > Math.abs(dy) * 0.4) isValidDirection = true;
            if (direction === 'right' && dx > 8 && Math.abs(dx) > Math.abs(dy) * 0.4) isValidDirection = true;
            if (direction === 'up' && dy < -8 && Math.abs(dy) > Math.abs(dx) * 0.4) isValidDirection = true;
            if (direction === 'down' && dy > 8 && Math.abs(dy) > Math.abs(dx) * 0.4) isValidDirection = true;

            if (isValidDirection) {
                // Euclidean distance with directional weighting
                const distance = Math.hypot(dx, dy);
                if (distance < minDistance) {
                    minDistance = distance;
                    bestCandidate = target;
                }
            }
        });

        if (bestCandidate) {
            setFocus(bestCandidate);
        } else if (direction === 'up') {
            // If moving UP and no candidate found, focus this view's corresponding tab in header!
            const activeView = document.querySelector('.app-view.active-view');
            const targetTabId = 'tab-' + (activeView ? activeView.id.replace('view-', '') : 'home');
            const targetTab = document.getElementById(targetTabId) || document.querySelector('.nav-tab.active');
            if (targetTab) {
                setFocus(targetTab);
            }
        }
    }

    function handleKeyDown(e) {
        if (!isNavigationEnabled) return;

        const keyCode = e.keyCode;
        const activeModal = getActiveModal();

        // 1. If an active modal is open on screen, STRICTLY trap and route keys inside the modal only
        if (activeModal) {
            // If focus was somehow lost or outside, immediately snap to modal
            if (!currentFocusedElement || !activeModal.contains(currentFocusedElement)) {
                focusInitialElement();
            }

            // Return / Back key dismisses the modal
            if (keyCode === KEY_CODES.RETURN || keyCode === KEY_CODES.BACKSPACE || keyCode === KEY_CODES.ESCAPE) {
                e.preventDefault();
                handleReturnKey();
                return;
            }

            switch (keyCode) {
                case KEY_CODES.LEFT:
                    e.preventDefault();
                    move('left');
                    return;
                case KEY_CODES.RIGHT:
                    e.preventDefault();
                    move('right');
                    return;
                case KEY_CODES.UP:
                    e.preventDefault();
                    move('up');
                    return;
                case KEY_CODES.DOWN:
                    e.preventDefault();
                    move('down');
                    return;
                case KEY_CODES.ENTER:
                    e.preventDefault();
                    if (currentFocusedElement) {
                        currentFocusedElement.click();
                    }
                    return;
            }
            return;
        }

        // 2. Custom player key handling if player is active (and no modal is open)
        if (window.Player && window.Player.isActive()) {
            if (handlePlayerKeys(keyCode, e)) {
                return;
            }
        }

        switch (keyCode) {
            case KEY_CODES.LEFT:
                e.preventDefault();
                move('left');
                break;
            case KEY_CODES.RIGHT:
                e.preventDefault();
                move('right');
                break;
            case KEY_CODES.UP:
                e.preventDefault();
                move('up');
                break;
            case KEY_CODES.DOWN:
                e.preventDefault();
                move('down');
                break;
            case KEY_CODES.ENTER:
                e.preventDefault();
                if (currentFocusedElement) {
                    if (currentFocusedElement.classList.contains('nav-tab') || currentFocusedElement.closest('.app-nav')) {
                        const vName = currentFocusedElement.id.replace('tab-', '');
                        if (window.App && window.App.switchView) {
                            window.App.switchView(vName, false);
                        }
                        if (window.App && window.App.scrollActiveViewToTop) {
                            window.App.scrollActiveViewToTop();
                        }
                        setFocus(currentFocusedElement);
                        return;
                    }
                    currentFocusedElement.click();
                }
                break;
            case KEY_CODES.TAB:
                e.preventDefault();
                const focusables = getVisibleFocusables();
                if (focusables.length === 0) break;
                let currentIndex = focusables.indexOf(currentFocusedElement);
                let nextIndex;
                if (e.shiftKey) {
                    nextIndex = (currentIndex - 1 + focusables.length) % focusables.length;
                } else {
                    nextIndex = (currentIndex + 1) % focusables.length;
                }
                setFocus(focusables[nextIndex]);
                break;
            case KEY_CODES.RETURN:
            case KEY_CODES.BACKSPACE:
            case KEY_CODES.ESCAPE:
                e.preventDefault();
                handleReturnKey();
                break;
            default:
                break;
        }
    }

    function handleKeyUp(e) {
        if (!isNavigationEnabled) return;

        if (window.Player && window.Player.isActive()) {
            const keyCode = e.keyCode;
            if (keyCode === KEY_CODES.LEFT || keyCode === KEY_CODES.RIGHT ||
                keyCode === KEY_CODES.FAST_FORWARD || keyCode === KEY_CODES.REWIND) {
                if (window.Player.finishScrubbing) {
                    window.Player.finishScrubbing();
                }
            }
        }
    }

    function handlePlayerKeys(keyCode, e) {
        // If an overlay/dialog (Torrent Info HUD or Subtitle modal) is open inside player
        const activeModal = getActiveModal();
        if (activeModal) {
            if (keyCode === KEY_CODES.RETURN || keyCode === KEY_CODES.BACKSPACE || keyCode === KEY_CODES.ESCAPE) {
                e.preventDefault();
                handleReturnKey();
                return true;
            }
            // Allow default spatial navigation inside the HUD dialog
            return false;
        }

        // If scrubbing was active and user pressed another key, commit scrub first
        if (keyCode !== KEY_CODES.LEFT && keyCode !== KEY_CODES.RIGHT &&
            keyCode !== KEY_CODES.FAST_FORWARD && keyCode !== KEY_CODES.REWIND) {
            if (window.Player.isScrubbingActive && window.Player.isScrubbingActive()) {
                window.Player.finishScrubbing();
            }
        }

        // Dedicated hardware player buttons on Samsung remote
        if (keyCode === KEY_CODES.PLAY) {
            e.preventDefault();
            window.Player.play();
            return true;
        }
        if (keyCode === KEY_CODES.PAUSE) {
            e.preventDefault();
            window.Player.pause();
            return true;
        }
        if (keyCode === KEY_CODES.PLAY_PAUSE) {
            e.preventDefault();
            window.Player.togglePlayPause();
            return true;
        }
        if (keyCode === KEY_CODES.STOP) {
            e.preventDefault();
            window.Player.close();
            return true;
        }
        if (keyCode === KEY_CODES.FAST_FORWARD) {
            e.preventDefault();
            window.Player.seekRelative(15);
            return true;
        }
        if (keyCode === KEY_CODES.REWIND) {
            e.preventDefault();
            window.Player.seekRelative(-15);
            return true;
        }
        if (keyCode === KEY_CODES.RETURN || keyCode === KEY_CODES.BACKSPACE || keyCode === KEY_CODES.ESCAPE) {
            e.preventDefault();
            window.Player.close();
            return true;
        }

        // Directional and action keys (D-pad UP/DOWN/LEFT/RIGHT, ENTER)
        const timelineBox = document.getElementById('osd-timeline-box');
        const osdVisible = window.Player.isOsdVisible ? window.Player.isOsdVisible() : true;

        // If OSD is currently hidden, any D-pad key shows OSD and focuses the timeline
        if (!osdVisible) {
            window.Player.showOSD();
            if (timelineBox) setFocus(timelineBox);
            e.preventDefault();
            return true;
        }

        // Always keep OSD visible on any user interaction
        window.Player.showOSD();

        // 1. Focus is on TIMELINE BOX (Bottom)
        if (currentFocusedElement && (currentFocusedElement.id === 'osd-timeline-box' || currentFocusedElement.classList.contains('osd-timeline-box'))) {
            switch (keyCode) {
                case KEY_CODES.LEFT:
                    e.preventDefault();
                    window.Player.seekRelative(-10);
                    return true;
                case KEY_CODES.RIGHT:
                    e.preventDefault();
                    window.Player.seekRelative(10);
                    return true;
                case KEY_CODES.UP:
                    e.preventDefault();
                    const topBtn = document.getElementById('osd-subs-btn') || 
                                   document.getElementById('osd-aspect-btn') || 
                                   document.getElementById('osd-close-btn');
                    if (topBtn) setFocus(topBtn);
                    return true;
                case KEY_CODES.DOWN:
                    e.preventDefault();
                    return true; // Stay on timeline
                case KEY_CODES.ENTER:
                    e.preventDefault();
                    window.Player.togglePlayPause();
                    return true;
            }
        }

        // 2. Focus is on TOP ACTION BUTTONS (Subtitles, Aspect, Exit)
        const isTopAction = currentFocusedElement && currentFocusedElement.closest('.osd-top-actions');
        if (isTopAction) {
            switch (keyCode) {
                case KEY_CODES.DOWN:
                    e.preventDefault();
                    if (timelineBox) setFocus(timelineBox);
                    return true;
                case KEY_CODES.UP:
                    e.preventDefault();
                    return true;
                case KEY_CODES.LEFT:
                    e.preventDefault();
                    move('left');
                    return true;
                case KEY_CODES.RIGHT:
                    e.preventDefault();
                    move('right');
                    return true;
                case KEY_CODES.ENTER:
                    e.preventDefault();
                    currentFocusedElement.click();
                    return true;
            }
        }

        // 3. Default fallback inside player
        switch (keyCode) {
            case KEY_CODES.DOWN:
                e.preventDefault();
                if (timelineBox) setFocus(timelineBox);
                return true;
            case KEY_CODES.UP:
                e.preventDefault();
                const fallbackTop = document.getElementById('osd-subs-btn') || document.getElementById('osd-close-btn');
                if (fallbackTop) setFocus(fallbackTop);
                return true;
            case KEY_CODES.LEFT:
                e.preventDefault();
                window.Player.seekRelative(-10);
                return true;
            case KEY_CODES.RIGHT:
                e.preventDefault();
                window.Player.seekRelative(10);
                return true;
            case KEY_CODES.ENTER:
                e.preventDefault();
                window.Player.togglePlayPause();
                return true;
        }

        return false;
    }

    function handleReturnKey() {
        // 1. If any modal dialog is open, close it cleanly
        const openDialog = document.querySelector('.app-dialog-backdrop.dialog-open, .app-dialog-backdrop.hud-visible');
        if (openDialog) {
            openDialog.classList.remove('dialog-open', 'hud-visible');
            focusInitialElement();
            return;
        }

        // If in subfolder of USB file manager, go to parent directory
        if (window.FileManager && window.FileManager.canGoBack()) {
            window.FileManager.navigateBack();
            return;
        }

        // If on another tab, return to main tab (player)
        if (window.App && window.App.getCurrentView() !== 'player' && window.App.getCurrentView() !== 'amnis') {
            window.App.switchView('player');
            return;
        }

        // Tizen exit application
        if (typeof tizen !== 'undefined' && tizen.application) {
            try {
                tizen.application.getCurrentApplication().exit();
            } catch (err) {
                console.warn('[Navigation] Exit app error:', err);
            }
        }
    }

    return {
        init: init,
        setFocus: setFocus,
        getCurrentFocusedElement: function() { return currentFocusedElement; },
        focusInitialElement: focusInitialElement,
        enable: function() { isNavigationEnabled = true; },
        disable: function() { isNavigationEnabled = false; },
        KEY_CODES: KEY_CODES
    };
})();
