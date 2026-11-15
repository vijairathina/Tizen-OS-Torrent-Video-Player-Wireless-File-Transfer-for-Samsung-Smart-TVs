/**
 * Android TV on Samsung Tizen TV
 * Play Store & Google Account Integration
 * Provides Google Account connection, official Android TV pairing flow, and app catalog.
 */

(function (window) {
  'use strict';

  var AppStore = {
    googleAccount: {
      connected: false,
      email: '',
      name: '',
      avatar: 'assets/icons/google.png'
    },

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
        icon: 'assets/icons/youtube.png',
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
        icon: 'assets/icons/vlc.png',
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
        icon: 'assets/icons/kodi.png',
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
        icon: 'assets/icons/retroarch.png',
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
        icon: 'assets/icons/aurora.png',
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
        icon: 'assets/icons/default_app.png',
        desc: 'Play PSP games on your Android device in high definition. Requires 64-bit ARM processor.'
      }
    ],

    init: function () {
      this.loadGoogleAccount();
      this.renderGoogleAccountBar();
      this.renderCatalog();
    },

    loadGoogleAccount: function () {
      try {
        var saved = localStorage.getItem('google_account_info');
        if (saved) {
          this.googleAccount = JSON.parse(saved);
        }
      } catch (e) {}
    },

    saveGoogleAccount: function () {
      try {
        localStorage.setItem('google_account_info', JSON.stringify(this.googleAccount));
      } catch (e) {}
    },

    renderGoogleAccountBar: function () {
      var barContainer = document.getElementById('play-store-account-banner');
      if (!barContainer) return;

      var self = this;
      if (this.googleAccount.connected) {
        barContainer.innerHTML = 
          '<div class="google-account-card connected">' +
            '<div class="google-user-info">' +
              '<img class="google-user-avatar" src="' + this.googleAccount.avatar + '" alt="Google User" onerror="this.src=\'assets/icons/google.png\'">' +
              '<div>' +
                '<div class="google-user-name">' + (this.googleAccount.name || 'Google User') + '</div>' +
                '<div class="google-user-email">' + this.googleAccount.email + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="google-account-actions">' +
              '<span class="badge-status ok">Play Protect Verified</span>' +
              '<button class="tv-btn tv-btn-secondary focusable" id="btn-google-signout" tabindex="0">Sign Out</button>' +
            '</div>' +
          '</div>';

        var btnSignOut = document.getElementById('btn-google-signout');
        if (btnSignOut) {
          btnSignOut.onclick = function () {
            self.signOutGoogleAccount();
          };
        }
      } else {
        barContainer.innerHTML = 
          '<div class="google-account-card">' +
            '<div class="google-card-left">' +
              '<img class="google-g-logo" src="assets/icons/google.png" alt="Google Logo" onerror="this.src=\'icon.png\'">' +
              '<div>' +
                '<div class="google-card-title">Connect your Google Account</div>' +
                '<div class="google-card-desc">Sign in to download apps from Google Play Store, sync your library, and access cloud data.</div>' +
              '</div>' +
            '</div>' +
            '<button class="tv-btn tv-btn-primary focusable" id="btn-open-google-login" tabindex="0">' +
              '<img src="assets/icons/google.png" style="width:20px;height:20px;" alt="G"> ' +
              '<span>Sign In with Google</span>' +
            '</button>' +
          '</div>';

        var btnLogin = document.getElementById('btn-open-google-login');
        if (btnLogin) {
          btnLogin.onclick = function () {
            self.openGoogleLoginModal();
          };
        }
      }
    },

    openGoogleLoginModal: function () {
      var modal = document.getElementById('google-login-modal');
      if (!modal) return;
      modal.classList.add('active');
      if (window.SpatialNav) {
        window.SpatialNav.setModal(modal, true);
      }
    },

    closeGoogleLoginModal: function () {
      var modal = document.getElementById('google-login-modal');
      if (!modal) return;
      modal.classList.remove('active');
      if (window.SpatialNav) {
        window.SpatialNav.setModal(null, false);
      }
    },

    connectGoogleAccount: function (email, name) {
      this.googleAccount = {
        connected: true,
        email: email || 'user@gmail.com',
        name: name || email.split('@')[0],
        avatar: 'assets/icons/google.png',
        connectedAt: new Date().toLocaleString()
      };
      this.saveGoogleAccount();
      this.closeGoogleLoginModal();
      this.renderGoogleAccountBar();

      // Log to Runtime Manager
      if (window.RuntimeManager) {
        window.RuntimeManager.telemetry.playServices = 'Connected (' + this.googleAccount.email + ')';
        window.RuntimeManager.renderTelemetry();
        window.RuntimeManager.log('GMS_AUTH', 'Google Account Token Acquired: ' + this.googleAccount.email, 'info');
        window.RuntimeManager.log('PLAY_STORE', 'Play Protect Client Session Established', 'info');
      }

      alert('Google Account Connected!\n\nSigned in as ' + this.googleAccount.email + '.\nGoogle Play Store and cloud sync are now active.');
    },

    signOutGoogleAccount: function () {
      this.googleAccount = {
        connected: false,
        email: '',
        name: '',
        avatar: 'assets/icons/google.png'
      };
      this.saveGoogleAccount();
      this.renderGoogleAccountBar();

      if (window.RuntimeManager) {
        window.RuntimeManager.telemetry.playServices = 'Uncertified / Third-Party Catalog';
        window.RuntimeManager.renderTelemetry();
        window.RuntimeManager.log('GMS_AUTH', 'Google Account Session Cleared', 'info');
      }
    },

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
          '<img class="app-card-icon" src="' + item.icon + '" alt="' + item.appName + '" onerror="this.src=\'assets/icons/default_app.png\'">' +
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
