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

        // Check user's preferred storage setting in localStorage
        const preferredLabel = getPreferredStorage();
        let targetStorage = null;

        if (preferredLabel === 'internal') {
            targetStorage = storages.find(function(s) { return !s.isUsb; });
        } else if (preferredLabel !== 'auto') {
            targetStorage = storages.find(function(s) { return s.label === preferredLabel; });
        }

        // Fallback or 'auto': prioritize first USB drive if mounted, otherwise Internal TV storage
        if (!targetStorage) {
            targetStorage = storages.find(function(s) { return s.isUsb; }) || internalItem;
        }

        selectedStorage = targetStorage;

        ensureTargetDirectory(selectedStorage.label, function(err, dir) {
            if (!err && dir) targetDirHandle = dir;
            if (callback) callback(storages, selectedStorage);
        });
    }

    function setPreferredStorage(label, callback) {
        try {
            localStorage.setItem('tvhub_storage_pref', label);
        } catch (e) {}
        refreshStorages(function(allStorages, selected) {
            if (callback) callback(allStorages, selected);
        });
    }

    function getPreferredStorage() {
        try {
            return localStorage.getItem('tvhub_storage_pref') || 'auto';
        } catch (e) {
            return 'auto';
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

    function ensureTargetDirectory(storageLabel, callback) {
        if (typeof tizen === 'undefined' || !tizen.filesystem) {
            if (callback) callback(null, null);
            return;
        }

        const baseLabel = (storageLabel && storageLabel !== 'downloads') ? storageLabel : 'wgt-private';
        const fullVirtualPath = `${baseLabel}/TVFileHub/Received`;

        // 1. Try to resolve the full directory directly first
        tizen.filesystem.resolve(fullVirtualPath, function(targetDir) {
            console.log('[TVFilesystem] Resolved target folder directly:', fullVirtualPath);
            targetDirHandle = targetDir;
            if (callback) callback(null, targetDir);
        }, function() {
            // 2. Build folder structure step-by-step from base storage root
            console.log('[TVFilesystem] Scaffolding target folder hierarchy on:', baseLabel);
            tizen.filesystem.resolve(baseLabel, function(rootDir) {
                rootDir.listFiles(function(files) {
                    let hubDir = files.find(f => f.isDirectory && f.name === 'TVFileHub');
                    if (!hubDir) {
                        try {
                            hubDir = rootDir.createDirectory('TVFileHub');
                            console.log('[TVFilesystem] Created directory: TVFileHub');
                        } catch (e1) {
                            console.warn('[TVFilesystem] createDirectory TVFileHub:', e1);
                        }
                    }

                    if (!hubDir) {
                        targetDirHandle = rootDir;
                        if (callback) callback(null, rootDir);
                        return;
                    }

                    hubDir.listFiles(function(hubFiles) {
                        let recDir = hubFiles.find(f => f.isDirectory && f.name === 'Received');
                        if (!recDir) {
                            try {
                                recDir = hubDir.createDirectory('Received');
                                console.log('[TVFilesystem] Created directory: TVFileHub/Received');
                            } catch (e2) {
                                console.warn('[TVFilesystem] createDirectory Received:', e2);
                            }
                        }

                        const finalDir = recDir || hubDir || rootDir;
                        targetDirHandle = finalDir;
                        if (callback) callback(null, finalDir);
                    }, function() {
                        try {
                            const recDir = hubDir.createDirectory('Received');
                            targetDirHandle = recDir;
                            if (callback) callback(null, recDir);
                        } catch (e3) {
                            targetDirHandle = hubDir;
                            if (callback) callback(null, hubDir);
                        }
                    });

                }, function() {
                    try {
                        const hubDir = rootDir.createDirectory('TVFileHub');
                        const recDir = hubDir.createDirectory('Received');
                        targetDirHandle = recDir;
                        if (callback) callback(null, recDir);
                    } catch (e4) {
                        targetDirHandle = rootDir;
                        if (callback) callback(null, rootDir);
                    }
                });
            }, function(errRootResolve) {
                console.error('[TVFilesystem] Failed to resolve root storage:', baseLabel, errRootResolve);
                if (callback) callback(errRootResolve);
            }, 'rw');
        }, 'rw');
    }

    function resolveNonConflictingFilename(parentDir, filename, callback) {
        if (!parentDir || typeof parentDir.listFiles !== 'function') {
            callback(filename);
            return;
        }

        parentDir.listFiles(function(files) {
            const existing = {};
            for (let i = 0; i < files.length; i++) {
                existing[files[i].name.toLowerCase()] = true;
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
            console.log('[TVFilesystem] Resolved non-conflicting filename:', safe);
            callback(safe);
        }, function(err) {
            console.warn('[TVFilesystem] resolveNonConflictingFilename listFiles:', err);
            callback(filename);
        });
    }

    function uint8ToBase64(uint8) {
        let binary = '';
        const len = uint8.length;
        const CHUNK = 8192;
        for (let i = 0; i < len; i += CHUNK) {
            const end = Math.min(i + CHUNK, len);
            for (let j = i; j < end; j++) {
                binary += String.fromCharCode(uint8[j]);
            }
        }
        return window.btoa(binary);
    }

    function saveFileToStorage(filename, dataArrayBuffer, progressCallback, completionCallback) {
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

        const activeLabel = (selectedStorage && selectedStorage.label) ? selectedStorage.label : 'wgt-private';

        ensureTargetDirectory(activeLabel, function(err, targetDir) {
            if (err || !targetDir) {
                console.error('[TVFilesystem] Could not access storage folder:', err);
                if (completionCallback) completionCallback(err || new Error('Could not access storage folder'));
                return;
            }

            resolveNonConflictingFilename(targetDir, filename, function(safeName) {
                try {
                    const newFile = targetDir.createFile(safeName);
                    newFile.openStream('w', function(fileStream) {
                        try {
                            const uint8 = new Uint8Array(dataArrayBuffer);
                            if (progressCallback) progressCallback(80);

                            let written = false;

                            // 1. Primary binary writer: writeBase64
                            if (typeof fileStream.writeBase64 === 'function') {
                                try {
                                    const b64 = uint8ToBase64(uint8);
                                    fileStream.writeBase64(b64);
                                    written = true;
                                } catch (eB64) {
                                    console.warn('[TVFilesystem] writeBase64 error, trying writeData:', eB64);
                                }
                            }

                            // 2. Secondary binary writer: writeData
                            if (!written && typeof fileStream.writeData === 'function') {
                                try {
                                    fileStream.writeData(uint8);
                                    written = true;
                                } catch (eU8) {
                                    try {
                                        fileStream.writeData(Array.from(uint8));
                                        written = true;
                                    } catch (eArr) {
                                        console.warn('[TVFilesystem] writeData error:', eArr);
                                    }
                                }
                            }

                            // 3. Fallback binary string writer
                            if (!written) {
                                let bin = '';
                                for (let i = 0; i < uint8.length; i++) {
                                    bin += String.fromCharCode(uint8[i]);
                                }
                                fileStream.write(bin);
                            }

                            fileStream.close();

                            console.log('[TVFilesystem] File saved to storage successfully:', safeName, 'size:', uint8.length);

                            if (progressCallback) progressCallback(100);
                            if (completionCallback) completionCallback(null, {
                                name: safeName,
                                path: newFile.fullPath,
                                size: uint8.length,
                                isUsb: selectedStorage ? selectedStorage.isUsb : false
                            });
                        } catch (writeErr) {
                            console.error('[TVFilesystem] Stream write error:', writeErr);
                            try { fileStream.close(); } catch (e) {}
                            if (completionCallback) completionCallback(writeErr);
                        }
                    }, function(openErr) {
                        console.error('[TVFilesystem] openStream error:', openErr);
                        if (completionCallback) completionCallback(openErr);
                    });
                } catch (createErr) {
                    console.error('[TVFilesystem] createFile error:', createErr);
                    if (completionCallback) completionCallback(createErr);
                }
            });
        });
    }

    function browsePath(pathString, callback) {
        const targetPath = pathString || (selectedStorage ? selectedStorage.label : 'wgt-private');

        if (typeof tizen === 'undefined' || !tizen.filesystem) {
            callback(null, getMockFileList(targetPath));
            return;
        }

        tizen.filesystem.resolve(targetPath, function(dir) {
            if (!dir.isDirectory) {
                callback(new Error('Selected path is not a directory'));
                return;
            }

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
            }, function(err) {
                callback(err);
            });
        }, function(err) {
            callback(err);
        });
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
            { name: 'Jailer_2_HDRip.mkv.torrent', fullPath: 'wgt-private/Jailer_2_HDRip.mkv.torrent', isDirectory: false, fileType: 'torrent', fileSize: 184968 }
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
