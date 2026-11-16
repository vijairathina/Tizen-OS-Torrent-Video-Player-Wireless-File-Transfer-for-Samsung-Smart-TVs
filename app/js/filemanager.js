/**
 * Module 2: File Manager Engine for Samsung Tizen TV
 * Complete filesystem navigation, parent directory traversal,
 * quick access shortcuts, file deletion, and direct media playback / Amnis integration.
 */

window.FileManager = (function() {
    'use strict';

    let currentPath = '';
    let currentStorageRoot = '';
    let currentFiles = [];

    function init() {
        setupEvents();
    }

    function setupEvents() {
        const refreshBtn = document.getElementById('fm-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function() {
                window.FileReceiver.showToast('Scanning storage devices...');
                window.TVFilesystem.refreshStorages(function(storages, selected) {
                    renderStoragePills(storages, selected);
                    const usbCount = storages.filter(s => s.isUsb).length;
                    if (usbCount > 0) {
                        window.FileReceiver.showToast(`Connected: ${storages.find(s => s.isUsb).displayName}`);
                    } else {
                        window.FileReceiver.showToast('Showing Internal Storage.');
                    }
                    if (selected) {
                        currentStorageRoot = selected.label;
                        navigateTo(selected.label);
                    }
                });
            });
        }

        const upBtn = document.getElementById('fm-up-btn');
        if (upBtn) {
            upBtn.addEventListener('click', function() {
                navigateUp();
            });
        }

        const rootBtn = document.getElementById('fm-root-btn');
        if (rootBtn) {
            rootBtn.addEventListener('click', function() {
                if (currentStorageRoot) {
                    navigateTo(currentStorageRoot);
                }
            });
        }

        const receivedBtn = document.getElementById('fm-received-btn');
        if (receivedBtn) {
            receivedBtn.addEventListener('click', function() {
                const root = currentStorageRoot || 'wgt-private';
                const recPath = `${root}/TVFileHub/Received`;
                navigateTo(recPath);
            });
        }
    }

    function onStorageUpdated(storages, selectedStorage) {
        renderStoragePills(storages, selectedStorage);
        if (selectedStorage) {
            currentStorageRoot = selectedStorage.label;
            // If already on a valid path under this storage, refresh it; otherwise start at root
            if (currentPath && currentPath.startsWith(currentStorageRoot)) {
                navigateTo(currentPath);
            } else {
                navigateTo(currentStorageRoot);
            }
        } else {
            renderEmptyDriveState();
        }
    }

    function renderStoragePills(storages, activeStorage) {
        const container = document.getElementById('storage-pills-container');
        const capacityText = document.getElementById('storage-capacity-text');

        if (!container) return;
        container.innerHTML = '';

        const safeStorages = Array.isArray(storages) ? storages : [];
        const internalStorage = safeStorages.find(s => !s.isUsb) || {
            label: 'wgt-private',
            displayName: 'Internal TV Storage (Local)',
            isUsb: false,
            availableSize: 1024 * 1024 * 1024 * 3,
            totalSize: 1024 * 1024 * 1024 * 8
        };
        const usbStorage = safeStorages.find(s => s.isUsb) || null;

        // Pill 1: Internal TV Storage (Local)
        const isInternalActive = activeStorage ? !activeStorage.isUsb : true;
        const internalPill = document.createElement('button');
        internalPill.className = `storage-pill focusable ${isInternalActive ? 'active' : ''}`;
        internalPill.tabIndex = 0;
        internalPill.id = 'pill-storage-local';
        internalPill.innerHTML = `<span>📱</span><span>Internal TV Storage (Local)</span>`;
        internalPill.addEventListener('click', function() {
            window.TVFilesystem.setSelectedStorage(internalStorage.label, function(sel) {
                renderStoragePills(safeStorages, sel);
                currentStorageRoot = sel.label;
                navigateTo(sel.label);
            });
        });
        container.appendChild(internalPill);

        // Dynamic USB Drive Pills (Supports 1, 2, 3, or more connected drives)
        const usbStorages = safeStorages.filter(s => s.isUsb);

        if (usbStorages.length === 0) {
            const usbPill = document.createElement('button');
            usbPill.tabIndex = 0;
            usbPill.id = 'pill-storage-usb-none';
            usbPill.className = 'storage-pill storage-pill-disconnected focusable';
            usbPill.innerHTML = `<span>💾</span><span>USB Drive (Not Connected)</span>`;
            usbPill.addEventListener('click', function() {
                window.FileReceiver.showToast('No USB drive detected. Please insert a USB flash drive into your TV.');
            });
            container.appendChild(usbPill);
        } else {
            usbStorages.forEach(function(usb, index) {
                const isThisUsbActive = activeStorage ? (activeStorage.label === usb.label) : false;
                const usbPill = document.createElement('button');
                usbPill.tabIndex = 0;
                usbPill.id = `pill-storage-usb-${index}`;
                usbPill.className = `storage-pill focusable ${isThisUsbActive ? 'active' : ''}`;
                const usbLabel = usb.displayName || `USB ${index + 1}: ${usb.label}`;
                usbPill.innerHTML = `<span>💾</span><span>${usbLabel}</span>`;
                usbPill.addEventListener('click', function() {
                    window.TVFilesystem.setSelectedStorage(usb.label, function(sel) {
                        renderStoragePills(safeStorages, sel);
                        currentStorageRoot = sel.label;
                        navigateTo(sel.label);
                    });
                });
                container.appendChild(usbPill);
            });
        }

        // Pill 3: Raspberry Pi Hub (Server)
        const isServerActive = activeStorage ? (activeStorage.label === 'server' || activeStorage.isServer) : false;
        const serverPill = document.createElement('button');
        serverPill.tabIndex = 0;
        serverPill.id = 'pill-storage-server';
        serverPill.className = `storage-pill focusable ${isServerActive ? 'active' : ''}`;
        serverPill.innerHTML = `<span>⚡</span><span>Raspberry Pi Hub (Server)</span>`;
        serverPill.addEventListener('click', function() {
            const srvObj = { label: 'server', displayName: 'Raspberry Pi Hub', isUsb: false, isServer: true };
            window.TVFilesystem.setSelectedStorage('server', function(sel) {
                renderStoragePills(safeStorages, sel || srvObj);
                currentStorageRoot = 'server';
                navigateTo('server');
            });
        });
        container.appendChild(serverPill);

        // Update capacity summary
        const curStorage = activeStorage || internalStorage;
        if (curStorage && capacityText) {
            const avail = window.TVFilesystem.formatBytes(curStorage.availableSize);
            const total = window.TVFilesystem.formatBytes(curStorage.totalSize);
            const typeLabel = curStorage.isServer ? 'Raspberry Pi Server Storage' : (curStorage.isUsb ? 'USB Storage' : 'Internal TV Storage');
            capacityText.textContent = `${typeLabel}: ${avail} available of ${total}`;
        }
    }

    function navigateTo(path) {
        if (!path) return;
        currentPath = path;
        updateBreadcrumbs();

        window.TVFilesystem.browsePath(currentPath, function(err, files) {
            if (err) {
                console.warn('[FileManager] browsePath error for', currentPath, err);
                if (currentPath !== 'server') {
                    window.FileReceiver.showToast('Switching to Raspberry Pi server files...');
                    currentPath = 'server';
                    currentStorageRoot = 'server';
                    navigateTo('server');
                    return;
                }
                renderErrorState(err.message || 'Unable to open folder');
                return;
            }
            currentFiles = Array.isArray(files) ? files : [];
            renderFileGrid(currentFiles);
        });
    }

    function navigateUp() {
        if (!currentPath) return;
        if (currentStorageRoot && currentPath === currentStorageRoot) {
            window.FileReceiver.showToast('Already at storage root folder');
            return;
        }

        const lastSlash = currentPath.lastIndexOf('/');
        if (lastSlash !== -1) {
            const parentPath = currentPath.substring(0, lastSlash);
            navigateTo(parentPath);
        } else if (currentStorageRoot && currentPath !== currentStorageRoot) {
            navigateTo(currentStorageRoot);
        }
    }

    function canGoBack() {
        return Boolean(currentPath && currentStorageRoot && currentPath !== currentStorageRoot);
    }

    function navigateBack() {
        navigateUp();
    }

    function updateBreadcrumbs() {
        const bar = document.getElementById('fm-breadcrumbs');
        if (!bar) return;

        bar.innerHTML = '<span class="breadcrumb-icon">📁</span> ';

        const parts = currentPath ? currentPath.split('/') : [];
        let accumulatedPath = '';

        parts.forEach((part, idx) => {
            if (idx > 0) {
                accumulatedPath += '/' + part;
                const sep = document.createElement('span');
                sep.className = 'breadcrumb-separator';
                sep.textContent = ' > ';
                bar.appendChild(sep);
            } else {
                accumulatedPath = part;
            }

            const targetPath = accumulatedPath;
            const isLast = idx === parts.length - 1;

            const crumbBtn = document.createElement('button');
            crumbBtn.className = `breadcrumb-crumb focusable ${isLast ? 'active-crumb' : ''}`;
            crumbBtn.tabIndex = 0;
            crumbBtn.textContent = part === 'server' ? 'Raspberry Pi Hub' : part;
            crumbBtn.title = `Go to ${targetPath}`;

            if (!isLast) {
                crumbBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    navigateTo(targetPath);
                });
            }

            bar.appendChild(crumbBtn);
        });
    }

    function formatDisplayName(name, isDirectory) {
        if (!name || isDirectory) return name || '';
        let clean = name.replace(/^www\.[a-zA-Z0-9-]+\.[a-zA-Z]+\s*-\s*/i, '');
        clean = clean.replace(/\.(mkv|mp4|avi|mov|wmv|ts|webm|torrent)$/i, '');
        return clean;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderFileGrid(files) {
        const grid = document.getElementById('fm-file-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const isSubfolder = currentStorageRoot && currentPath !== currentStorageRoot && currentPath.includes('/');

        // 1. If inside a subfolder, add ".." Parent Folder card at the very top
        if (isSubfolder || (currentPath && currentPath !== currentStorageRoot)) {
            const upCard = document.createElement('div');
            upCard.className = 'file-item-card parent-dir-card focusable';
            upCard.tabIndex = 0;
            upCard.innerHTML = `
                <div class="file-icon-wrapper folder-icon parent-icon-wrapper">
                    <span>⬆️</span>
                </div>
                <div class="file-card-info">
                    <div class="file-name-text">.. (Parent Folder)</div>
                    <div class="file-meta-row">
                        <span class="file-meta-badge">Go back up one level</span>
                    </div>
                </div>
                <div class="file-card-action-badge">
                    <span class="file-action-pill up-pill">⬆️ Up</span>
                </div>
            `;
            upCard.addEventListener('click', function() {
                navigateUp();
            });
            grid.appendChild(upCard);
        }

        // 2. If folder is completely empty and no parent card
        if ((!files || files.length === 0) && !isSubfolder) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; height: 350px;">
                    <div class="empty-state-icon">📂</div>
                    <div style="font-size: 20px; font-weight: 600; color: #ffffff;">This folder is empty</div>
                    <div style="font-size: 15px; color: var(--text-muted); margin-top: 8px;">Upload files from your phone or PC using File Receiver.</div>
                </div>
            `;
            return;
        }

        // 3. Render directories first, then files
        const fileList = Array.isArray(files) ? files : [];

        fileList.forEach(file => {
            const card = document.createElement('div');
            card.className = 'file-item-card focusable';
            card.tabIndex = 0;

            let iconChar = '📄';
            let iconClass = '';
            let actionText = '📄 View';
            let actionClass = 'view-pill';
            let typeBadge = 'File';

            if (file.isDirectory) {
                iconChar = '📁';
                iconClass = 'folder-icon';
                actionText = '📂 Open';
                actionClass = 'folder-pill';
                typeBadge = 'Folder';
            } else if (file.fileType === 'video') {
                iconChar = '🎬';
                iconClass = 'video-icon';
                actionText = '▶ Play';
                actionClass = 'play-pill';
                const parts = (file.name || '').split('.');
                typeBadge = parts.length > 1 ? parts.pop().toUpperCase() : 'VIDEO';
            } else if (file.fileType === 'torrent') {
                iconChar = '⚡';
                iconClass = 'torrent-icon';
                actionText = '⚡ Stream';
                actionClass = 'torrent-pill';
                typeBadge = 'TORRENT';
            } else if (file.fileType === 'audio') {
                iconChar = '🎵';
                iconClass = 'audio-icon';
                actionText = '▶ Play';
                actionClass = 'play-pill';
                typeBadge = 'AUDIO';
            } else if (file.fileType === 'image') {
                iconChar = '🖼️';
                iconClass = 'image-icon';
                actionText = '🖼️ View';
                actionClass = 'view-pill';
                typeBadge = 'IMAGE';
            } else if (file.fileType === 'subtitle') {
                iconChar = '📝';
                typeBadge = 'SUB';
            }

            const sizeStr = file.isDirectory ? 'Folder' : (window.TVFilesystem && file.fileSize ? window.TVFilesystem.formatBytes(file.fileSize) : '');
            const cleanName = formatDisplayName(file.name, file.isDirectory);

            card.innerHTML = `
                <div class="file-icon-wrapper ${iconClass}">
                    <span>${iconChar}</span>
                </div>
                <div class="file-card-info">
                    <div class="file-name-text" title="${escapeHtml(file.name)}">${escapeHtml(cleanName)}</div>
                    <div class="file-meta-row">
                        ${sizeStr ? `<span class="file-meta-badge">${sizeStr}</span>` : ''}
                        <span class="file-meta-badge file-type-badge">${typeBadge}</span>
                    </div>
                </div>
                <div class="file-card-action-badge">
                    <span class="file-action-pill ${actionClass}">${actionText}</span>
                </div>
            `;

            // Card click handler (open directory, play video, or handle file)
            card.addEventListener('click', function() {
                handleFileClick(file);
            });

            grid.appendChild(card);
        });

        // Focus first element inside the file grid
        if (window.Navigation) {
            setTimeout(window.Navigation.focusInitialElement, 50);
        }
    }

    function handleFileClick(file) {
        if (file.isDirectory) {
            const nextPath = `${currentPath}/${file.name}`;
            navigateTo(nextPath);
        } else if (file.fileType === 'torrent') {
            window.FileReceiver.showToast(`Opening Torrent in Video Player: ${file.name}`);
            if (window.App) window.App.switchView('player');
            const playerModule = window.VideoPlayer || window.Amnis;
            if (playerModule) {
                playerModule.registerTorrentDownload(file.name, file.fileSize);
                playerModule.startTorrentStream(file.name, file.fileSize);
            }
        } else if (file.fileType === 'video' || file.fileType === 'audio') {
            const mediaUrl = file.fullPath.startsWith('http') ? file.fullPath : `file://${file.fullPath}`;
            window.Player.openMedia(mediaUrl, file.name);
        } else if (file.fileType === 'image') {
            window.FileReceiver.showToast(`Selected image: ${file.name}`);
        } else {
            window.FileReceiver.showToast(`File: ${file.name} (${window.TVFilesystem.formatBytes(file.fileSize)})`);
        }
    }

    function deleteFile(file) {
        if (!file || !file.fullPath) return;
        const name = file.name;
        console.log('[FileManager] Deleting file:', file.fullPath);

        window.TVFilesystem.deleteFileAtPath(file.fullPath, function(err) {
            if (err) {
                console.error('[FileManager] Delete file error:', err);
                window.FileReceiver.showToast(`Could not delete: ${name}`);
                return;
            }

            // Also notify companion server if applicable
            try {
                const srvUrl = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
                fetch(`${srvUrl}/delete_file?file=${encodeURIComponent(name)}`).catch(() => {});
            } catch (e) {}

            // Remove from receiver history if it was received
            if (window.FileReceiver && window.FileReceiver.removeFromHistory) {
                window.FileReceiver.removeFromHistory(name);
            }

            window.FileReceiver.showToast(`Deleted: ${name}`);
            refreshCurrentFolder();
        });
    }

    function renderEmptyDriveState() {
        const grid = document.getElementById('fm-file-grid');
        if (grid) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; height: 350px;">
                    <div class="empty-state-icon">🔌</div>
                    <div style="font-size: 20px; font-weight: 600; color: #ffffff;">Please plug in a USB flash drive</div>
                    <div style="font-size: 15px; color: var(--text-muted);">The drive will be automatically detected</div>
                </div>
            `;
        }
    }

    function renderErrorState(msg) {
        const grid = document.getElementById('fm-file-grid');
        if (grid) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; height: 350px;">
                    <div class="empty-state-icon">⚠️</div>
                    <div style="font-size: 18px; color: var(--color-danger);">${msg}</div>
                </div>
            `;
        }
    }

    function refreshCurrentFolder() {
        if (currentPath) {
            window.TVFilesystem.browsePath(currentPath, function(err, files) {
                if (!err) {
                    currentFiles = Array.isArray(files) ? files : [];
                    renderFileGrid(currentFiles);
                }
            });
        }
    }

    return {
        init: init,
        onStorageUpdated: onStorageUpdated,
        canGoBack: canGoBack,
        navigateBack: navigateBack,
        navigateUp: navigateUp,
        navigateTo: navigateTo,
        refreshCurrentFolder: refreshCurrentFolder,
        updateCurrentPath: function(newPath) {
            currentPath = newPath;
            currentStorageRoot = newPath.split('/')[0];
            updateBreadcrumbs();
        }
    };
})();
