/**
 * Android TV on Samsung Tizen TV
 * USB Storage Manager & Filesystem Scanner
 * Uses Samsung Tizen Filesystem API (tizen.filesystem) with browser fallback.
 */

(function (window) {
  'use strict';

  var USBManager = {
    connectedStorages: [],
    currentStorage: null,
    currentPath: '/',
    cachedFiles: [],

    init: function () {
      var self = this;
      return new Promise(function (resolve) {
        self.scanStorages().then(function (storages) {
          self.connectedStorages = storages;
          if (storages.length > 0) {
            self.currentStorage = storages[0];
          }
          resolve(storages);
        });
      });
    },

    scanStorages: function () {
      var self = this;
      return new Promise(function (resolve) {
        if (window.tizen && window.tizen.filesystem) {
          try {
            window.tizen.filesystem.listStorages(function (storages) {
              var result = [];
              for (var i = 0; i < storages.length; i++) {
                var s = storages[i];
                var isRemovable = s.type === 'EXTERNAL' || s.label.toLowerCase().indexOf('usb') !== -1;
                result.push({
                  id: s.label,
                  name: isRemovable ? 'USB Drive (' + s.label + ')' : 'Internal TV Storage',
                  type: isRemovable ? 'usb' : 'internal',
                  capacity: self.formatBytes(s.capacity),
                  available: self.formatBytes(s.availableCapacity),
                  rawStorage: s
                });
              }
              console.log('[USBManager] Tizen Storages detected:', result);
              resolve(result);
            }, function (err) {
              console.warn('[USBManager] listStorages error:', err);
              resolve(self.getMockStorages());
            });
          } catch (e) {
            resolve(self.getMockStorages());
          }
        } else {
          // Browser environment simulation
          resolve(self.getMockStorages());
        }
      });
    },

    getMockStorages: function () {
      return [
        {
          id: 'usb_sda1',
          name: 'USB Drive 1 (SanDisk 64GB)',
          type: 'usb',
          capacity: '59.8 GB',
          available: '42.1 GB'
        },
        {
          id: 'usb_sdb1',
          name: 'USB Drive 2 (Kingston 32GB)',
          type: 'usb',
          capacity: '29.2 GB',
          available: '18.4 GB'
        },
        {
          id: 'internal',
          name: 'Internal TV Storage (/apps_rw)',
          type: 'internal',
          capacity: '4.0 GB',
          available: '1.8 GB'
        }
      ];
    },

    scanFolderForAPKs: function (storageId) {
      var self = this;
      return new Promise(function (resolve) {
        if (window.tizen && window.tizen.filesystem) {
          try {
            window.tizen.filesystem.resolve(storageId, function (dir) {
              dir.listFiles(function (files) {
                var apks = [];
                for (var i = 0; i < files.length; i++) {
                  var f = files[i];
                  if (f.isFile && f.name.toLowerCase().endsWith('.apk')) {
                    apks.push({
                      name: f.name,
                      path: f.fullPath,
                      size: self.formatBytes(f.fileSize),
                      rawBytesSize: f.fileSize,
                      storageId: storageId,
                      fileHandle: f
                    });
                  }
                }
                self.cachedFiles = apks;
                resolve(apks);
              }, function () {
                resolve(self.getMockAPKs(storageId));
              });
            }, function () {
              resolve(self.getMockAPKs(storageId));
            });
            return;
          } catch (e) {}
        }
        resolve(self.getMockAPKs(storageId));
      });
    },

    getMockAPKs: function (storageId) {
      if (storageId === 'usb_sdb1') {
        return [
          {
            name: 'Kodi_v21_Omega_armeabi-v7a.apk',
            path: '/USB2/Apps/Kodi_v21_Omega_armeabi-v7a.apk',
            size: '64.2 MB',
            rawBytesSize: 67318528,
            packageName: 'tv.kodi',
            appName: 'Kodi Media Center',
            version: '21.0-Omega',
            minSdk: 21,
            targetSdk: 33,
            arch: 'armeabi-v7a (32-bit ARM)',
            isCompatible: true
          },
          {
            name: 'PPSSPP_Gold_arm64-v8a.apk',
            path: '/USB2/Emulators/PPSSPP_Gold_arm64-v8a.apk',
            size: '38.5 MB',
            rawBytesSize: 40370176,
            packageName: 'org.ppsspp.ppssppgold',
            appName: 'PPSSPP Gold',
            version: '1.16.6',
            minSdk: 23,
            targetSdk: 34,
            arch: 'arm64-v8a (64-bit ARM)',
            isCompatible: false,
            compatReason: 'Requires 64-bit ARM CPU. TV is 32-bit ARMv7.'
          }
        ];
      }

      return [
        {
          name: 'VLC_for_Android_3.5.4_armv7.apk',
          path: '/USB1/APKs/VLC_for_Android_3.5.4_armv7.apk',
          size: '34.8 MB',
          rawBytesSize: 36490444,
          packageName: 'org.videolan.vlc',
          appName: 'VLC Media Player',
          version: '3.5.4',
          minSdk: 17,
          targetSdk: 33,
          arch: 'armeabi-v7a (32-bit ARM)',
          isCompatible: true
        },
        {
          name: 'RetroArch_Plus_32bit.apk',
          path: '/USB1/APKs/RetroArch_Plus_32bit.apk',
          size: '88.1 MB',
          rawBytesSize: 92379136,
          packageName: 'com.retroarch.a32',
          appName: 'RetroArch (32-bit Engine)',
          version: '1.19.1',
          minSdk: 21,
          targetSdk: 33,
          arch: 'armeabi-v7a (32-bit ARM)',
          isCompatible: true
        },
        {
          name: 'SmartTube_Stable_v21.85.apk',
          path: '/USB1/APKs/SmartTube_Stable_v21.85.apk',
          size: '18.4 MB',
          rawBytesSize: 19293798,
          packageName: 'com.liskovsoft.videomanager',
          appName: 'SmartTube Next',
          version: '21.85',
          minSdk: 19,
          targetSdk: 33,
          arch: 'Universal (Pure DEX bytecode)',
          isCompatible: true
        },
        {
          name: 'Geekbench_6_arm64.apk',
          path: '/USB1/APKs/Geekbench_6_arm64.apk',
          size: '124.0 MB',
          rawBytesSize: 130023424,
          packageName: 'com.primatelabs.geekbench6',
          appName: 'Geekbench 6',
          version: '6.2.2',
          minSdk: 26,
          targetSdk: 34,
          arch: 'arm64-v8a (64-bit ARM)',
          isCompatible: false,
          compatReason: 'Requires 64-bit ARM CPU. TV is 32-bit ARMv7.'
        }
      ];
    },

    formatBytes: function (bytes) {
      if (!bytes || bytes === 0) return '0 B';
      var k = 1024;
      var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      var i = Math.floor(Math.log(bytes) / Math.log(k));
      return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
    }
  };

  window.USBManager = USBManager;
})(window);
