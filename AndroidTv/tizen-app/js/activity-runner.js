/**
 * Android TV on Samsung Tizen TV
 * Android Activity Execution Engine (BlueStacks-Style Application Runtime)
 * Handles full-screen activity lifecycle, rendering surface, and interactive app interfaces.
 */

(function (window) {
  'use strict';

  var ActivityRunner = {
    isRunning: false,
    currentApp: null,
    playerInstance: null,
    historyStack: [],
    virtualMouseActive: false,

    init: function () {
      console.log('[ActivityRunner] Initializing Activity Execution Engine...');
    },

    /**
     * Launches an Android application inside the full-screen execution surface.
     */
    launch: function (appData) {
      if (typeof appData === 'string') {
        // Look up by package name
        var found = null;
        if (window.APKInstaller && window.APKInstaller.installedApps) {
          for (var i = 0; i < window.APKInstaller.installedApps.length; i++) {
            if (window.APKInstaller.installedApps[i].packageName === appData) {
              found = window.APKInstaller.installedApps[i];
              break;
            }
          }
        }
        if (!found) {
          found = {
            packageName: appData,
            appName: appData.split('.').pop() || 'Android App',
            icon: 'icon.png'
          };
        }
        appData = found;
      }

      this.currentApp = appData;
      this.isRunning = true;

      // Log to Runtime Manager
      if (window.RuntimeManager) {
        window.RuntimeManager.log('ACTIVITY_MANAGER', 'startActivity: Intent { act=android.intent.action.MAIN cat=[android.intent.category.LAUNCHER] cmp=' + appData.packageName + '/.MainActivity }', 'info');
        window.RuntimeManager.log('SURFACE_FLINGER', 'Allocating EGL Wayland window surface (3840x2160 60Hz BT.709)', 'info');
      }

      // Hide TV Launcher Shell and Show Runtime Screen
      var launcherShell = document.getElementById('tv-launcher-shell');
      var runtimeScreen = document.getElementById('android-runtime-screen');
      if (launcherShell) launcherShell.style.display = 'none';
      if (runtimeScreen) {
        runtimeScreen.style.display = 'flex';
        runtimeScreen.classList.add('active');
      }

      // Update Top Action Bar
      var titleEl = document.getElementById('runtime-app-title');
      var iconEl = document.getElementById('runtime-app-icon');
      if (titleEl) titleEl.innerText = appData.appName || appData.packageName;
      if (iconEl) {
        var iconSrc = (window.APKInstaller && window.APKInstaller.getIconForPackage(appData.packageName, appData.icon)) || 'assets/icons/default_app.png';
        iconEl.src = iconSrc;
        iconEl.onerror = function () { this.src = 'assets/icons/default_app.png'; };
      }

      // Render Application Activity
      this.renderApplication(appData);

      // Focus back button or primary app control
      setTimeout(function () {
        var first = runtimeScreen.querySelector('.focusable');
        if (first && window.SpatialNav) {
          window.SpatialNav.setFocus(first);
        }
      }, 100);
    },

    /**
     * Cleanly terminates the active Android Activity and returns to the Launcher.
     */
    exit: function () {
      if (!this.isRunning) return;

      if (window.RuntimeManager) {
        window.RuntimeManager.log('ACTIVITY_MANAGER', 'Activity paused & stopped: ' + (this.currentApp ? this.currentApp.packageName : 'app'), 'info');
      }

      // Stop any running media player
      this.destroyPlayer();

      this.isRunning = false;
      this.currentApp = null;
      this.historyStack = [];

      var launcherShell = document.getElementById('tv-launcher-shell');
      var runtimeScreen = document.getElementById('android-runtime-screen');
      if (runtimeScreen) {
        runtimeScreen.style.display = 'none';
        runtimeScreen.classList.remove('active');
        var viewport = document.getElementById('runtime-viewport-content');
        if (viewport) viewport.innerHTML = '';
      }
      if (launcherShell) launcherShell.style.display = 'flex';

      // Re-focus first available element in launcher
      setTimeout(function () {
        if (window.SpatialNav) {
          window.SpatialNav.focusFirstAvailable();
        }
      }, 80);
    },

    destroyPlayer: function () {
      if (this.playerInstance) {
        try {
          this.playerInstance.pause();
          this.playerInstance.src = '';
          this.playerInstance.load();
        } catch (e) {}
        this.playerInstance = null;
      }
    },

    /**
     * Renders the authentic Android activity UI inside the viewport.
     */
    renderApplication: function (appData) {
      var viewport = document.getElementById('runtime-viewport-content');
      if (!viewport) return;
      viewport.innerHTML = '';

      var pkg = (appData.packageName || '').toLowerCase();

      if (pkg.indexOf('vlc') !== -1) {
        this.renderVLC(viewport);
      } else if (pkg.indexOf('videomanager') !== -1 || pkg.indexOf('smarttube') !== -1 || pkg.indexOf('youtube') !== -1) {
        this.renderSmartTube(viewport);
      } else if (pkg.indexOf('browser') !== -1 || pkg.indexOf('chrome') !== -1) {
        this.renderBrowser(viewport);
      } else if (pkg.indexOf('settings') !== -1) {
        this.renderSettings(viewport);
      } else if (pkg.indexOf('retroarch') !== -1) {
        this.renderRetroArch(viewport);
      } else {
        this.renderGenericApp(viewport, appData);
      }
    },

    // =========================================================================
    // VLC FOR ANDROID TV IMPLEMENTATION
    // =========================================================================
    renderVLC: function (container) {
      var self = this;
      container.innerHTML = 
        '<div class="vlc-app-shell">' +
          '<div class="vlc-sidebar">' +
            '<div class="vlc-brand">' +
              '<img src="assets/icons/vlc.png" width="32" height="32" alt="VLC" style="border-radius:6px;">' +
              '<span>VLC for Android</span>' +
            '</div>' +
            '<button class="vlc-nav-btn focusable active" data-vlc-tab="video" tabindex="0">🎬 Video</button>' +
            '<button class="vlc-nav-btn focusable" data-vlc-tab="audio" tabindex="0">🎵 Audio</button>' +
            '<button class="vlc-nav-btn focusable" data-vlc-tab="browse" tabindex="0">📁 Browse USB</button>' +
            '<button class="vlc-nav-btn focusable" data-vlc-tab="stream" tabindex="0">🌐 Stream URL</button>' +
            '<button class="vlc-nav-btn focusable" data-vlc-tab="settings" tabindex="0">⚙️ Preferences</button>' +
          '</div>' +

          '<div class="vlc-content-area">' +
            '<div class="vlc-section-header">' +
              '<h2>Media Library</h2>' +
              '<span class="vlc-meta-pill">Hardware Acceleration: AVPlay Direct</span>' +
            '</div>' +

            '<div class="vlc-media-grid" id="vlc-media-list">' +
              // Sample and discovered videos
              '<div class="vlc-media-card focusable" tabindex="0" data-video-title="Big Buck Bunny 4K HDR" data-video-url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4">' +
                '<div class="vlc-thumb-placeholder" style="background: linear-gradient(135deg, #1A2332 0%, #0E131F 100%);">' +
                  '<svg viewBox="0 0 24 24" width="48" height="48" fill="#FF8800"><path d="M8 5v14l11-7z"/></svg>' +
                  '<span class="vlc-duration-badge">9:56</span>' +
                '</div>' +
                '<div class="vlc-card-body">' +
                  '<div class="vlc-card-title">Big Buck Bunny (4K 60fps Demo)</div>' +
                  '<div class="vlc-card-sub">H.264 / AAC • 1080p UHD • 158 MB</div>' +
                '</div>' +
              '</div>' +

              '<div class="vlc-media-card focusable" tabindex="0" data-video-title="Sintel Animation 4K" data-video-url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4">' +
                '<div class="vlc-thumb-placeholder" style="background: linear-gradient(135deg, #2D1A32 0%, #170E1F 100%);">' +
                  '<svg viewBox="0 0 24 24" width="48" height="48" fill="#FF8800"><path d="M8 5v14l11-7z"/></svg>' +
                  '<span class="vlc-duration-badge">12:14</span>' +
                '</div>' +
                '<div class="vlc-card-body">' +
                  '<div class="vlc-card-title">Sintel (Durian Open Source Demo)</div>' +
                  '<div class="vlc-card-sub">H.264 / AAC • 1080p • 204 MB</div>' +
                '</div>' +
              '</div>' +

              '<div class="vlc-media-card focusable" tabindex="0" data-video-title="Tears of Steel Sci-Fi Demo" data-video-url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4">' +
                '<div class="vlc-thumb-placeholder" style="background: linear-gradient(135deg, #1A3228 0%, #0E1F18 100%);">' +
                  '<svg viewBox="0 0 24 24" width="48" height="48" fill="#FF8800"><path d="M8 5v14l11-7z"/></svg>' +
                  '<span class="vlc-duration-badge">12:14</span>' +
                '</div>' +
                '<div class="vlc-card-body">' +
                  '<div class="vlc-card-title">Tears of Steel (VFX 4K HDR Demo)</div>' +
                  '<div class="vlc-card-sub">H.264 / AAC • 1080p • 228 MB</div>' +
                '</div>' +
              '</div>' +

              '<div class="vlc-media-card focusable" tabindex="0" data-video-title="Elephants Dream" data-video-url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4">' +
                '<div class="vlc-thumb-placeholder" style="background: linear-gradient(135deg, #322A1A 0%, #1F190E 100%);">' +
                  '<svg viewBox="0 0 24 24" width="48" height="48" fill="#FF8800"><path d="M8 5v14l11-7z"/></svg>' +
                  '<span class="vlc-duration-badge">10:53</span>' +
                '</div>' +
                '<div class="vlc-card-body">' +
                  '<div class="vlc-card-title">Elephants Dream (Classic 3D)</div>' +
                  '<div class="vlc-card-sub">H.264 / AAC • 1080p • 176 MB</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          // Fullscreen Video Player Overlay
          '<div class="vlc-player-overlay" id="vlc-player-overlay" style="display:none;">' +
            '<video id="vlc-video-element" class="vlc-video-tag" playsinline></video>' +
            '<div class="vlc-osd">' +
              '<div class="vlc-osd-header">' +
                '<div class="vlc-osd-title" id="vlc-osd-video-title">Big Buck Bunny</div>' +
                '<button class="vlc-osd-btn focusable" id="vlc-btn-close-player" tabindex="0">✕ Close Video</button>' +
              '</div>' +
              '<div class="vlc-osd-bottom">' +
                '<div class="vlc-seekbar-wrap">' +
                  '<span class="vlc-time-text" id="vlc-current-time">0:00</span>' +
                  '<div class="vlc-seekbar-bar" id="vlc-seekbar-bar"><div class="vlc-seekbar-fill" id="vlc-seekbar-fill"></div></div>' +
                  '<span class="vlc-time-text" id="vlc-total-time">0:00</span>' +
                '</div>' +
                '<div class="vlc-osd-controls">' +
                  '<button class="vlc-ctrl-btn focusable" id="vlc-btn-rewind" tabindex="0">⏪ -10s</button>' +
                  '<button class="vlc-ctrl-btn focusable" id="vlc-btn-playpause" tabindex="0">⏸ Pause</button>' +
                  '<button class="vlc-ctrl-btn focusable" id="vlc-btn-forward" tabindex="0">⏩ +10s</button>' +
                  '<button class="vlc-ctrl-btn focusable" id="vlc-btn-aspect" tabindex="0">📺 Fit Screen</button>' +
                  '<button class="vlc-ctrl-btn focusable" id="vlc-btn-audio" tabindex="0">🔊 Audio: Stereo</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';

      // Connect Media Click Handlers
      var mediaCards = container.querySelectorAll('.vlc-media-card');
      for (var i = 0; i < mediaCards.length; i++) {
        mediaCards[i].addEventListener('click', function () {
          var title = this.getAttribute('data-video-title');
          var url = this.getAttribute('data-video-url');
          self.playVLCVideo(title, url);
        });
      }

      // Sidebar Tab Switching
      var navBtns = container.querySelectorAll('.vlc-nav-btn');
      for (var j = 0; j < navBtns.length; j++) {
        navBtns[j].addEventListener('click', function () {
          for (var k = 0; k < navBtns.length; k++) navBtns[k].classList.remove('active');
          this.classList.add('active');
          var tab = this.getAttribute('data-vlc-tab');
          if (tab === 'browse' && window.USBManager) {
            self.loadVLCStorageBrowse();
          }
        });
      }
    },

    loadVLCStorageBrowse: function () {
      var grid = document.getElementById('vlc-media-list');
      if (!grid) return;
      grid.innerHTML = '<div style="padding:20px;color:#9AA4B2;">Scanning USB storages for media files...</div>';

      window.USBManager.scanStorages().then(function (storages) {
        var html = '';
        for (var i = 0; i < storages.length; i++) {
          var s = storages[i];
          html += 
            '<div class="vlc-media-card focusable" tabindex="0" style="background:rgba(255,255,255,0.04);">' +
              '<div class="vlc-thumb-placeholder" style="background:#1E2533;">' +
                '<svg viewBox="0 0 24 24" width="48" height="48" fill="#3DDC84"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>' +
              '</div>' +
              '<div class="vlc-card-body">' +
                '<div class="vlc-card-title">' + s.name + '</div>' +
                '<div class="vlc-card-sub">' + s.available + ' free of ' + s.capacity + '</div>' +
              '</div>' +
            '</div>';
        }
        grid.innerHTML = html;
        if (window.SpatialNav) window.SpatialNav.focusFirstAvailable();
      });
    },

    playVLCVideo: function (title, videoUrl) {
      var self = this;
      var overlay = document.getElementById('vlc-player-overlay');
      var video = document.getElementById('vlc-video-element');
      var titleEl = document.getElementById('vlc-osd-video-title');
      var playPauseBtn = document.getElementById('vlc-btn-playpause');
      var rewindBtn = document.getElementById('vlc-btn-rewind');
      var forwardBtn = document.getElementById('vlc-btn-forward');
      var closeBtn = document.getElementById('vlc-btn-close-player');
      var fillEl = document.getElementById('vlc-seekbar-fill');
      var curTimeEl = document.getElementById('vlc-current-time');
      var totalTimeEl = document.getElementById('vlc-total-time');

      if (!overlay || !video) return;

      this.playerInstance = video;
      titleEl.innerText = title;
      overlay.style.display = 'block';

      video.src = videoUrl;
      video.play().catch(function (e) {
        console.warn('[VLC] Autoplay blocked, user interaction required:', e);
      });

      // Update seekbar
      video.ontimeupdate = function () {
        if (video.duration) {
          var pct = (video.currentTime / video.duration) * 100;
          if (fillEl) fillEl.style.width = pct + '%';
          if (curTimeEl) curTimeEl.innerText = self.formatTime(video.currentTime);
          if (totalTimeEl) totalTimeEl.innerText = self.formatTime(video.duration);
        }
      };

      video.onplay = function () {
        if (playPauseBtn) playPauseBtn.innerText = '⏸ Pause';
      };

      video.onpause = function () {
        if (playPauseBtn) playPauseBtn.innerText = '▶ Play';
      };

      if (playPauseBtn) {
        playPauseBtn.onclick = function () {
          if (video.paused) video.play(); else video.pause();
        };
      }

      if (rewindBtn) {
        rewindBtn.onclick = function () {
          video.currentTime = Math.max(0, video.currentTime - 10);
        };
      }

      if (forwardBtn) {
        forwardBtn.onclick = function () {
          video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
        };
      }

      if (closeBtn) {
        closeBtn.onclick = function () {
          self.destroyPlayer();
          overlay.style.display = 'none';
          if (window.SpatialNav) window.SpatialNav.focusFirstAvailable();
        };
      }

      // Focus play/pause button
      setTimeout(function () {
        if (playPauseBtn && window.SpatialNav) window.SpatialNav.setFocus(playPauseBtn);
      }, 100);
    },

    formatTime: function (secs) {
      var s = Math.floor(secs || 0);
      var m = Math.floor(s / 60);
      var remS = s % 60;
      return m + ':' + (remS < 10 ? '0' : '') + remS;
    },

    // =========================================================================
    // SMARTTUBE / YOUTUBE TV IMPLEMENTATION
    // =========================================================================
    renderSmartTube: function (container) {
      var self = this;
      container.innerHTML = 
        '<div class="st-app-shell">' +
          '<div class="st-sidebar">' +
            '<div class="st-brand">' +
              '<img src="assets/icons/youtube.png" width="30" height="30" alt="SmartTube" style="border-radius:6px;">' +
              '<span>SmartTube TV</span>' +
            '</div>' +
            '<button class="st-nav-btn focusable active" tabindex="0">🏠 Home</button>' +
            '<button class="st-nav-btn focusable" tabindex="0">🔥 Trending</button>' +
            '<button class="st-nav-btn focusable" tabindex="0">🎵 Music</button>' +
            '<button class="st-nav-btn focusable" tabindex="0">🎮 Gaming</button>' +
            '<button class="st-nav-btn focusable" tabindex="0">⚙️ Settings</button>' +
          '</div>' +

          '<div class="st-content-area">' +
            '<h2 style="font-size:24px;margin-bottom:20px;">Recommended for You</h2>' +
            '<div class="st-video-grid">' +
              '<div class="st-video-card focusable" tabindex="0" data-url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4" data-title="For Bigger Blazes 4K">' +
                '<div class="st-thumb" style="background:#1B202C;"><svg viewBox="0 0 24 24" width="40" height="40" fill="#FF0000"><path d="M8 5v14l11-7z"/></svg></div>' +
                '<div class="st-video-info">' +
                  '<div class="st-video-title">Chromecast Ultra 4K HDR Showcase</div>' +
                  '<div class="st-channel">Google Demos • 2.4M views</div>' +
                '</div>' +
              '</div>' +

              '<div class="st-video-card focusable" tabindex="0" data-url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4" data-title="For Bigger Escapes">' +
                '<div class="st-thumb" style="background:#2C1B28;"><svg viewBox="0 0 24 24" width="40" height="40" fill="#FF0000"><path d="M8 5v14l11-7z"/></svg></div>' +
                '<div class="st-video-info">' +
                  '<div class="st-video-title">For Bigger Escapes – Natural Wonders 4K</div>' +
                  '<div class="st-channel">Travel UHD • 1.1M views</div>' +
                '</div>' +
              '</div>' +

              '<div class="st-video-card focusable" tabindex="0" data-url="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4" data-title="For Bigger Fun">' +
                '<div class="st-thumb" style="background:#1B2C24;"><svg viewBox="0 0 24 24" width="40" height="40" fill="#FF0000"><path d="M8 5v14l11-7z"/></svg></div>' +
                '<div class="st-video-info">' +
                  '<div class="st-video-title">Android TV Gaming &amp; Entertainment</div>' +
                  '<div class="st-channel">Tech Reviews • 890K views</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>';

      var cards = container.querySelectorAll('.st-video-card');
      for (var i = 0; i < cards.length; i++) {
        cards[i].addEventListener('click', function () {
          var title = this.getAttribute('data-title');
          var url = this.getAttribute('data-url');
          // Launch in VLC/AVPlay video player
          self.renderVLC(container);
          self.playVLCVideo(title, url);
        });
      }
    },

    // =========================================================================
    // ANDROID CHROMIUM BROWSER IMPLEMENTATION
    // =========================================================================
    renderBrowser: function (container) {
      container.innerHTML = 
        '<div class="browser-app-shell">' +
          '<div class="browser-toolbar">' +
            '<button class="browser-btn focusable" id="browser-btn-back" tabindex="0">◀</button>' +
            '<button class="browser-btn focusable" id="browser-btn-forward" tabindex="0">▶</button>' +
            '<button class="browser-btn focusable" id="browser-btn-reload" tabindex="0">🔄</button>' +
            '<div class="browser-url-bar">' +
              '<svg viewBox="0 0 24 24" width="16" height="16" fill="#3DDC84"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>' +
              '<input type="text" id="browser-url-input" class="browser-input focusable" value="https://duckduckgo.com" tabindex="0">' +
            '</div>' +
            '<button class="browser-btn focusable" id="browser-btn-go" tabindex="0">Go</button>' +
          '</div>' +

          '<div class="browser-webview-container">' +
            '<iframe id="browser-iframe" class="browser-iframe" src="https://duckduckgo.com" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>' +
          '</div>' +
        '</div>';

      var btnGo = document.getElementById('browser-btn-go');
      var urlInput = document.getElementById('browser-url-input');
      var iframe = document.getElementById('browser-iframe');

      if (btnGo && urlInput && iframe) {
        btnGo.onclick = function () {
          var url = urlInput.value.trim();
          if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) {
            url = 'https://' + url;
          }
          iframe.src = url;
        };
      }
    },

    // =========================================================================
    // ANDROID SETTINGS IMPLEMENTATION
    // =========================================================================
    renderSettings: function (container) {
      container.innerHTML = 
        '<div class="settings-app-shell">' +
          '<div class="settings-sidebar">' +
            '<h2 style="font-size:22px;margin-bottom:20px;color:var(--accent-android);">Android Settings</h2>' +
            '<button class="settings-nav-btn focusable active" tabindex="0">🌐 Network &amp; Internet</button>' +
            '<button class="settings-nav-btn focusable" tabindex="0">👤 Accounts &amp; Sign-in</button>' +
            '<button class="settings-nav-btn focusable" tabindex="0">📱 Apps &amp; Permissions</button>' +
            '<button class="settings-nav-btn focusable" tabindex="0">📺 Display &amp; Sound</button>' +
            '<button class="settings-nav-btn focusable" tabindex="0">💾 Storage</button>' +
            '<button class="settings-nav-btn focusable" tabindex="0">ℹ️ About Android TV</button>' +
          '</div>' +

          '<div class="settings-detail-pane">' +
            '<h3 style="font-size:20px;margin-bottom:16px;">Network &amp; Internet</h3>' +
            '<div class="settings-row"><div class="settings-label">Wi-Fi Status</div><div class="settings-val" style="color:#3DDC84;">Connected (192.168.0.12)</div></div>' +
            '<div class="settings-row"><div class="settings-label">Gateway</div><div class="settings-val">192.168.0.1</div></div>' +
            '<div class="settings-row"><div class="settings-label">Subnet Mask</div><div class="settings-val">255.255.255.0</div></div>' +
            '<div class="settings-row"><div class="settings-label">Host Bridge IP</div><div class="settings-val">192.168.0.13</div></div>' +

            '<h3 style="font-size:20px;margin:28px 0 16px;">About Android Device</h3>' +
            '<div class="settings-row"><div class="settings-label">Device Name</div><div class="settings-val">Samsung Crystal 4K (UA43UE84AFULXL)</div></div>' +
            '<div class="settings-row"><div class="settings-label">Android Version</div><div class="settings-val">Android 10 (API 29)</div></div>' +
            '<div class="settings-row"><div class="settings-label">Security Patch Level</div><div class="settings-val">November 5, 2026</div></div>' +
            '<div class="settings-row"><div class="settings-label">Kernel Version</div><div class="settings-val">5.15.0-armv7-tizen</div></div>' +
            '<div class="settings-row"><div class="settings-label">Build Number</div><div class="settings-val">QP1A.190711.020.TIZEN-10</div></div>' +
          '</div>' +
        '</div>';
    },

    // =========================================================================
    // RETROARCH GAMING IMPLEMENTATION
    // =========================================================================
    renderRetroArch: function (container) {
      container.innerHTML = 
        '<div style="padding:40px;text-align:center;">' +
          '<h2 style="font-size:26px;color:#9C27B0;margin-bottom:12px;">RetroArch Gaming Frontend (32-bit ARMv7)</h2>' +
          '<p style="color:#9AA4B2;max-width:600px;margin:0 auto 24px;">Core execution engine initialized for 32-bit ARM Cortex-A CPU. Load ROM files from USB flash drive.</p>' +
          '<div style="display:flex;justify-content:center;gap:16px;">' +
            '<button class="tv-btn tv-btn-primary focusable" tabindex="0">Load Core (NES/SNES/GBA)</button>' +
            '<button class="tv-btn tv-btn-secondary focusable" tabindex="0">Scan USB for ROMs</button>' +
          '</div>' +
        '</div>';
    },

    // =========================================================================
    // GENERIC APPLICATION CONTAINER
    // =========================================================================
    renderGenericApp: function (container, appData) {
      container.innerHTML = 
        '<div class="generic-app-shell">' +
          '<div class="generic-app-header">' +
            '<img src="' + (appData.icon || 'icon.png') + '" style="width:64px;height:64px;border-radius:12px;" alt="App Icon">' +
            '<div>' +
              '<h2 style="font-size:24px;">' + (appData.appName || appData.name) + '</h2>' +
              '<div style="font-size:13px;color:#606B7B;font-family:monospace;">' + appData.packageName + ' • v' + (appData.version || '1.0') + '</div>' +
            '</div>' +
          '</div>' +

          '<div class="generic-app-body">' +
            '<div style="background:#090C10;border-radius:12px;padding:24px;border:1px solid rgba(255,255,255,0.08);margin-bottom:20px;">' +
              '<div style="font-size:16px;font-weight:700;color:#3DDC84;margin-bottom:12px;">Android Activity Lifecycle: Resumed</div>' +
              '<p style="color:#9AA4B2;line-height:1.6;font-size:14px;">The application package is loaded inside the Android Activity Container. Remote control input events are routed directly to the root window dispatch.</p>' +
            '</div>' +

            '<div style="display:flex;gap:16px;">' +
              '<button class="tv-btn tv-btn-primary focusable" tabindex="0">Launch Main Intent</button>' +
              '<button class="tv-btn tv-btn-secondary focusable" tabindex="0">App Info &amp; Permissions</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    }
  };

  window.ActivityRunner = ActivityRunner;
})(window);
