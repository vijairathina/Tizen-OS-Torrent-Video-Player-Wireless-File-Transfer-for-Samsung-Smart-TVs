/**
 * Main Application Orchestrator for Samsung Tizen TV
 * Initializes navigation, filesystem, receiver, file manager, and Amnis player.
 */

window.App = (function() {
    'use strict';

    let currentView = 'home';

    window.onerror = function(msg, url, lineNo, colNo, error) {
        const errStr = `[TV EXCEPTION] ${msg} (${url}:${lineNo})`;
        console.error(errStr);
        if (window.FileReceiver && window.FileReceiver.sendSocketMessage) {
            window.FileReceiver.sendSocketMessage(errStr);
        }
        return false;
    };

    function scrollActiveViewToTop() {
        try {
            window.scrollTo(0, 0);
            if (document.documentElement) document.documentElement.scrollTop = 0;
            if (document.body) document.body.scrollTop = 0;

            const appMain = document.querySelector('.app-main');
            if (appMain) appMain.scrollTop = 0;

            const allViews = document.querySelectorAll('.app-view');
            allViews.forEach(function(v) {
                v.scrollTop = 0;
            });

            const scrollables = document.querySelectorAll(
                '#view-home, .home-container, .file-grid, .queue-list, .transfer-list, ' +
                '.player-downloads-list, .amnis-downloads-list, .media-carousel-container'
            );
            scrollables.forEach(function(el) {
                el.scrollTop = 0;
            });
        } catch (e) {
            console.warn('[App] scrollActiveViewToTop error:', e);
        }
    }

    function init() {
        console.log('[App] Initializing LinkPlay...');

        // Setup tab navigation clicks - keep focus on tab and scroll to top
        const tabHome = document.getElementById('tab-home');
        const tabReceiver = document.getElementById('tab-receiver');
        const tabFileManager = document.getElementById('tab-filemanager');
        const tabPlayer = document.getElementById('tab-player') || document.getElementById('tab-amnis');

        function bindNavTab(tabEl, viewName) {
            if (!tabEl) return;
            tabEl.addEventListener('click', function(e) {
                switchView(viewName, false);
                scrollActiveViewToTop();
                if (window.Navigation) {
                    window.Navigation.setFocus(tabEl);
                }
            });
        }

        bindNavTab(tabHome, 'home');
        bindNavTab(tabPlayer, 'player');
        bindNavTab(tabReceiver, 'receiver');
        bindNavTab(tabFileManager, 'filemanager');

        // Initialize modules
        window.Navigation.init();
        window.Player.init();
        window.FileManager.init();
        const playerModule = window.VideoPlayer || window.Amnis;
        if (playerModule && playerModule.init) playerModule.init();
        window.FileReceiver.init();
        if (window.HomeLauncher && window.HomeLauncher.init) window.HomeLauncher.init();

        // Render Home QR Code initially
        if (window.FileReceiver && window.FileReceiver.renderQRCode) {
            window.FileReceiver.renderQRCode('home-qrcode-container');
        }

        // Initialize Filesystem with storage listener
        window.TVFilesystem.init(function(storages, selected) {
            window.FileManager.onStorageUpdated(storages, selected);
            updateTargetUsbBadge(selected);
            if (window.HomeLauncher && window.HomeLauncher.refresh) {
                window.HomeLauncher.refresh();
            }
        });

        console.log('[App] Application ready on Home Launcher.');
    }

    function switchView(viewName, shouldFocusView = false) {
        if (viewName === 'amnis') viewName = 'player';

        // Always reset scrolling to top when switching views or clicking any tab
        scrollActiveViewToTop();

        if (currentView === viewName) {
            if (viewName === 'home') {
                if (window.HomeLauncher && window.HomeLauncher.refresh) window.HomeLauncher.refresh();
                if (window.FileReceiver && window.FileReceiver.renderQRCode) window.FileReceiver.renderQRCode('home-qrcode-container');
            } else if (viewName === 'receiver') {
                if (window.FileReceiver && window.FileReceiver.renderQRCode) window.FileReceiver.renderQRCode('qrcode-container');
            }
            return;
        }

        // Hide current view
        const currentViewEl = document.getElementById(`view-${currentView}`) || (currentView === 'player' ? document.getElementById('view-amnis') : null);
        const currentTabEl = document.getElementById(`tab-${currentView}`) || (currentView === 'player' ? document.getElementById('tab-amnis') : null);
        if (currentViewEl) currentViewEl.classList.remove('active-view');
        if (currentTabEl) currentTabEl.classList.remove('active');

        // Show target view
        currentView = viewName;
        const targetViewEl = document.getElementById(`view-${currentView}`) || (currentView === 'player' ? document.getElementById('view-amnis') : null);
        const targetTabEl = document.getElementById(`tab-${currentView}`) || (currentView === 'player' ? document.getElementById('tab-amnis') : null);
        if (targetViewEl) targetViewEl.classList.add('active-view');
        if (targetTabEl) targetTabEl.classList.add('active');

        // Refresh components when switching views
        if (viewName === 'home') {
            if (window.HomeLauncher && window.HomeLauncher.refresh) {
                window.HomeLauncher.refresh();
            }
            if (window.FileReceiver && window.FileReceiver.renderQRCode) {
                window.FileReceiver.renderQRCode('home-qrcode-container');
            }
        } else if (viewName === 'filemanager' || viewName === 'receiver') {
            if (viewName === 'receiver') {
                if (window.FileReceiver && window.FileReceiver.clearReceiverTabAlert) {
                    window.FileReceiver.clearReceiverTabAlert();
                }
                if (window.FileReceiver && window.FileReceiver.renderQRCode) {
                    window.FileReceiver.renderQRCode('qrcode-container');
                }
            }
            window.TVFilesystem.refreshStorages(function(storages, selected) {
                window.FileManager.onStorageUpdated(storages, selected);
                updateTargetUsbBadge(selected);
            });
        } else if (viewName === 'player' || viewName === 'amnis') {
            const playerModule = window.VideoPlayer || window.Amnis;
            if (playerModule && playerModule.refreshRPiDownloads) {
                playerModule.refreshRPiDownloads();
            } else if (playerModule && playerModule.renderDownloadsList) {
                playerModule.renderDownloadsList();
            }
        }

        // Only move focus into the view if explicitly requested (e.g. from Home tile click)
        if (shouldFocusView && window.Navigation) {
            setTimeout(window.Navigation.focusInitialElement, 50);
        }
    }

    function updateTargetUsbBadge(selectedStorage) {
        const badge = document.getElementById('receiver-usb-target');
        const usbStatusBadge = document.getElementById('usb-status-badge');
        if (!badge) return;

        // Make receiver target box clickable to easily toggle storage mode
        if (!badge._hasClickListener) {
            badge._hasClickListener = true;
            badge.addEventListener('click', function() {
                if (window.VideoPlayer && window.VideoPlayer.openSettingsDialog) {
                    window.VideoPlayer.openSettingsDialog();
                }
            });
        }

        const pref = window.TVFilesystem ? window.TVFilesystem.getPreferredStorage() : 'usb';

        if (pref === 'server' || (selectedStorage && selectedStorage.isServer)) {
            const hostIp = window.getServerHostIP ? window.getServerHostIP() : '192.168.0.14';
            badge.innerHTML = `
                <div class="usb-target-title" style="color:#c084fc;"><span>🖥️</span><span>Target: Server</span></div>
                <div class="usb-target-path">${hostIp}:8080 • /app/uploads/ (Zero TV Space)</div>
                <div class="usb-target-hint" style="font-size:11px; color:var(--text-muted); margin-top:4px;">Press Enter to switch: Local / USB / Server</div>
            `;
            if (usbStatusBadge) {
                usbStatusBadge.innerHTML = `<span class="status-dot active" style="background:#a855f7;box-shadow:0 0 8px #a855f7;"></span><span>Server Storage</span>`;
            }
        } else if (selectedStorage && selectedStorage.isUsb) {
            badge.innerHTML = `
                <div class="usb-target-title" style="color:#10b981;"><span>💾</span><span>Target: ${selectedStorage.displayName || selectedStorage.label} (USB)</span></div>
                <div class="usb-target-path">${selectedStorage.label}/TVFileHub/Received/</div>
                <div class="usb-target-hint" style="font-size:11px; color:var(--text-muted); margin-top:4px;">Press Enter to switch: Local / USB / Server</div>
            `;
            if (usbStatusBadge) {
                usbStatusBadge.innerHTML = `<span class="status-dot active"></span><span>USB: ${selectedStorage.label}</span>`;
            }
        } else {
            const locLabel = (selectedStorage && selectedStorage.label) ? selectedStorage.label : 'downloads';
            badge.innerHTML = `
                <div class="usb-target-title" style="color:var(--primary-cyan);"><span>📱</span><span>Target: Local Storage (TV Flash)</span></div>
                <div class="usb-target-path">${locLabel}/TVFileHub/Received/</div>
                <div class="usb-target-hint" style="font-size:11px; color:var(--text-muted); margin-top:4px;">Press Enter to switch: Local / USB / Server</div>
            `;
            if (usbStatusBadge) {
                usbStatusBadge.innerHTML = `<span class="status-dot active" style="background:#00f2fe;box-shadow:0 0 8px #00f2fe;"></span><span>Local Storage</span>`;
            }
        }
    }

    return {
        init: init,
        switchView: switchView,
        scrollActiveViewToTop: scrollActiveViewToTop,
        getCurrentView: function() { return currentView; },
        updateTargetUsbBadge: updateTargetUsbBadge
    };
})();

// Bootstrap when DOM is loaded
window.addEventListener('load', function() {
    window.App.init();
});
