/**
 * Android TV on Samsung Tizen TV
 * Master Application Controller & Lifecycle Coordinator
 */

(function (window) {
  'use strict';

  var AndroidApp = {
    currentTab: 'tab-home',

    init: function () {
      console.log('[AndroidApp] Initializing Android TV Environment on Tizen...');
      
      // 1. Setup Clock
      this.initClock();

      // 2. Setup Navigation Tabs
      this.initTabs();

      // 3. Initialize Subsystems
      window.TVKeys.registerTizenKeys();
      window.SpatialNav.init();
      window.APKInstaller.init();
      window.RuntimeManager.init();
      window.AppStore.init();
      window.APKInstaller.renderInstalledApps();

      // 4. Initialize USB Storage & scan default drive
      this.initStorageExplorer();

      // 5. Connect Modal Close & Action Handlers
      this.initModalActions();

      console.log('[AndroidApp] Initialization Complete.');
    },

    initClock: function () {
      var clockEl = document.getElementById('tv-clock');
      function update() {
        if (!clockEl) return;
        var now = new Date();
        var h = String(now.getHours()).padStart(2, '0');
        var m = String(now.getMinutes()).padStart(2, '0');
        clockEl.innerText = h + ':' + m;
      }
      update();
      setInterval(update, 1000);
    },

    initTabs: function () {
      var self = this;
      var tabs = document.querySelectorAll('.nav-tab');

      for (var i = 0; i < tabs.length; i++) {
        tabs[i].addEventListener('click', function () {
          var targetTabId = this.getAttribute('data-target');
          self.switchTab(targetTabId);
        });
      }
    },

    switchTab: function (tabId) {
      if (this.currentTab === tabId) return;

      // Update Nav Tabs
      var tabs = document.querySelectorAll('.nav-tab');
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].getAttribute('data-target') === tabId) {
          tabs[i].classList.add('active');
        } else {
          tabs[i].classList.remove('active');
        }
      }

      // Update Content Views
      var views = document.querySelectorAll('.view-section');
      for (var j = 0; j < views.length; j++) {
        if (views[j].id === tabId) {
          views[j].classList.add('active');
        } else {
          views[j].classList.remove('active');
        }
      }

      this.currentTab = tabId;

      // When switching to installer/files, refresh storage list
      if (tabId === 'tab-installer' || tabId === 'tab-files') {
        this.renderStorageList();
      }

      // Focus first element in view
      setTimeout(function () {
        var activeView = document.getElementById(tabId);
        if (activeView) {
          var first = activeView.querySelector('.focusable');
          if (first) window.SpatialNav.setFocus(first);
        }
      }, 80);
    },

    initStorageExplorer: function () {
      var self = this;
      window.USBManager.init().then(function (storages) {
        self.renderStorageList();
        if (storages.length > 0) {
          self.loadStorageFiles(storages[0].id);
        }
      });
    },

    renderStorageList: function () {
      var listContainer = document.getElementById('storage-sources-list');
      if (!listContainer) return;

      listContainer.innerHTML = '';
      var self = this;
      var storages = window.USBManager.connectedStorages;

      for (var i = 0; i < storages.length; i++) {
        var s = storages[i];
        var item = document.createElement('div');
        item.className = 'storage-item focusable' + (window.USBManager.currentStorage && window.USBManager.currentStorage.id === s.id ? ' active' : '');
        item.setAttribute('tabindex', '0');
        item.setAttribute('data-storage-id', s.id);

        item.innerHTML = 
          '<svg class="storage-icon" viewBox="0 0 24 24">' +
            (s.type === 'usb' 
              ? '<path d="M15 7v4h1v2h-3V5h2l-3-4-3 4h2v8H8v-2.07c.7-.37 1.2-1.08 1.2-1.93 0-1.21-.99-2.2-2.2-2.2-1.21 0-2.2.99-2.2 2.2 0 .85.5 1.56 1.2 1.93V13c0 1.11.89 2 2 2h3v3.05c-.71.37-1.2 1.1-1.2 1.95 0 1.22.99 2.2 2.2 2.2 1.21 0 2.2-.98 2.2-2.2 0-.85-.49-1.58-1.2-1.95V15h3c1.11 0 2-.89 2-2v-2h1V7h-4z"/>'
              : '<path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/>') +
          '</svg>' +
          '<div class="storage-details">' +
            '<div class="storage-name">' + s.name + '</div>' +
            '<div class="storage-meta">' + s.available + ' free of ' + s.capacity + '</div>' +
          '</div>';

        item.onclick = (function (st) {
          return function () {
            window.USBManager.currentStorage = st;
            self.renderStorageList();
            self.loadStorageFiles(st.id);
          };
        })(s);

        listContainer.appendChild(item);
      }
    },

    loadStorageFiles: function (storageId) {
      var fileListContainer = document.getElementById('browser-file-list');
      var pathLabel = document.getElementById('browser-current-path');
      if (!fileListContainer) return;

      fileListContainer.innerHTML = '<div style="padding:20px;color:var(--text-secondary);">Scanning storage for APK packages...</div>';
      if (pathLabel) pathLabel.innerText = storageId + ':/APKs';

      window.USBManager.scanFolderForAPKs(storageId).then(function (apks) {
        fileListContainer.innerHTML = '';
        if (apks.length === 0) {
          fileListContainer.innerHTML = '<div style="padding:20px;color:var(--text-muted);">No .apk installation files found in this directory.</div>';
          return;
        }

        for (var i = 0; i < apks.length; i++) {
          var apk = apks[i];
          var row = document.createElement('div');
          row.className = 'file-row focusable';
          row.setAttribute('tabindex', '0');

          row.innerHTML = 
            '<div class="file-main-info">' +
              '<svg class="file-icon" viewBox="0 0 24 24" fill="#3DDC84"><path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.68-.05-.85.26l-1.89 3.26c-1.44-.65-3.04-1.02-4.74-1.02-1.7 0-3.3.37-4.74 1.02L5.07 5.71c-.16-.31-.55-.41-.85-.26-.3.16-.42.54-.26.85l1.84 3.18C2.64 11.23 0 14.79 0 19h24c0-4.21-2.64-7.77-5.8-9.52zM7 15.25c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25zm10 0c-.69 0-1.25-.56-1.25-1.25s.56-1.25 1.25-1.25 1.25.56 1.25 1.25-.56 1.25-1.25 1.25z"/></svg>' +
              '<div>' +
                '<div class="file-name">' + apk.name + '</div>' +
                '<div style="font-size:12px;color:var(--text-muted);">' + (apk.arch || '32-bit ARMv7') + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="file-size">' + apk.size + '</div>';

          row.onclick = (function (item) {
            return function () {
              if (window.APKInstaller) {
                window.APKInstaller.inspectAPK(item);
              }
            };
          })(apk);

          fileListContainer.appendChild(row);
        }
      });
    },

    initModalActions: function () {
      var btnClose = document.getElementById('btn-modal-cancel');
      var btnInstall = document.getElementById('btn-modal-install');

      if (btnClose) {
        btnClose.onclick = function () {
          window.APKInstaller.closeModal();
        };
      }

      if (btnInstall) {
        btnInstall.onclick = function () {
          window.APKInstaller.startInstallationWorkflow();
        };
      }

      // Quick Action button on Home Screen
      var quickInstallBtn = document.getElementById('btn-quick-install');
      if (quickInstallBtn) {
        quickInstallBtn.onclick = function () {
          AndroidApp.switchTab('tab-installer');
        };
      }

      var quickStoreBtn = document.getElementById('btn-quick-store');
      if (quickStoreBtn) {
        quickStoreBtn.onclick = function () {
          AndroidApp.switchTab('tab-store');
        };
      }

      // Google Login Modal Handlers
      var btnCloseGoogle = document.getElementById('btn-close-google-modal');
      if (btnCloseGoogle) {
        btnCloseGoogle.onclick = function () {
          window.AppStore.closeGoogleLoginModal();
        };
      }

      var btnConfirmPair = document.getElementById('btn-confirm-device-pair');
      if (btnConfirmPair) {
        btnConfirmPair.onclick = function () {
          window.AppStore.connectGoogleAccount('demo.user@example.com', 'Demo User');
        };
      }

      var btnSubmitDirect = document.getElementById('btn-submit-direct-login');
      if (btnSubmitDirect) {
        btnSubmitDirect.onclick = function () {
          var emailInput = document.getElementById('google-input-email');
          var email = (emailInput && emailInput.value.trim()) || 'demo.user@example.com';
          window.AppStore.connectGoogleAccount(email, email.split('@')[0]);
        };
      }

      var btnQuickGoogle = document.getElementById('btn-quick-google-demo');
      if (btnQuickGoogle) {
        btnQuickGoogle.onclick = function () {
          window.AppStore.connectGoogleAccount('smart.tv@example.com', 'Smart TV');
        };
      }
    }
  };

  window.AndroidApp = AndroidApp;

  // Launch on DOM ready
  window.addEventListener('DOMContentLoaded', function () {
    AndroidApp.init();
  });
})(window);
