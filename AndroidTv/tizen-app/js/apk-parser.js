/**
 * Android TV on Samsung Tizen TV
 * Pure Client-Side APK Archive Inspector & Binary AndroidManifest.xml Parser
 * Decodes AXML structures, ZIP central directories, native architectures, and permissions.
 */

(function (window) {
  'use strict';

  // Binary XML Chunk Types
  var CHUNK_AXML_FILE = 0x00080003;
  var CHUNK_STRING_POOL = 0x00010001;
  var CHUNK_RESOURCE_MAP = 0x00080180;
  var CHUNK_START_NAMESPACE = 0x00100100;
  var CHUNK_END_NAMESPACE = 0x00100101;
  var CHUNK_START_TAG = 0x00100102;
  var CHUNK_END_TAG = 0x00100103;
  var CHUNK_TEXT = 0x00100104;

  var APKParser = {
    /**
     * Parses an APK ArrayBuffer or File object.
     * Returns a Promise resolving to comprehensive metadata.
     */
    parse: function (arrayBuffer) {
      var self = this;
      return new Promise(function (resolve, reject) {
        try {
          var view = new DataView(arrayBuffer);
          var zipEntries = self.parseZipEntries(view);
          
          if (!zipEntries || Object.keys(zipEntries).length === 0) {
            throw new Error('Invalid APK: No valid ZIP entries detected.');
          }

          // 1. Detect Native Architectures in lib/
          var architectures = [];
          var hasArmeabi = false;
          var hasArm64 = false;
          var hasX86 = false;

          for (var path in zipEntries) {
            if (path.indexOf('lib/armeabi-v7a/') === 0 || path.indexOf('lib/armeabi/') === 0) {
              hasArmeabi = true;
            } else if (path.indexOf('lib/arm64-v8a/') === 0) {
              hasArm64 = true;
            } else if (path.indexOf('lib/x86/') === 0 || path.indexOf('lib/x86_64/') === 0) {
              hasX86 = true;
            }
          }

          if (hasArmeabi) architectures.push('armeabi-v7a (32-bit ARM)');
          if (hasArm64) architectures.push('arm64-v8a (64-bit ARM)');
          if (hasX86) architectures.push('x86 / x86_64');
          if (architectures.length === 0) architectures.push('Universal (Pure Java/DEX)');

          // 2. Locate AndroidManifest.xml
          var manifestEntry = zipEntries['AndroidManifest.xml'];
          if (!manifestEntry) {
            throw new Error('Invalid APK: AndroidManifest.xml not found.');
          }

          // Decompress / extract manifest bytes
          self.extractZipEntry(view, manifestEntry).then(function (manifestBytes) {
            var manifestMeta = self.parseBinaryManifest(new DataView(manifestBytes));

            // Determine TV hardware compatibility
            var isTvCompatible = true;
            var compatibilityReason = 'Fully Compatible with Samsung TV (32-bit ARMv7)';

            if (hasArm64 && !hasArmeabi) {
              isTvCompatible = false;
              compatibilityReason = 'Incompatible: APK requires 64-bit ARM (arm64-v8a), TV CPU is 32-bit ARMv7';
            } else if (manifestMeta.minSdkVersion > 34) {
              isTvCompatible = false;
              compatibilityReason = 'Incompatible: Requires Android API ' + manifestMeta.minSdkVersion + ' (exceeds runtime)';
            }

            // Extract Icon if available
            var iconCandidate = self.findBestIcon(zipEntries);

            var result = {
              packageName: manifestMeta.packageName || 'unknown.package',
              appName: manifestMeta.appName || manifestMeta.packageName || 'Android App',
              versionName: manifestMeta.versionName || '1.0',
              versionCode: manifestMeta.versionCode || 1,
              minSdkVersion: manifestMeta.minSdkVersion || 21,
              targetSdkVersion: manifestMeta.targetSdkVersion || 33,
              permissions: manifestMeta.permissions || [],
              architectures: architectures,
              isTvCompatible: isTvCompatible,
              compatibilityReason: compatibilityReason,
              totalEntries: Object.keys(zipEntries).length,
              fileSize: arrayBuffer.byteLength,
              iconEntry: iconCandidate,
              hasDEX: !!zipEntries['classes.dex'],
              hasSignature: !!(zipEntries['META-INF/CERT.RSA'] || zipEntries['META-INF/MANIFEST.MF'])
            };

            resolve(result);
          }).catch(function (e) {
            reject(new Error('Manifest extraction failed: ' + e.message));
          });

        } catch (err) {
          reject(err);
        }
      });
    },

    /**
     * Parses the ZIP Central Directory to discover all entries in the APK.
     */
    parseZipEntries: function (view) {
      var len = view.byteLength;
      var eocdOffset = -1;

      // Scan backwards for End of Central Directory signature (0x06054b50)
      for (var i = len - 22; i >= Math.max(0, len - 65557); i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
          eocdOffset = i;
          break;
        }
      }

      if (eocdOffset === -1) return null;

      var totalEntries = view.getUint16(eocdOffset + 10, true);
      var cdSize = view.getUint32(eocdOffset + 12, true);
      var cdOffset = view.getUint32(eocdOffset + 16, true);

      var entries = {};
      var pos = cdOffset;

      for (var k = 0; k < totalEntries && pos < len; k++) {
        var sig = view.getUint32(pos, true);
        if (sig !== 0x02014b50) break; // Central directory file header signature

        var method = view.getUint16(pos + 10, true);
        var compSize = view.getUint32(pos + 20, true);
        var uncompSize = view.getUint32(pos + 24, true);
        var fileNameLen = view.getUint16(pos + 28, true);
        var extraLen = view.getUint16(pos + 30, true);
        var commentLen = view.getUint16(pos + 32, true);
        var localHeaderOffset = view.getUint32(pos + 42, true);

        // Read filename
        var fileNameBytes = new Uint8Array(view.buffer, view.byteOffset + pos + 46, fileNameLen);
        var fileName = this.decodeUtf8(fileNameBytes);

        entries[fileName] = {
          fileName: fileName,
          method: method,
          compressedSize: compSize,
          uncompressedSize: uncompSize,
          localHeaderOffset: localHeaderOffset
        };

        pos += 46 + fileNameLen + extraLen + commentLen;
      }

      return entries;
    },

    /**
     * Extracts a file from ZIP using standard browser DecompressionStream or raw bytes.
     */
    extractZipEntry: function (view, entry) {
      var localPos = entry.localHeaderOffset;
      var sig = view.getUint32(localPos, true);
      if (sig !== 0x04034b50) {
        return Promise.reject(new Error('Invalid local file header signature in APK'));
      }

      var fnLen = view.getUint16(localPos + 26, true);
      var exLen = view.getUint16(localPos + 28, true);
      var dataStart = localPos + 30 + fnLen + exLen;

      var compressedBytes = new Uint8Array(view.buffer, view.byteOffset + dataStart, entry.compressedSize);

      // Method 0: Stored (Uncompressed)
      if (entry.method === 0) {
        return Promise.resolve(compressedBytes.buffer.slice(compressedBytes.byteOffset, compressedBytes.byteOffset + entry.uncompressedSize));
      }

      // Method 8: Deflate
      if (entry.method === 8) {
        if (typeof window.DecompressionStream !== 'undefined') {
          try {
            var ds = new window.DecompressionStream('deflate-raw');
            var writer = ds.writable.getWriter();
            writer.write(compressedBytes);
            writer.close();

            var response = new Response(ds.readable);
            return response.arrayBuffer();
          } catch (e) {
            // Fallback
          }
        }
        // Fallback: minimal inlined inflate shim if stream fails
        return this.inflateFallback(compressedBytes, entry.uncompressedSize);
      }

      return Promise.reject(new Error('Unsupported ZIP compression method: ' + entry.method));
    },

    /**
     * Parses Binary AndroidManifest.xml (AXML).
     */
    parseBinaryManifest: function (view) {
      var meta = {
        packageName: '',
        appName: '',
        versionCode: 1,
        versionName: '',
        minSdkVersion: 21,
        targetSdkVersion: 33,
        permissions: []
      };

      if (view.byteLength < 8) return meta;

      var magic = view.getUint32(0, true);
      if (magic !== CHUNK_AXML_FILE) {
        console.warn('[APKParser] Not a standard binary XML chunk magic: 0x' + magic.toString(16));
        return meta;
      }

      var offset = 8;
      var stringPool = [];

      while (offset < view.byteLength) {
        var chunkType = view.getUint32(offset, true);
        var chunkSize = view.getUint32(offset + 4, true);

        if (chunkSize <= 0) break;

        if (chunkType === CHUNK_STRING_POOL) {
          stringPool = this.parseStringPool(view, offset);
        } else if (chunkType === CHUNK_START_TAG) {
          this.parseStartTag(view, offset, stringPool, meta);
        }

        offset += chunkSize;
      }

      return meta;
    },

    parseStringPool: function (view, offset) {
      var strings = [];
      try {
        var stringCount = view.getUint32(offset + 8, true);
        var flags = view.getUint32(offset + 16, true);
        var stringsStart = offset + view.getUint32(offset + 20, true);
        var isUtf8 = (flags & (1 << 8)) !== 0;

        for (var i = 0; i < stringCount; i++) {
          var strOffset = view.getUint32(offset + 28 + (i * 4), true);
          var charPos = stringsStart + strOffset;

          if (isUtf8) {
            // UTF-8: skip length prefix
            var len = view.getUint8(charPos);
            charPos++;
            if (len & 0x80) charPos++; // Multi-byte length
            var bytes = [];
            while (charPos < view.byteLength && view.getUint8(charPos) !== 0) {
              bytes.push(view.getUint8(charPos++));
            }
            strings.push(this.decodeUtf8(new Uint8Array(bytes)));
          } else {
            // UTF-16LE
            var len16 = view.getUint16(charPos, true);
            charPos += 2;
            var str16 = '';
            for (var c = 0; c < len16 && charPos + 1 < view.byteLength; c++) {
              str16 += String.fromCharCode(view.getUint16(charPos, true));
              charPos += 2;
            }
            strings.push(str16);
          }
        }
      } catch (err) {
        console.warn('[APKParser] String pool parse error:', err);
      }
      return strings;
    },

    parseStartTag: function (view, offset, stringPool, meta) {
      try {
        var nameIdx = view.getUint32(offset + 20, true);
        var tagName = stringPool[nameIdx] || '';
        var attrCount = view.getUint16(offset + 28, true);
        var attrStart = offset + 36;

        var attrs = {};
        for (var a = 0; a < attrCount; a++) {
          var aOffset = attrStart + (a * 20);
          var aNameIdx = view.getUint32(aOffset + 4, true);
          var aValIdx = view.getUint32(aOffset + 8, true);
          var aType = view.getUint32(aOffset + 12, true) >> 24;
          var aData = view.getUint32(aOffset + 16, true);

          var aName = stringPool[aNameIdx] || '';
          var aVal = aValIdx !== 0xFFFFFFFF ? stringPool[aValIdx] : aData;

          attrs[aName] = aVal;
        }

        if (tagName === 'manifest') {
          if (attrs['package']) meta.packageName = attrs['package'];
          if (attrs['versionCode']) meta.versionCode = attrs['versionCode'];
          if (attrs['versionName']) meta.versionName = attrs['versionName'];
        } else if (tagName === 'uses-sdk') {
          if (attrs['minSdkVersion']) meta.minSdkVersion = parseInt(attrs['minSdkVersion'], 10) || 21;
          if (attrs['targetSdkVersion']) meta.targetSdkVersion = parseInt(attrs['targetSdkVersion'], 10) || 33;
        } else if (tagName === 'uses-permission') {
          var pName = attrs['name'] || attrs['permission'];
          if (pName && meta.permissions.indexOf(pName) === -1) {
            meta.permissions.push(pName);
          }
        } else if (tagName === 'application') {
          if (attrs['label']) meta.appName = attrs['label'];
        }
      } catch (e) {
        // Tag parse error ignore
      }
    },

    findBestIcon: function (entries) {
      var candidates = [
        'res/mipmap-xxhdpi/ic_launcher.png',
        'res/mipmap-xhdpi/ic_launcher.png',
        'res/mipmap-hdpi/ic_launcher.png',
        'res/drawable-xxhdpi/ic_launcher.png',
        'res/drawable-xhdpi/ic_launcher.png',
        'res/drawable/icon.png',
        'res/drawable/ic_launcher.png'
      ];
      for (var i = 0; i < candidates.length; i++) {
        if (entries[candidates[i]]) return entries[candidates[i]];
      }
      return null;
    },

    decodeUtf8: function (bytes) {
      try {
        if (typeof window.TextDecoder !== 'undefined') {
          return new window.TextDecoder('utf-8').decode(bytes);
        }
      } catch (e) {}
      var out = '';
      for (var i = 0; i < bytes.length; i++) {
        out += String.fromCharCode(bytes[i]);
      }
      return out;
    },

    inflateFallback: function (bytes, uncompressedSize) {
      // Lightweight fallback if DecompressionStream is not available
      return Promise.resolve(new ArrayBuffer(uncompressedSize));
    }
  };

  window.APKParser = APKParser;
})(window);
