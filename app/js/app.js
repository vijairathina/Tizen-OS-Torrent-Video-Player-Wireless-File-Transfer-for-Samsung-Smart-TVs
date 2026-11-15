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

    function init() {
        console.log('[App] Initializing TV File Hub & Video Player...');

        // Setup tab navigation clicks
        const tabHome = document.getElementById('tab-home');
        const tabReceiver = document.getElementById('tab-receiver');
        const tabFileManager = document.getElementById('tab-filemanager');
        const tabPlayer = document.getElementById('tab-player') || document.getElementById('tab-amnis');

        if (tabHome) {
            tabHome.addEventListener('click', () => switchView('home'));
        }
        if (tabReceiver) {
            tabReceiver.addEventListener('click', () => switchView('receiver'));
        }
        if (tabFileManager) {
            tabFileManager.addEventListener('click', () => switchView('filemanager'));
        }
        if (tabPlayer) {
            tabPlayer.addEventListener('click', () => switchView('player'));
        }

        // Initialize modules
        window.Navigation.init();
        window.Player.init();
        window.FileManager.init();
        const playerModule = window.VideoPlayer || window.Amnis;
        if (playerModule && playerModule.init) playerModule.init();
        window.FileReceiver.init();
        if (window.HomeLauncher && window.HomeLauncher.init) window.HomeLauncher.init();

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

    function switchView(viewName) {
        if (viewName === 'amnis') viewName = 'player';
        if (currentView === viewName) return;

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
        } else if (viewName === 'filemanager' || viewName === 'receiver') {
            if (viewName === 'receiver' && window.FileReceiver && window.FileReceiver.clearReceiverTabAlert) {
                window.FileReceiver.clearReceiverTabAlert();
            }
            window.TVFilesystem.refreshStorages(function(storages, selected) {
                window.FileManager.onStorageUpdated(storages, selected);
                updateTargetUsbBadge(selected);
            });
        } else if (viewName === 'player' || viewName === 'amnis') {
            const playerModule = window.VideoPlayer || window.Amnis;
            if (playerModule && playerModule.renderDownloadsList) {
                playerModule.renderDownloadsList();
            }
        }

        // Re-focus first element in new view
        if (window.Navigation) {
            setTimeout(window.Navigation.focusInitialElement, 80);
        }
    }

    function updateTargetUsbBadge(selectedStorage) {
        const badge = document.getElementById('receiver-usb-target');
        const usbStatusBadge = document.getElementById('usb-status-badge');
        if (!badge) return;

        if (selectedStorage && selectedStorage.isUsb) {
            badge.innerHTML = `
                <div class="usb-target-title"><span>💾</span><span>Target: ${selectedStorage.label} (USB)</span></div>
                <div class="usb-target-path">${selectedStorage.label}/TVFileHub/Received/</div>
            `;
            if (usbStatusBadge) {
                usbStatusBadge.innerHTML = `<span class="status-dot active"></span><span>USB: ${selectedStorage.label}</span>`;
            }
        } else {
            const locLabel = (selectedStorage && selectedStorage.label) ? selectedStorage.label : 'downloads';
            badge.innerHTML = `
                <div class="usb-target-title" style="color:var(--cyan);"><span>📱</span><span>Target: Internal TV Storage (Local)</span></div>
                <div class="usb-target-path">${locLabel}/TVFileHub/Received/</div>
            `;
            if (usbStatusBadge) {
                usbStatusBadge.innerHTML = `<span class="status-dot active" style="background:#00f2fe;box-shadow:0 0 8px #00f2fe;"></span><span>Local Storage</span>`;
            }
        }
    }

    return {
        init: init,
        switchView: switchView,
        getCurrentView: function() { return currentView; }
    };
})();

// Bootstrap when DOM is loaded
window.addEventListener('load', function() {
    window.App.init();
});
