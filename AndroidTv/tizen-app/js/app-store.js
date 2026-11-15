/**
 * Android TV on Samsung Tizen TV
 * Play Store & Open-Source Application Catalog Integration
 */

(function (window) {
  'use strict';

  var AppStore = {
    catalog: [
      {
        id: 'smarttube',
        packageName: 'com.liskovsoft.videomanager',
        appName: 'SmartTube Next',
        category: 'Media & Video',
        rating: '4.9 ★',
        downloads: '10M+',
        size: '18.4 MB',
        version: '21.85',
        arch: 'Universal (Pure DEX bytecode)',
        minSdk: 19,
        targetSdk: 33,
        isCompatible: true,
        icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23FF0000"><path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z"/></svg>',
        desc: 'Advanced YouTube client designed specifically for Android TV boxes with ad-free playback, SponsorBlock, and 4K 60fps HDR support.'
      },
      {
        id: 'vlc',
        packageName: 'org.videolan.vlc',
        appName: 'VLC Media Player',
        category: 'Media & Video',
        rating: '4.7 ★',
        downloads: '100M+',
        size: '34.8 MB',
        version: '3.5.4',
        arch: 'armeabi-v7a (32-bit ARM)',
        minSdk: 17,
        targetSdk: 33,
        isCompatible: true,
        icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23FF8800"><path d="M12 2L4 19h16L12 2zm0 3.8L16.2 13H7.8L12 5.8zM6.8 15h10.4l1.4 3H5.4l1.4-3zM2 21h20v1H2z"/></svg>',
        desc: 'Open-source cross-platform multimedia player that plays most multimedia files, discs, devices, and network streaming protocols.'
      },
      {
        id: 'kodi',
        packageName: 'tv.kodi',
        appName: 'Kodi Media Center',
        category: 'Home Theater',
        rating: '4.6 ★',
        downloads: '50M+',
        size: '64.2 MB',
        version: '21.0-Omega',
        arch: 'armeabi-v7a (32-bit ARM)',
        minSdk: 21,
        targetSdk: 33,
        isCompatible: true,
        icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2317B9ED"><path d="M12 2L2 12l10 10 10-10L12 2zm0 3.5L18.5 12 12 18.5 5.5 12 12 5.5z"/></svg>',
        desc: 'Award-winning free and open source home theater software media player and entertainment hub for digital media.'
      },
      {
        id: 'retroarch',
        packageName: 'com.retroarch.a32',
        appName: 'RetroArch (32-bit)',
        category: 'Gaming',
        rating: '4.8 ★',
        downloads: '10M+',
        size: '88.1 MB',
        version: '1.19.1',
        arch: 'armeabi-v7a (32-bit ARM)',
        minSdk: 21,
        targetSdk: 33,
        isCompatible: true,
        icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%239C27B0"><path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm3-3c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>',
        desc: 'Frontend for emulators, game engines and media players. Enables running classic games on a wide range of computers and consoles.'
      },
      {
        id: 'aurora',
        packageName: 'com.aurora.store',
        appName: 'Aurora Store Client',
        category: 'App Stores',
        rating: '4.9 ★',
        downloads: '25M+',
        size: '7.2 MB',
        version: '4.4.1',
        arch: 'Universal (Pure DEX)',
        minSdk: 21,
        targetSdk: 33,
        isCompatible: true,
        icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2300E5FF"><path d="M12 2L1 21h22L12 2zm0 4.2l7.5 13H4.5L12 6.2z"/></svg>',
        desc: 'An unofficial, FOSS client to Google Play Store with an elegant Material Design. Download apps, update existing apps, search for apps.'
      },
      {
        id: 'ppsspp64',
        packageName: 'org.ppsspp.ppssppgold',
        appName: 'PPSSPP Gold (ARM64)',
        category: 'Gaming',
        rating: '4.8 ★',
        downloads: '5M+',
        size: '38.5 MB',
        version: '1.16.6',
        arch: 'arm64-v8a (64-bit ARM)',
        minSdk: 23,
        targetSdk: 34,
        isCompatible: false,
        icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23FFB300"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>',
        desc: 'Play PSP games on your Android device in high definition. Requires 64-bit ARM processor.'
      }
    ],

    renderCatalog: function () {
      var grid = document.getElementById('play-store-grid');
      if (!grid) return;

      grid.innerHTML = '';
      var self = this;

      for (var i = 0; i < this.catalog.length; i++) {
        var item = this.catalog[i];
        var card = document.createElement('div');
        card.className = 'app-card focusable';
        card.setAttribute('tabindex', '0');
        card.setAttribute('data-package', item.packageName);

        card.innerHTML = 
          '<img class="app-card-icon" src="' + item.icon + '" alt="' + item.appName + '">' +
          '<div class="app-card-title">' + item.appName + '</div>' +
          '<div class="app-card-pkg">' + item.category + ' • ' + item.rating + '</div>' +
          (item.isCompatible ? '<span class="app-card-badge">VERIFIED</span>' : '<span class="app-card-badge" style="background:rgba(255,61,113,0.2);color:#FF3D71;">64-BIT</span>');

        card.onclick = (function (apkData) {
          return function () {
            if (window.APKInstaller) {
              window.APKInstaller.inspectAPK(apkData);
            }
          };
        })(item);

        grid.appendChild(card);
      }
    }
  };

  window.AppStore = AppStore;
})(window);
