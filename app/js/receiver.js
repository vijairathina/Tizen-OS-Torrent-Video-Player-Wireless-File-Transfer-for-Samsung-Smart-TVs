/**
 * File Receiver Engine for Samsung Tizen TV
 * Manages QR Code rendering, real-time WebSocket connection to companion bridge,
 * persistent Received Files list, direct saving to Local/USB storage,
 * and 1-click launch into Amnis Player for .torrent and video files.
 */

window.FileReceiver = (function() {
    'use strict';

    let localIP = '192.168.0.12';
    let serverHostIP = '192.168.0.13';
    let transferPort = 8080;
    let senderUrl = '';
    let qrcodeInstance = null;
    let transferQueue = [];
    let websocketClient = null;

    const STORAGE_KEY = 'tvfilehub_received_history_v2';

    function init() {
        detectLocalNetwork();
        renderQRCode();
        loadSavedHistory();
        setupCompanionSocket();
        setupQueueActionButtons();
    }

    function detectLocalNetwork() {
        if (typeof tizen !== 'undefined' && tizen.systeminfo) {
            try {
                tizen.systeminfo.getPropertyValue('WIFI_NETWORK', function(wifi) {
                    if (wifi.ipAddress) {
                        localIP = wifi.ipAddress;
                        updateNetworkDisplay();
                    }
                });
            } catch (e) {
                console.warn('[FileReceiver] wifi info read error:', e);
            }
        }
        updateNetworkDisplay();
    }

    function updateNetworkDisplay() {
        senderUrl = `http://${serverHostIP}:${transferPort}`;

        const ipEl = document.getElementById('tv-ip-display');
        const portEl = document.getElementById('tv-port-display');
        const urlEl = document.getElementById('tv-url-display');

        if (ipEl) ipEl.textContent = localIP;
        if (portEl) portEl.textContent = transferPort;
        if (urlEl) urlEl.textContent = senderUrl;

        renderQRCode();
    }

    function renderQRCode() {
        const qrContainer = document.getElementById('qrcode-container');
        if (!qrContainer) return;

        qrContainer.innerHTML = '';
        if (typeof QRCode !== 'undefined') {
            try {
                qrcodeInstance = new QRCode(qrContainer, {
                    text: senderUrl,
                    width: 200,
                    height: 200,
                    colorDark: '#0f0c13',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.M
                });
            } catch (err) {
                console.error('[FileReceiver] QR code error:', err);
                qrContainer.innerHTML = `<div style="padding:20px;color:#fff;">${senderUrl}</div>`;
            }
        }
    }

    /**
     * Loads received history from localStorage and populates the Received Files list
     */
    function loadSavedHistory() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const history = JSON.parse(raw);
                if (Array.isArray(history) && history.length > 0) {
                    history.forEach(item => {
                        createCompletedCard(item);
                    });
                    updateQueueStats();
                }
            }
        } catch (e) {
            console.warn('[FileReceiver] Could not load saved history:', e);
        }
    }

    function saveToHistory(item) {
        try {
            let history = [];
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) history = JSON.parse(raw);
            if (!Array.isArray(history)) history = [];

            // Remove existing duplicate by name
            history = history.filter(h => h.name !== item.name);
            history.unshift(item);
            if (history.length > 30) history.pop();

            localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
        } catch (e) {
            console.warn('[FileReceiver] Could not save history:', e);
        }
    }

    function removeFromHistory(filename) {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                let history = JSON.parse(raw);
                if (Array.isArray(history)) {
                    history = history.filter(h => h.name !== filename);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
                }
            }
        } catch (e) {
            console.warn('[FileReceiver] Could not remove from history:', e);
        }
    }

    function deleteReceivedItem(item, card) {
        const name = item.name || item.filename;
        const isUsb = !!item.isUsb;
        console.log('[FileReceiver] Deleting received item:', name);

        // 1. Delete from local disk
        if (window.TVFilesystem && window.TVFilesystem.deleteFile) {
            window.TVFilesystem.deleteFile(name, isUsb, function(err) {
                if (err) console.warn('[FileReceiver] TVFilesystem delete error:', err);
            });
        }

        // 2. Delete from host server and stop torrent if active
        fetch(`http://${serverHostIP}:${transferPort}/delete_file?file=${encodeURIComponent(name)}`)
            .catch(e => console.warn('[FileReceiver] Server delete error:', e));

        // 3. Remove from storage history
        removeFromHistory(name);

        // 4. Remove from queue list
        transferQueue = transferQueue.filter(t => t.filename !== name && t.id !== item.id);
        updateQueueStats();

        // 5. Animate card removal
        if (card) {
            card.style.opacity = '0';
            card.style.transform = 'scale(0.9)';
            setTimeout(() => {
                card.remove();
                const queueList = document.getElementById('transfer-queue-list');
                const remaining = queueList ? queueList.querySelectorAll('.transfer-card') : [];
                if (remaining.length === 0) {
                    const emptyState = document.getElementById('receiver-empty-state');
                    if (emptyState) emptyState.style.display = 'flex';
                }
                if (window.Navigation) window.Navigation.focusInitialElement();
            }, 250);
        }

        showToast(`Deleted: ${name}`);
    }

    function setupQueueActionButtons() {
        const clearBtn = document.getElementById('receiver-clear-list-btn');
        const delAllBtn = document.getElementById('receiver-delete-all-btn');

        if (clearBtn) {
            clearBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                clearReceivedList();
            });
        }

        if (delAllBtn) {
            delAllBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                deleteAllReceivedFiles();
            });
        }
    }

    function clearReceivedList() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {}
        transferQueue = [];
        const queueList = document.getElementById('transfer-queue-list');
        if (queueList) {
            const cards = queueList.querySelectorAll('.transfer-card');
            cards.forEach(c => c.remove());
        }
        const emptyState = document.getElementById('receiver-empty-state');
        if (emptyState) emptyState.style.display = 'flex';
        updateQueueStats();
        showToast('Received files list cleared.');
        if (window.Navigation) window.Navigation.focusInitialElement();
    }

    function deleteAllReceivedFiles() {
        let history = [];
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) history = JSON.parse(raw);
        } catch (e) {}

        const itemsToDelete = Array.isArray(history) ? history.slice() : [];
        transferQueue.forEach(t => {
            const name = t.filename || t.name;
            if (name && !itemsToDelete.some(h => (h.name || h.filename) === name)) {
                itemsToDelete.push({ name: name, isUsb: false });
            }
        });

        if (itemsToDelete.length === 0) {
            showToast('No received files to delete.');
            return;
        }

        itemsToDelete.forEach(item => {
            const name = item.name || item.filename;
            if (!name) return;
            if (window.TVFilesystem && window.TVFilesystem.deleteFile) {
                window.TVFilesystem.deleteFile(name, !!item.isUsb, function() {});
            }
            fetch(`http://${serverHostIP}:${transferPort}/delete_file?file=${encodeURIComponent(name)}`)
                .catch(e => console.warn('[FileReceiver] Server delete error:', e));
        });

        clearReceivedList();
        showToast(`Deleted all ${itemsToDelete.length} received files from storage.`);
        if (window.FileManager && window.FileManager.refreshCurrentFolder) {
            window.FileManager.refreshCurrentFolder();
        }
    }

    function setupCompanionSocket() {
        const wsUrl = `ws://${serverHostIP}:${transferPort}/ws`;
        try {
            websocketClient = new WebSocket(wsUrl);

            websocketClient.onopen = function() {
                console.log('[FileReceiver] Connected to companion file transfer bridge.');
                const badge = document.getElementById('wifi-status-badge');
                if (badge) {
                    badge.innerHTML = '<span class="status-dot active"></span><span>Receiver Ready</span>';
                }
            };

            websocketClient.onmessage = function(event) {
                try {
                    const data = JSON.parse(event.data);
                    handleIncomingSocketMessage(data);
                } catch (e) {
                    console.error('[FileReceiver] Invalid socket payload:', e);
                }
            };

            websocketClient.onclose = function() {
                const badge = document.getElementById('wifi-status-badge');
                if (badge) {
                    badge.innerHTML = '<span class="status-dot"></span><span>Connecting...</span>';
                }
                setTimeout(setupCompanionSocket, 3000);
            };

            websocketClient.onerror = function(err) {
                console.warn('[FileReceiver] WebSocket error:', err);
            };
        } catch (e) {
            console.warn('[FileReceiver] WebSocket initialization skipped:', e);
            setTimeout(setupCompanionSocket, 5000);
        }
    }

    function handleIncomingSocketMessage(msg) {
        console.log('[FileReceiver] Handling message:', msg);
        if (!msg || !msg.type) return;

        if (msg.type === 'file_upload_start') {
            ensureTransferItem(msg.fileId, msg.filename, msg.totalBytes);
            showToast(`Receiving: ${msg.filename}`);
            triggerReceiverTabAlert();
        } else if (msg.type === 'file_upload_progress') {
            ensureTransferItem(msg.fileId, msg.filename, msg.totalBytes);
            updateTransferItemProgress(msg.fileId, msg.receivedBytes, msg.totalBytes, msg.speed);
        } else if (msg.type === 'file_upload_complete') {
            ensureTransferItem(msg.fileId, msg.filename, msg.totalBytes);
            fetchAndSaveToStorage(msg.fileId, msg.filename, msg.totalBytes, msg.downloadUrl);
            triggerReceiverTabAlert();
        } else if (msg.type === 'torrent_stream_started') {
            const playerModule = window.VideoPlayer || window.Amnis;
            if (playerModule && playerModule.onTorrentStreamStarted) {
                playerModule.onTorrentStreamStarted(msg.streamUrl, msg.title, msg.filename);
            }
        } else if (msg.type === 'torrent_stats_update') {
            const playerModule = window.VideoPlayer || window.Amnis;
            if (playerModule && playerModule.onTorrentStatsUpdate) {
                playerModule.onTorrentStatsUpdate(msg);
            }
        }
    }

    function ensureTransferItem(fileId, filename, totalBytes) {
        let item = transferQueue.find(t => t.id === fileId);
        if (!item) {
            createTransferItem(fileId, filename, totalBytes);
            item = transferQueue.find(t => t.id === fileId);
        }
        return item;
    }

    function createTransferItem(fileId, filename, totalBytes) {
        const queueList = document.getElementById('transfer-queue-list');
        const emptyState = document.getElementById('receiver-empty-state');
        if (emptyState) emptyState.style.display = 'none';

        const item = {
            id: fileId,
            filename: filename,
            totalBytes: totalBytes || 0,
            status: 'receiving',
            element: null
        };

        const card = document.createElement('div');
        card.className = 'transfer-card focusable';
        card.id = `transfer-${fileId}`;
        card.innerHTML = `
            <div class="transfer-top">
                <span class="transfer-filename" title="${filename}">${filename}</span>
                <span class="transfer-status-badge status-receiving" id="status-badge-${fileId}">Receiving...</span>
            </div>
            <div class="progress-track">
                <div class="progress-fill" id="progress-bar-${fileId}" style="width: 25%;"></div>
            </div>
            <div class="transfer-meta">
                <span id="transfer-bytes-${fileId}">Transferring from phone...</span>
                <span id="transfer-speed-${fileId}">${window.TVFilesystem.formatBytes(totalBytes)}</span>
            </div>
            <div id="transfer-actions-${fileId}" style="margin-top: 10px; display: none;"></div>
        `;

        if (queueList) {
            queueList.prepend(card);
        }
        item.element = card;
        transferQueue.push(item);
        updateQueueStats();
    }

    function createCompletedCard(item) {
        const queueList = document.getElementById('transfer-queue-list');
        const emptyState = document.getElementById('receiver-empty-state');
        if (emptyState) emptyState.style.display = 'none';

        const fileId = item.id || `hist-${Math.random().toString(36).substr(2, 6)}`;
        const isTorrent = item.name.toLowerCase().endsWith('.torrent');
        const isVideo = /\.(mp4|mkv|avi|mov|webm|ts)$/i.test(item.name);

        const card = document.createElement('div');
        card.className = 'transfer-card focusable';
        card.id = `transfer-${fileId}`;
        card.tabIndex = 0;

        const actionText = isTorrent ? '▶️ Play in Video Player' : (isVideo ? '▶️ Play Video' : '📁 Open in Manager');
        const badgeText = item.isUsb ? 'Saved to USB ✓' : 'Saved to Local Storage ✓';

        card.innerHTML = `
            <div class="transfer-top">
                <span class="transfer-filename" title="${item.name}">${item.name}</span>
                <span class="transfer-status-badge status-completed">${badgeText}</span>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style="width: 100%;"></div>
            </div>
            <div class="transfer-meta" style="align-items: center; justify-content: space-between;">
                <span>${window.TVFilesystem.formatBytes(item.size)} • Ready</span>
                <div class="card-actions-row">
                    <button class="action-btn-play focusable" id="btn-play-${fileId}" tabindex="0" style="
                        background: linear-gradient(135deg, #7b2cbf 0%, #00f2fe 100%);
                        color: #fff;
                        border: none;
                        border-radius: 8px;
                        padding: 6px 14px;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                    ">${actionText}</button>
                    <button class="action-btn-delete focusable" id="btn-del-${fileId}" tabindex="0" title="Delete File">🗑️ Delete</button>
                </div>
            </div>
        `;

        const playBtn = card.querySelector(`#btn-play-${fileId}`);
        const delBtn = card.querySelector(`#btn-del-${fileId}`);
        const launchAction = () => {
            console.log('[FileReceiver] Launching action for:', item.name);
            showToast(`Opening ${item.name}...`);
            if (isTorrent) {
                if (window.App) window.App.switchView('player');
                const playerModule = window.VideoPlayer || window.Amnis;
                if (playerModule) {
                    playerModule.registerTorrentDownload(item.name, item.size, item.streamUrl);
                    playerModule.startTorrentStream(item.name, item.size, item.streamUrl);
                }
            } else if (isVideo) {
                window.Player.openMedia(item.streamUrl || item.path, item.name);
            } else {
                if (window.App) window.App.switchView('filemanager');
            }
        };

        if (playBtn) playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            launchAction();
        });
        if (delBtn) delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteReceivedItem(item, card);
        });
        card.addEventListener('click', launchAction);

        if (queueList) {
            queueList.appendChild(card);
        }
        transferQueue.push({ id: fileId, filename: item.name, totalBytes: item.size, status: 'completed' });
    }

    function updateTransferItemProgress(fileId, transferred, total, speedStr) {
        const item = transferQueue.find(t => t.id === fileId);
        if (!item) return;

        const percent = total > 0 ? Math.floor((transferred / total) * 100) : 50;
        const bar = document.getElementById(`progress-bar-${fileId}`);
        const bytesText = document.getElementById(`transfer-bytes-${fileId}`);
        const speedText = document.getElementById(`transfer-speed-${fileId}`);

        if (bar) bar.style.width = `${Math.max(percent, 20)}%`;
        if (bytesText) bytesText.textContent = `${window.TVFilesystem.formatBytes(transferred)} / ${window.TVFilesystem.formatBytes(total)}`;
        if (speedText) speedText.textContent = speedStr || `${percent}%`;
    }

    /**
     * Downloads file payload from companion bridge and writes directly to storage (USB or Internal)
     */
    function fetchAndSaveToStorage(fileId, filename, totalBytes, downloadUrl) {
        const statusBadge = document.getElementById(`status-badge-${fileId}`);
        const bytesText = document.getElementById(`transfer-bytes-${fileId}`);
        const bar = document.getElementById(`progress-bar-${fileId}`);

        const storage = window.TVFilesystem.getSelectedStorage();
        const destType = (storage && storage.isUsb) ? 'USB' : 'Local Storage';

        if (statusBadge) {
            statusBadge.className = 'transfer-status-badge status-saving';
            statusBadge.textContent = `Saving to ${destType}...`;
        }
        if (bytesText) bytesText.textContent = 'Writing to storage...';
        if (bar) bar.style.width = '65%';

        const fetchUrl = downloadUrl.startsWith('http') ? downloadUrl : `http://${serverHostIP}:${transferPort}${downloadUrl}`;
        
        sendSocketMessage(`[FileReceiver] Fetching file from ${fetchUrl} (${totalBytes} bytes)...`);

        fetch(fetchUrl)
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.arrayBuffer();
            })
            .then(arrayBuffer => {
                sendSocketMessage(`[FileReceiver] Downloaded buffer: ${arrayBuffer.byteLength} bytes. Passing to TVFilesystem...`);
                window.TVFilesystem.saveFileToStorage(
                    filename,
                    arrayBuffer,
                    function(percent) {
                        if (bar) bar.style.width = `${Math.max(percent, 75)}%`;
                    },
                    function(err, savedInfo) {
                        if (err || !savedInfo) {
                            console.error('[FileReceiver] Storage write error:', err);
                            const errMsg = err ? err.message : 'Unknown write error';
                            sendSocketMessage(`[FileReceiver] Storage write error: ${errMsg}`);
                            markTransferFailed(fileId, 'Write Error: ' + errMsg);
                            showToast(`Failed writing to storage: ${errMsg}`);
                            return;
                        }

                        // Mark completed with verified disk write
                        const finalName = savedInfo.name;
                        const isUsb = savedInfo.isUsb;
                        const wasFallback = !!savedInfo.fallbackFromUsb;
                        const finalSize = savedInfo.size || totalBytes || arrayBuffer.byteLength;

                        sendSocketMessage(`[FileReceiver] Save completed: ${finalName} (${finalSize} bytes) on ${isUsb ? 'USB' : (wasFallback ? 'Internal (Fallback)' : 'Internal')}`);

                        markTransferCompleted(fileId, finalName, isUsb, fetchUrl, finalSize);

                        // Save to persistent history
                        saveToHistory({
                            id: fileId,
                            name: finalName,
                            size: finalSize,
                            isUsb: isUsb,
                            streamUrl: finalName.toLowerCase().endsWith('.torrent') ? '' : fetchUrl,
                            timestamp: Date.now()
                        });

                        const loc = isUsb ? 'USB' : (wasFallback ? 'Internal Storage (USB read-only)' : 'Internal Storage');
                        showToast(`Saved to ${loc}: ${finalName}`);

                        // If user sent a .torrent file, auto-prompt to play in Video Player
                        if (finalName.toLowerCase().endsWith('.torrent')) {
                            showToast(`Torrent Ready! Click 'Play in Video Player' to start streaming.`);
                        }

                        if (window.FileManager) {
                            window.FileManager.refreshCurrentFolder();
                        }
                    }
                );
            })
            .catch(err => {
                sendSocketMessage(`[FileReceiver] Network / Download error: ${err.message}`);
                markTransferFailed(fileId, 'Network Error');
                console.error('[FileReceiver] Download error:', err);
                showToast(`Transfer failed: ${err.message}`);
            });
    }

    function markTransferCompleted(fileId, finalName, isUsb, streamUrl, totalBytes) {
        const statusBadge = document.getElementById(`status-badge-${fileId}`);
        const bar = document.getElementById(`progress-bar-${fileId}`);
        const bytesText = document.getElementById(`transfer-bytes-${fileId}`);
        const actionsDiv = document.getElementById(`transfer-actions-${fileId}`);
        const card = document.getElementById(`transfer-${fileId}`);

        const isTorrent = finalName.toLowerCase().endsWith('.torrent');
        const isVideo = /\.(mp4|mkv|avi|mov|webm|ts)$/i.test(finalName);
        const actionText = isTorrent ? '▶️ Play in Video Player' : (isVideo ? '▶️ Play Video' : '📁 Open');

        if (statusBadge) {
            statusBadge.className = 'transfer-status-badge status-completed';
            statusBadge.textContent = isUsb ? 'Saved to USB ✓' : 'Saved to Local Storage ✓';
        }
        if (bar) bar.style.width = '100%';
        if (bytesText) bytesText.textContent = `${window.TVFilesystem.formatBytes(totalBytes)} • Ready`;

        if (actionsDiv) {
            actionsDiv.style.display = 'block';
            actionsDiv.innerHTML = `
                <div class="card-actions-row" style="margin-top: 6px;">
                    <button class="action-btn-play focusable" id="btn-play-${fileId}" tabindex="0" style="
                        background: linear-gradient(135deg, #7b2cbf 0%, #00f2fe 100%);
                        color: #fff;
                        border: none;
                        border-radius: 8px;
                        padding: 8px 16px;
                        font-size: 14px;
                        font-weight: 600;
                        cursor: pointer;
                    ">${actionText}</button>
                    <button class="action-btn-delete focusable" id="btn-del-${fileId}" tabindex="0" style="padding: 8px 16px; font-size: 14px;">🗑️ Delete</button>
                </div>
            `;

            const btn = actionsDiv.querySelector(`#btn-play-${fileId}`);
            const delBtn = actionsDiv.querySelector(`#btn-del-${fileId}`);
            const launch = () => {
                console.log('[FileReceiver] Launch triggered for:', finalName);
                showToast(`Opening ${finalName}...`);
                if (isTorrent) {
                    if (window.App) window.App.switchView('player');
                    const playerModule = window.VideoPlayer || window.Amnis;
                    if (playerModule) {
                        playerModule.registerTorrentDownload(finalName, totalBytes, streamUrl);
                        playerModule.startTorrentStream(finalName, totalBytes, streamUrl);
                    }
                } else if (isVideo) {
                    window.Player.openMedia(streamUrl, finalName);
                } else {
                    if (window.App) window.App.switchView('filemanager');
                }
            };
            if (btn) btn.addEventListener('click', (e) => {
                e.stopPropagation();
                launch();
            });
            if (delBtn) delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteReceivedItem({ name: finalName, filename: finalName, isUsb: isUsb, id: fileId }, card);
            });
            if (card) card.addEventListener('click', launch);
        }

        const item = transferQueue.find(t => t.id === fileId);
        if (item) item.status = 'completed';

        updateQueueStats();
    }

    function markTransferFailed(fileId, reason) {
        const statusBadge = document.getElementById(`status-badge-${fileId}`);
        if (statusBadge) {
            statusBadge.className = 'transfer-status-badge status-failed';
            statusBadge.textContent = reason || 'Failed';
        }
        const item = transferQueue.find(t => t.id === fileId);
        if (item) item.status = 'failed';
        updateQueueStats();
    }

    function updateQueueStats() {
        const statsEl = document.getElementById('queue-stats-display');
        if (!statsEl) return;
        const total = transferQueue.length;
        const completed = transferQueue.filter(t => t.status === 'completed').length;
        statsEl.textContent = `${completed} / ${total} files saved`;
    }

    function showToast(message) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast-msg';
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    }

    function sendSocketMessage(msg) {
        if (websocketClient && websocketClient.readyState === WebSocket.OPEN) {
            try {
                websocketClient.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
            } catch (e) {}
        }
    }

    function triggerReceiverTabAlert() {
        const dot = document.getElementById('receiver-badge-dot');
        const tab = document.getElementById('tab-receiver');
        if (dot) {
            dot.style.display = 'inline-block';
            dot.textContent = '● New';
        }
        if (tab) {
            tab.classList.add('tab-alert-pulse');
        }
    }

    function clearReceiverTabAlert() {
        const dot = document.getElementById('receiver-badge-dot');
        const tab = document.getElementById('tab-receiver');
        if (dot) dot.style.display = 'none';
        if (tab) tab.classList.remove('tab-alert-pulse');
    }

    return {
        init: init,
        showToast: showToast,
        sendSocketMessage: sendSocketMessage,
        triggerReceiverTabAlert: triggerReceiverTabAlert,
        clearReceiverTabAlert: clearReceiverTabAlert,
        setServerHostIP: function(ip) {
            serverHostIP = ip;
            updateNetworkDisplay();
        }
    };
})();
