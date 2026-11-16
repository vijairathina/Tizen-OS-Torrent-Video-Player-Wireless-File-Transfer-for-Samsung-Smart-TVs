/**
 * Samsung Tizen Filesystem API & Storage Management Engine
 * Handles USB drive auto-detection with active hardware probing,
 * continuous background polling, seamless fallback to Internal Local TV Storage,
 * auto-creation of /TVFileHub/Received/, non-conflicting filename resolution,
 * fail-safe Base64 binary stream writing, and folder browsing.
 */

window.TVFilesystem = (function() {
    'use strict';

    let storages = [];
    let selectedStorage = null;
    let targetDirectoryPath = 'TVFileHub/Received';
    let targetDirHandle = null;
    let pollInterval = null;

    // Supported Media Extensions
    const EXTENSIONS = {
        video: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'ts', 'm4v', 'flv'],
        audio: ['mp3', 'aac', 'flac', 'wav', 'ogg', 'm4a', 'wma'],
        image: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'],
        subtitle: ['srt', 'vtt'],
        torrent: ['torrent']
    };

    // Common USB mount point names on Samsung Tizen TVs
    const KNOWN_USB_PROBES = [
        'removable_sda1', 'removable_sda2', 'removable_sda3', 'removable_sda',
        'removable_sdb1', 'removable_sdb2', 'removable_sdb3', 'removable_sdb',
        'removable_sdc1', 'removable_sdc2', 'removable_sdc3', 'removable_sdc',
        'removable_sdd1', 'removable_sdd2', 'removable_sdd',
        'removable_sde1', 'removable_sde2', 'removable_sde',
        'sda1', 'sda2', 'sda3', 'sda',
        'sdb1', 'sdb2', 'sdb3', 'sdb',
        'sdc1', 'sdc2', 'sdc3', 'sdc',
        'sdd1', 'sdd2', 'sdd'
    ];

    function init(onStorageUpdated) {
        refreshStorages(onStorageUpdated);
        setupStorageListener(onStorageUpdated);
        startStoragePolling(onStorageUpdated);
    }

    function isUsbStorage(st) {
        if (!st) return false;
        const type = st.type ? String(st.type).toUpperCase() : '';
        const label = st.label ? String(st.label).toLowerCase() : '';
        const state = st.state ? String(st.state).toUpperCase() : '';

        const matchesExternal = (type === 'EXTERNAL') || 
                                (label.indexOf('removable') !== -1) || 
                                (label.indexOf('usb') !== -1) || 
                                (/^sd[a-z][0-9]?/i.test(label));

        const isMounted = !state || state === 'MOUNTED' || state === 'READY';
        return matchesExternal && isMounted;
    }

    /**
     * Scans for mounted storages. Discovers ALL connected USB drives (1, 2, 3, etc.).
     * Probes known Samsung TV mount paths to find any drives missed by listStorages.
     */
    function refreshStorages(callback) {
        if (typeof tizen === 'undefined' || !tizen.filesystem) {
            setupMockStorage(callback);
            return;
        }

        try {
            tizen.filesystem.listStorages(function(list) {
                storages = [];
                const existingLabels = [];

                // 1. Check for external USB drives in system list
                if (Array.isArray(list)) {
                    for (let i = 0; i < list.length; i++) {
                        const st = list[i];
                        if (isUsbStorage(st)) {
                            storages.push({
                                label: st.label,
                                displayName: `USB: ${st.label}`,
                                type: 'EXTERNAL',
                                isUsb: true,
                                state: st.state || 'MOUNTED',
                                totalSize: st.totalSize || (32 * 1024 * 1024 * 1024),
                                availableSize: st.availableSize || (16 * 1024 * 1024 * 1024)
                            });
                            existingLabels.push(st.label);
                        }
                    }
                }

                // 2. Always probe for additional USB drives (e.g., drive 2 or 3) not returned in listStorages
                probeUsbMounts(existingLabels, function(probedUsbList) {
                    finalizeStorageSelection(probedUsbList, callback);
                });

            }, function(err) {
                console.warn('[TVFilesystem] listStorages error:', err);
                probeUsbMounts([], function(probedUsbList) {
                    finalizeStorageSelection(probedUsbList, callback);
                });
            });
        } catch (e) {
            console.error('[TVFilesystem] Exception in listStorages:', e);
            probeUsbMounts([], function(probedUsbList) {
                finalizeStorageSelection(probedUsbList, callback);
            });
        }
    }

    /**
     * Actively probes ALL known USB candidate mount labels without stopping at the first one.
     * Discovers 1, 2, 3 or more plugged-in USB storage drives on Samsung TV.
     */
    function probeUsbMounts(existingLabels, onComplete) {
        const foundList = [];
        let index = 0;
        const labelsToSkip = Array.isArray(existingLabels) ? existingLabels.slice() : [];

        function probeNext() {
            if (index >= KNOWN_USB_PROBES.length) {
                onComplete(foundList);
                return;
            }

            const candidate = KNOWN_USB_PROBES[index++];
            if (labelsToSkip.indexOf(candidate) !== -1 || foundList.some(f => f.label === candidate)) {
                probeNext();
                return;
            }

            tizen.filesystem.resolve(candidate, function(dir) {
                if (dir && dir.isDirectory) {
                    console.log('[TVFilesystem] Successfully probed active USB drive:', candidate);
                    foundList.push({
                        label: candidate,
                        displayName: `USB: ${candidate}`,
                        type: 'EXTERNAL',
                        isUsb: true,
                        state: 'MOUNTED',
                        totalSize: 32 * 1024 * 1024 * 1024,
                        availableSize: 16 * 1024 * 1024 * 1024
                    });
                }
                probeNext();
            }, function() {
                probeNext();
            }, 'r');
        }

        probeNext();
    }

    function finalizeStorageSelection(extraUsbList, callback) {
        if (Array.isArray(extraUsbList)) {
            extraUsbList.forEach(function(extraUsb) {
                if (extraUsb && !storages.some(function(s) { return s.label === extraUsb.label; })) {
                    storages.push(extraUsb);
                }
            });
        }

        // Format clean, distinct display names for ALL connected USB drives (e.g. "USB 1: sda1", "USB 2: sdb1", "USB 3: sdc1")
        let usbIndex = 1;
        storages.forEach(function(s) {
            if (s.isUsb) {
                const cleanLabel = s.label.replace(/^removable_/, '');
                s.displayName = `USB ${usbIndex}: ${cleanLabel}`;
                usbIndex++;
            }
        });

        // Always include Internal Local TV Storage
        const internalItem = {
            label: 'wgt-private',
            displayName: 'Internal TV Storage',
            type: 'INTERNAL',
            isUsb: false,
            state: 'MOUNTED',
            totalSize: 4 * 1024 * 1024 * 1024,
            availableSize: 2.8 * 1024 * 1024 * 1024
        };

        if (!storages.some(function(s) { return s.type === 'INTERNAL' || s.label === 'wgt-private'; })) {
            storages.push(internalItem);
        }

        // Check user's preferred storage setting in localStorage: 'local', 'usb', 'server', 'internal', or specific USB label
        const preferredLabel = getPreferredStorage();
        let targetStorage = null;

        const serverItem = {
            label: 'server',
            displayName: 'Companion Server (Zero TV Memory)',
            type: 'SERVER',
            isUsb: false,
            isServer: true,
            state: 'MOUNTED',
            totalSize: 128 * 1024 * 1024 * 1024,
            availableSize: 100 * 1024 * 1024 * 1024
        };

        if (preferredLabel === 'server') {
            targetStorage = serverItem;
        } else if (preferredLabel === 'internal' || preferredLabel === 'local') {
            targetStorage = storages.find(function(s) { return !s.isUsb && !s.isServer; }) || internalItem;
        } else if (preferredLabel === 'usb') {
            targetStorage = storages.find(function(s) { return s.isUsb; }) || internalItem;
        } else if (preferredLabel !== 'auto') {
            targetStorage = storages.find(function(s) { return s.label === preferredLabel; });
        }

        // Fallback or 'auto': prioritize first USB drive if mounted, otherwise Internal TV storage
        if (!targetStorage) {
            targetStorage = storages.find(function(s) { return s.isUsb; }) || internalItem;
        }

        selectedStorage = targetStorage;

        if (selectedStorage.isServer) {
            targetDirHandle = null;
            if (callback) callback(storages, selectedStorage);
            return;
        }

        ensureTargetDirectory(selectedStorage.label, function(err, dir) {
            if (!err && dir) targetDirHandle = dir;
            if (callback) callback(storages, selectedStorage);
        });
    }

    function setPreferredStorage(label, callback) {
        try {
            localStorage.setItem('tvhub_storage_pref', label);
            if (window.FileReceiver && window.FileReceiver.sendSocketMessage) {
                window.FileReceiver.sendSocketMessage({
                    type: 'storage_mode_changed',
                    mode: label
                });
            }
        } catch (e) {}
        refreshStorages(function(allStorages, selected) {
            if (callback) callback(allStorages, selected);
        });
    }

    function getPreferredStorage() {
        try {
            return localStorage.getItem('tvhub_storage_pref') || 'usb';
        } catch (e) {
            return 'usb';
        }
    }

    function startStoragePolling(onStorageUpdated) {
        if (pollInterval) clearInterval(pollInterval);
        let lastUsbCount = -1;

        pollInterval = setInterval(function() {
            refreshStorages(function(currentStorages, selected) {
                const currentUsbCount = currentStorages.filter(s => s.isUsb).length;
                if (currentUsbCount !== lastUsbCount) {
                    lastUsbCount = currentUsbCount;
                    console.log('[TVFilesystem] USB count changed to:', currentUsbCount);
                    if (onStorageUpdated) onStorageUpdated(currentStorages, selected);
                }
            });
        }, 2500);
    }

    function setupStorageListener(callback) {
        if (typeof tizen !== 'undefined' && tizen.filesystem && tizen.filesystem.addStorageStateChangeListener) {
            try {
                tizen.filesystem.addStorageStateChangeListener(function(storage) {
                    console.log('[TVFilesystem] Storage event:', storage.label, storage.state);
                    refreshStorages(callback);
                }, function(err) {
                    console.warn('[TVFilesystem] Storage listener failed:', err);
                });
            } catch (e) {
                console.warn('[TVFilesystem] Storage listener exception:', e);
            }
        }
    }

    function setSelectedStorage(label, callback) {
        const found = storages.find(s => s.label === label);
        if (found) {
            selectedStorage = found;
            ensureTargetDirectory(selectedStorage.label, function(err, dir) {
                if (!err) targetDirHandle = dir;
                if (callback) callback(selectedStorage);
            });
        }
    }

    function logFs(msg) {
        console.log('[TVFilesystem]', msg);
        if (window.FileReceiver && window.FileReceiver.sendSocketMessage) {
            window.FileReceiver.sendSocketMessage('[TVFilesystem] ' + msg);
        }
    }

    function sanitizeFilename(filename) {
        if (!filename) return 'received_' + Date.now();
        // Replace forbidden characters: / \ : * ? " < > | \0
        let clean = filename.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();
        // Collapse consecutive underscores or spaces
        clean = clean.replace(/_+/g, '_').replace(/\s+/g, ' ');
        // If length exceeds 220 characters, truncate basename while keeping extension
        if (clean.length > 220) {
            const dot = clean.lastIndexOf('.');
            if (dot !== -1 && clean.length - dot <= 12) {
                const ext = clean.substring(dot);
                clean = clean.substring(0, 220 - ext.length) + ext;
            } else {
                clean = clean.substring(0, 220);
            }
        }
        return clean || ('file_' + Date.now());
    }

    function ensureTargetDirectory(storageLabel, callback) {
        if (typeof tizen === 'undefined' || !tizen.filesystem) {
            if (callback) callback(null, null);
            return;
        }

        const baseLabel = (storageLabel && storageLabel !== 'downloads') ? storageLabel : 'wgt-private';
        const fullVirtualPath = `${baseLabel}/TVFileHub/Received`;

        // 1. Try resolving full directory directly with rw
        tizen.filesystem.resolve(fullVirtualPath, function(targetDir) {
            logFs(`Resolved target directory directly: ${fullVirtualPath}`);
            targetDirHandle = targetDir;
            if (callback) callback(null, targetDir);
        }, function(errDirect) {
            // 2. Resolve root storage first
            tizen.filesystem.resolve(baseLabel, function(rootDir) {
                // Ensure TVFileHub
                getOrCreateDir(rootDir, 'TVFileHub', function(errHub, hubDir) {
                    if (errHub || !hubDir) {
                        logFs(`Could not create TVFileHub on ${baseLabel}, using root: ${errHub ? errHub.message : ''}`);
                        targetDirHandle = rootDir;
                        if (callback) callback(null, rootDir);
                        return;
                    }
                    // Ensure Received inside TVFileHub
                    getOrCreateDir(hubDir, 'Received', function(errRec, recDir) {
                        const finalDir = recDir || hubDir || rootDir;
                        targetDirHandle = finalDir;
                        logFs(`Target directory ready on ${baseLabel}: ${finalDir.fullPath || finalDir.name}`);
                        if (callback) callback(null, finalDir);
                    });
                });
            }, function(errRoot) {
                logFs(`Failed to resolve root storage ${baseLabel}: ${errRoot ? errRoot.message : ''}`);
                if (callback) callback(errRoot);
            }, 'rw');
        }, 'rw');
    }

    function getOrCreateDir(parentDir, dirName, cb) {
        if (!parentDir) {
            cb(new Error('Parent directory is null'));
            return;
        }
        try {
            parentDir.resolve(dirName, function(resolved) {
                if (resolved && resolved.isDirectory) {
                    cb(null, resolved);
                } else {
                    cb(null, parentDir);
                }
            }, function() {
                try {
                    const created = parentDir.createDirectory(dirName);
                    cb(null, created);
                } catch (createErr) {
                    try {
                        parentDir.listFiles(function(files) {
                            const found = (Array.isArray(files) ? files : []).find(f => f.isDirectory && f.name.toLowerCase() === dirName.toLowerCase());
                            if (found) {
                                cb(null, found);
                            } else {
                                cb(null, parentDir);
                            }
                        }, function() {
                            cb(null, parentDir);
                        });
                    } catch (e) {
                        cb(null, parentDir);
                    }
                }
            }, 'rw');
        } catch (err) {
            try {
                const created = parentDir.createDirectory(dirName);
                cb(null, created);
            } catch (e2) {
                cb(null, parentDir);
            }
        }
    }

    function resolveNonConflictingFilename(parentDir, filename, callback) {
        if (!parentDir || typeof parentDir.listFiles !== 'function') {
            callback(filename);
            return;
        }

        parentDir.listFiles(function(files) {
            const existing = {};
            if (Array.isArray(files)) {
                for (let i = 0; i < files.length; i++) {
                    existing[files[i].name.toLowerCase()] = true;
                }
            }

            if (!existing[filename.toLowerCase()]) {
                callback(filename);
                return;
            }

            const dotIdx = filename.lastIndexOf('.');
            const base = dotIdx !== -1 ? filename.substring(0, dotIdx) : filename;
            const ext = dotIdx !== -1 ? filename.substring(dotIdx) : '';

            let counter = 1;
            while (existing[`${base} (${counter})${ext}`.toLowerCase()]) {
                counter++;
            }
            const safe = `${base} (${counter})${ext}`;
            logFs(`Resolved non-conflicting filename: ${safe}`);
            callback(safe);
        }, function(err) {
            logFs(`resolveNonConflictingFilename listFiles error: ${err}`);
            callback(filename);
        });
    }

    function writeBufferToFile(targetFile, dataArrayBuffer, progressCallback, completionCallback) {
        targetFile.openStream('w', function(fileStream) {
            try {
                const uint8 = new Uint8Array(dataArrayBuffer);
                const totalBytes = uint8.length;
                const CHUNK_SIZE = 16384;
                let offset = 0;

                function writeNextChunk() {
                    try {
                        if (offset >= totalBytes) {
                            try { fileStream.close(); } catch (e) {}
                            if (progressCallback) progressCallback(100);
                            if (completionCallback) completionCallback(null);
                            return;
                        }

                        const chunkEnd = Math.min(offset + CHUNK_SIZE, totalBytes);
                        const chunkSlice = uint8.subarray(offset, chunkEnd);

                        let written = false;

                        // 1. Primary: writeBase64
                        if (typeof fileStream.writeBase64 === 'function') {
                            try {
                                let binaryStr = '';
                                const subChunk = 4096;
                                for (let c = 0; c < chunkSlice.length; c += subChunk) {
                                    const subEnd = Math.min(c + subChunk, chunkSlice.length);
                                    binaryStr += String.fromCharCode.apply(null, chunkSlice.subarray(c, subEnd));
                                }
                                fileStream.writeBase64(window.btoa(binaryStr));
                                written = true;
                            } catch (eB64) {
                                logFs(`writeBase64 chunk error: ${eB64}`);
                            }
                        }

                        // 2. Secondary: writeData
                        if (!written && typeof fileStream.writeData === 'function') {
                            try {
                                fileStream.writeData(chunkSlice);
                                written = true;
                            } catch (eData) {
                                try {
                                    fileStream.writeData(Array.from(chunkSlice));
                                    written = true;
                                } catch (eArr) {}
                            }
                        }

                        // 3. Fallback: raw write
                        if (!written) {
                            let rawBin = '';
                            for (let b = 0; b < chunkSlice.length; b++) {
                                rawBin += String.fromCharCode(chunkSlice[b]);
                            }
                            fileStream.write(rawBin);
                        }

                        offset = chunkEnd;
                        if (progressCallback && totalBytes > 0) {
                            const pct = Math.floor((offset / totalBytes) * 100);
                            progressCallback(Math.max(pct, 70));
                        }

                        writeNextChunk();
                    } catch (chunkErr) {
                        logFs(`Stream write error at byte ${offset}: ${chunkErr}`);
                        try { fileStream.close(); } catch (e) {}
                        if (completionCallback) completionCallback(chunkErr);
                    }
                }

                writeNextChunk();
            } catch (streamErr) {
                logFs(`Stream processing error: ${streamErr}`);
                try { fileStream.close(); } catch (e) {}
                if (completionCallback) completionCallback(streamErr);
            }
        }, function(openErr) {
            logFs(`openStream('w') error: ${openErr ? openErr.message : openErr}`);
            if (completionCallback) completionCallback(openErr);
        });
    }

    function saveToDirectory(targetDir, rawFilename, dataArrayBuffer, isUsb, progressCallback, completionCallback) {
        if (!targetDir) {
            completionCallback(new Error('Target directory is null'));
            return;
        }

        const safeName = sanitizeFilename(rawFilename);

        resolveNonConflictingFilename(targetDir, safeName, function(finalName) {
            logFs(`Attempting to create file: ${finalName} in ${targetDir.fullPath || targetDir.name}`);
            
            let fileHandle = null;
            try {
                fileHandle = targetDir.createFile(finalName);
            } catch (createErr) {
                logFs(`createFile threw (${createErr ? createErr.message : createErr}), trying resolve/overwrite...`);
                try {
                    targetDir.resolve(finalName, function(existing) {
                        fileHandle = existing;
                        startWrite();
                    }, function(resErr) {
                        // Try timestamped fallback name
                        const dot = finalName.lastIndexOf('.');
                        const base = dot !== -1 ? finalName.substring(0, dot) : finalName;
                        const ext = dot !== -1 ? finalName.substring(dot) : '';
                        const fallbackName = `${base}_${Date.now()}${ext}`;
                        try {
                            fileHandle = targetDir.createFile(fallbackName);
                            finalName = fallbackName;
                            startWrite();
                        } catch (errTime) {
                            completionCallback(createErr || errTime);
                        }
                    }, 'rw');
                    return;
                } catch (eResolve) {
                    completionCallback(createErr || eResolve);
                    return;
                }
            }

            startWrite();

            function startWrite() {
                if (!fileHandle) {
                    completionCallback(new Error('Could not obtain file handle for ' + finalName));
                    return;
                }
                writeBufferToFile(fileHandle, dataArrayBuffer, progressCallback, function(errWrite) {
                    if (errWrite) {
                        completionCallback(errWrite);
                    } else {
                        logFs(`File successfully written to disk: ${finalName} (${dataArrayBuffer.byteLength} bytes)`);
                        completionCallback(null, {
                            name: finalName,
                            path: fileHandle.fullPath || `${targetDir.fullPath}/${finalName}`,
                            size: dataArrayBuffer.byteLength,
                            isUsb: isUsb
                        });
                    }
                });
            }
        });
    }

    function saveFileToStorage(filename, dataArrayBuffer, progressCallback, completionCallback) {
        if (selectedStorage && selectedStorage.isServer) {
            logFs(`saveFileToStorage: Storage is set to Server. Skipping local TV write for "${filename}".`);
            if (progressCallback) progressCallback(100);
            if (completionCallback) completionCallback(null, {
                name: filename,
                size: dataArrayBuffer ? dataArrayBuffer.byteLength : 0,
                isUsb: false,
                isServer: true,
                path: 'server/uploads/' + filename
            });
            return;
        }

        if (typeof tizen === 'undefined' || !tizen.filesystem) {
            if (progressCallback) progressCallback(100);
            if (completionCallback) completionCallback(null, {
                name: filename,
                size: dataArrayBuffer.byteLength,
                isUsb: false,
                path: `mock/${filename}`
            });
            return;
        }

        const primaryStorage = selectedStorage || { label: 'wgt-private', isUsb: false };
        const primaryLabel = primaryStorage.label || 'wgt-private';
        const isPrimaryUsb = !!primaryStorage.isUsb;

        logFs(`saveFileToStorage called for "${filename}" (${dataArrayBuffer.byteLength} bytes) to primary: ${primaryLabel} (isUsb=${isPrimaryUsb})`);

        // Attempt 1: Try writing to primary storage
        ensureTargetDirectory(primaryLabel, function(errDir, targetDir) {
            if (!errDir && targetDir) {
                saveToDirectory(targetDir, filename, dataArrayBuffer, isPrimaryUsb, progressCallback, function(errSave, savedInfo) {
                    if (!errSave && savedInfo) {
                        if (completionCallback) completionCallback(null, savedInfo);
                        return;
                    }
                    
                    // If primary was USB and failed, fallback to Internal TV Storage!
                    if (isPrimaryUsb) {
                        logFs(`USB write failed (${errSave ? errSave.message : 'unknown'}). Initiating automatic fallback to Internal TV Storage...`);
                        saveToInternalFallback(filename, dataArrayBuffer, progressCallback, completionCallback);
                    } else {
                        // If Internal storage subfolder failed, try Internal storage root directly!
                        logFs(`Internal subfolder save failed, falling back to root wgt-private: ${errSave ? errSave.message : ''}`);
                        saveToInternalRootFallback(filename, dataArrayBuffer, progressCallback, completionCallback);
                    }
                });
            } else {
                // Directory resolution failed on primary
                if (isPrimaryUsb) {
                    logFs(`USB directory access failed (${errDir ? errDir.message : 'unknown'}). Falling back to Internal TV Storage...`);
                    saveToInternalFallback(filename, dataArrayBuffer, progressCallback, completionCallback);
                } else {
                    logFs(`Internal directory access failed, falling back to root wgt-private...`);
                    saveToInternalRootFallback(filename, dataArrayBuffer, progressCallback, completionCallback);
                }
            }
        });
    }

    function saveToInternalFallback(filename, dataArrayBuffer, progressCallback, completionCallback) {
        ensureTargetDirectory('wgt-private', function(errInternalDir, intDir) {
            if (!errInternalDir && intDir) {
                saveToDirectory(intDir, filename, dataArrayBuffer, false, progressCallback, function(errIntSave, savedInfo) {
                    if (!errIntSave && savedInfo) {
                        savedInfo.fallbackFromUsb = true;
                        logFs(`Successfully saved to Internal Storage (fallback from USB): ${savedInfo.name}`);
                        if (completionCallback) completionCallback(null, savedInfo);
                    } else {
                        saveToInternalRootFallback(filename, dataArrayBuffer, progressCallback, completionCallback);
                    }
                });
            } else {
                saveToInternalRootFallback(filename, dataArrayBuffer, progressCallback, completionCallback);
            }
        });
    }

    function saveToInternalRootFallback(filename, dataArrayBuffer, progressCallback, completionCallback) {
        tizen.filesystem.resolve('wgt-private', function(rootDir) {
            saveToDirectory(rootDir, filename, dataArrayBuffer, false, progressCallback, function(errRootSave, savedInfo) {
                if (!errRootSave && savedInfo) {
                    savedInfo.fallbackFromUsb = true;
                    logFs(`Successfully saved to Internal Root storage: ${savedInfo.name}`);
                    if (completionCallback) completionCallback(null, savedInfo);
                } else {
                    logFs(`Fatal write error even on Internal Root storage: ${errRootSave ? errRootSave.message : ''}`);
                    if (completionCallback) completionCallback(errRootSave || new Error('Internal storage write failed'));
                }
            });
        }, function(errResolveRoot) {
            logFs(`Fatal: Could not resolve wgt-private root: ${errResolveRoot ? errResolveRoot.message : ''}`);
            if (completionCallback) completionCallback(errResolveRoot || new Error('Storage completely unavailable'));
        }, 'rw');
    }

    function browsePath(pathString, callback) {
        let targetPath = pathString || (selectedStorage ? selectedStorage.label : 'server');

        // Handle Server browsing (Raspberry Pi Hub)
        if (targetPath === 'server' || (selectedStorage && selectedStorage.isServer && (!pathString || pathString === 'server'))) {
            const srvUrl = window.getServerBaseUrl ? window.getServerBaseUrl() : 'http://192.168.0.14:8080';
            fetch(`${srvUrl}/api/downloads`)
                .then(res => res.json())
                .then(data => {
                    const results = [];
                    if (data && Array.isArray(data.available_movies)) {
                        data.available_movies.forEach(m => {
                            results.push({
                                name: m.clean_title || m.name,
                                fullPath: m.stream_url,
                                isDirectory: false,
                                fileSize: m.size || 0,
                                fileType: 'video',
                                modifiedDate: new Date(),
                                isServer: true
                            });
                        });
                    }
                    callback(null, results);
                })
                .catch(err => {
                    console.warn('[TVFilesystem] Server browse error:', err);
                    callback(null, []);
                });
            return;
        }

        if (typeof tizen === 'undefined' || !tizen.filesystem) {
            callback(null, getMockFileList(targetPath));
            return;
        }

        // Helper to extract file items from a resolved Tizen directory handle
        function listFilesFromDir(dir) {
            dir.listFiles(function(files) {
                const results = [];
                for (let i = 0; i < files.length; i++) {
                    const f = files[i];
                    const isDir = f.isDirectory;
                    const ext = isDir ? '' : (f.name.split('.').pop() || '').toLowerCase();

                    let fileType = 'other';
                    if (isDir) {
                        fileType = 'folder';
                    } else if (EXTENSIONS.video.includes(ext)) {
                        fileType = 'video';
                    } else if (EXTENSIONS.torrent.includes(ext)) {
                        fileType = 'torrent';
                    } else if (EXTENSIONS.audio.includes(ext)) {
                        fileType = 'audio';
                    } else if (EXTENSIONS.image.includes(ext)) {
                        fileType = 'image';
                    } else if (EXTENSIONS.subtitle.includes(ext)) {
                        fileType = 'subtitle';
                    }

                    results.push({
                        name: f.name,
                        fullPath: f.fullPath,
                        isDirectory: isDir,
                        fileSize: f.fileSize || 0,
                        fileType: fileType,
                        modifiedDate: f.modifiedDate || new Date()
                    });
                }

                results.sort((a, b) => {
                    if (a.isDirectory && !b.isDirectory) return -1;
                    if (!a.isDirectory && b.isDirectory) return 1;
                    return a.name.localeCompare(b.name);
                });

                callback(null, results);
            }, function(errList) {
                console.warn('[TVFilesystem] listFiles failed:', errList);
                callback(null, []);
            });
        }

        // Systematically try safe virtual roots if a path fails to resolve
        function tryFallbackLocations() {
            const candidates = ['downloads', 'documents', 'videos', 'wgt-private/TVFileHub/Received', 'wgt-private', 'wgt-package'];
            let idx = 0;

            function tryNextCandidate() {
                if (idx >= candidates.length) {
                    // If no local directory resolves on TV, fall back to Raspberry Pi Server storage!
                    browsePath('server', callback);
                    return;
                }
                const cand = candidates[idx++];
                try {
                    tizen.filesystem.resolve(cand, function(cDir) {
                        if (cDir && cDir.isDirectory) {
                            console.log(`[TVFilesystem] Successfully fell back to working storage: ${cand}`);
                            if (window.FileManager && window.FileManager.updateCurrentPath) {
                                window.FileManager.updateCurrentPath(cand);
                            }
                            listFilesFromDir(cDir);
                        } else {
                            tryNextCandidate();
                        }
                    }, function() {
                        tryNextCandidate();
                    });
                } catch (e) {
                    tryNextCandidate();
                }
            }

            tryNextCandidate();
        }

        // Try resolving the requested targetPath first
        try {
            tizen.filesystem.resolve(targetPath, function(dir) {
                if (dir && dir.isDirectory) {
                    listFilesFromDir(dir);
                } else {
                    tryFallbackLocations();
                }
            }, function(errTarget) {
                console.warn(`[TVFilesystem] resolve failed for '${targetPath}':`, errTarget ? errTarget.message : '');
                tryFallbackLocations();
            });
        } catch (e) {
            tryFallbackLocations();
        }
    }

    function setupMockStorage(callback) {
        storages = [
            {
                label: 'removable_sda1',
                displayName: 'USB 1: sda1 (SanDisk 64GB)',
                type: 'EXTERNAL',
                isUsb: true,
                state: 'MOUNTED',
                totalSize: 64 * 1024 * 1024 * 1024,
                availableSize: 48 * 1024 * 1024 * 1024
            },
            {
                label: 'removable_sdb1',
                displayName: 'USB 2: sdb1 (Kingston 128GB)',
                type: 'EXTERNAL',
                isUsb: true,
                state: 'MOUNTED',
                totalSize: 128 * 1024 * 1024 * 1024,
                availableSize: 92 * 1024 * 1024 * 1024
            },
            {
                label: 'removable_sdc1',
                displayName: 'USB 3: sdc1 (Samsung 32GB)',
                type: 'EXTERNAL',
                isUsb: true,
                state: 'MOUNTED',
                totalSize: 32 * 1024 * 1024 * 1024,
                availableSize: 22 * 1024 * 1024 * 1024
            },
            {
                label: 'wgt-private',
                displayName: 'Internal TV Storage',
                type: 'INTERNAL',
                isUsb: false,
                state: 'MOUNTED',
                totalSize: 4 * 1024 * 1024 * 1024,
                availableSize: 2.8 * 1024 * 1024 * 1024
            }
        ];
        finalizeStorageSelection([], callback);
    }

    let mockVirtualFs = {
        'wgt-private': [
            { name: 'TVFileHub', fullPath: 'wgt-private/TVFileHub', isDirectory: true, fileType: 'folder', fileSize: 0 },
            { name: 'Downloads', fullPath: 'wgt-private/Downloads', isDirectory: true, fileType: 'folder', fileSize: 0 },
            { name: 'Movies', fullPath: 'wgt-private/Movies', isDirectory: true, fileType: 'folder', fileSize: 0 },
            { name: '4K_Sample_Demo.mp4', fullPath: 'wgt-private/4K_Sample_Demo.mp4', isDirectory: false, fileType: 'video', fileSize: 184549320 },
            { name: 'Sample_Video.torrent', fullPath: 'wgt-private/Sample_Video.torrent', isDirectory: false, fileType: 'torrent', fileSize: 184968 }
        ],
        'wgt-private/TVFileHub': [
            { name: 'Received', fullPath: 'wgt-private/TVFileHub/Received', isDirectory: true, fileType: 'folder', fileSize: 0 },
            { name: 'Settings.json', fullPath: 'wgt-private/TVFileHub/Settings.json', isDirectory: false, fileType: 'other', fileSize: 1024 }
        ],
        'wgt-private/TVFileHub/Received': [
            { name: 'Big_Buck_Bunny_1080p.mp4', fullPath: 'wgt-private/TVFileHub/Received/Big_Buck_Bunny_1080p.mp4', isDirectory: false, fileType: 'video', fileSize: 158291040 },
            { name: 'Sample_Music.mp3', fullPath: 'wgt-private/TVFileHub/Received/Sample_Music.mp3', isDirectory: false, fileType: 'audio', fileSize: 8493012 }
        ],
        'wgt-private/Downloads': [
            { name: 'Manual.pdf', fullPath: 'wgt-private/Downloads/Manual.pdf', isDirectory: false, fileType: 'other', fileSize: 204800 }
        ],
        'wgt-private/Movies': [
            { name: 'Cinema_Teaser.mp4', fullPath: 'wgt-private/Movies/Cinema_Teaser.mp4', isDirectory: false, fileType: 'video', fileSize: 412589000 }
        ]
    };

    function getMockFileList(pathString) {
        const path = pathString || 'wgt-private';
        if (mockVirtualFs[path]) {
            return JSON.parse(JSON.stringify(mockVirtualFs[path]));
        }
        return [];
    }

    function deleteFile(filename, isUsb, callback) {
        if (typeof tizen === 'undefined' || !tizen.filesystem) {
            console.log('[TVFilesystem] Mock delete file:', filename);
            if (callback) callback(null);
            return;
        }

        let label = 'wgt-private';
        if (isUsb) {
            const usb = storages.find(s => s.isUsb);
            if (usb) label = usb.label;
        } else if (selectedStorage && selectedStorage.label) {
            label = selectedStorage.label;
        }

        ensureTargetDirectory(label, function(err, targetDir) {
            if (err || !targetDir) {
                console.warn('[TVFilesystem] deleteFile could not access dir:', err);
                if (callback) callback(err || new Error('Directory access failed'));
                return;
            }

            const targetPath = `${targetDir.fullPath}/${filename}`;
            console.log('[TVFilesystem] Attempting to delete:', targetPath);

            targetDir.deleteFile(targetPath, function() {
                console.log('[TVFilesystem] Successfully deleted file:', targetPath);
                if (callback) callback(null);
            }, function(delErr) {
                // Fallback attempt: try with just filename
                try {
                    targetDir.deleteFile(filename, function() {
                        console.log('[TVFilesystem] Successfully deleted file by name:', filename);
                        if (callback) callback(null);
                    }, function(e2) {
                        console.warn('[TVFilesystem] deleteFile failed on both attempts:', delErr, e2);
                        if (callback) callback(delErr);
                    });
                } catch (e3) {
                    if (callback) callback(delErr);
                }
            });
        });
    }

    function deleteFileAtPath(filePath, callback) {
        if (!filePath) {
            if (callback) callback(new Error('No path specified'));
            return;
        }

        if (typeof tizen === 'undefined' || !tizen.filesystem) {
            console.log('[TVFilesystem] Mock deleteFileAtPath:', filePath);
            // Remove from mock virtual filesystem
            Object.keys(mockVirtualFs).forEach(dir => {
                mockVirtualFs[dir] = mockVirtualFs[dir].filter(f => f.fullPath !== filePath);
            });
            if (callback) callback(null);
            return;
        }

        try {
            tizen.filesystem.resolve(filePath, function(fileOrDir) {
                if (!fileOrDir) {
                    if (callback) callback(new Error('Path could not be resolved'));
                    return;
                }
                if (fileOrDir.parent) {
                    if (fileOrDir.isDirectory) {
                        fileOrDir.parent.deleteDirectory(fileOrDir.fullPath, true, function() {
                            console.log('[TVFilesystem] Deleted directory:', filePath);
                            if (callback) callback(null);
                        }, function(err) {
                            if (callback) callback(err);
                        });
                    } else {
                        fileOrDir.parent.deleteFile(fileOrDir.fullPath, function() {
                            console.log('[TVFilesystem] Deleted file:', filePath);
                            if (callback) callback(null);
                        }, function(err) {
                            if (callback) callback(err);
                        });
                    }
                } else {
                    if (callback) callback(new Error('Cannot delete storage root'));
                }
            }, function(err) {
                console.warn('[TVFilesystem] resolve error in deleteFileAtPath:', err);
                if (callback) callback(err);
            }, 'rw');
        } catch (e) {
            if (callback) callback(e);
        }
    }

    function formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    return {
        init: init,
        refreshStorages: refreshStorages,
        getStorages: function() { return storages; },
        getSelectedStorage: function() { return selectedStorage; },
        setSelectedStorage: setSelectedStorage,
        getTargetDirectoryPath: function() { return targetDirectoryPath; },
        saveFileToStorage: saveFileToStorage,
        saveFileToUSB: saveFileToStorage,
        deleteFile: deleteFile,
        deleteFileAtPath: deleteFileAtPath,
        browsePath: browsePath,
        setPreferredStorage: setPreferredStorage,
        getPreferredStorage: getPreferredStorage,
        formatBytes: formatBytes
    };
})();
