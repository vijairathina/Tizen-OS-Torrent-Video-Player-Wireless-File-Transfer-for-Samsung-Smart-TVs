/**
 * Android TV on Samsung Tizen TV
 * 2D Spatial Navigation Engine & D-Pad Remote Focus Manager
 */

(function (window) {
  'use strict';

  var SpatialNav = {
    currentFocus: null,
    isModalActive: false,
    activeModalEl: null,

    init: function () {
      var self = this;
      window.addEventListener('keydown', function (e) {
        self.handleKeyDown(e);
      });

      // Mouse click fallback for desktop testing
      document.addEventListener('click', function (e) {
        var focusable = e.target.closest('.focusable');
        if (focusable) {
          self.setFocus(focusable);
        }
      });

      // Set initial focus
      setTimeout(function () {
        self.focusFirstAvailable();
      }, 150);
    },

    setModal: function (modalElement, active) {
      this.isModalActive = active;
      this.activeModalEl = active ? modalElement : null;
      if (active && modalElement) {
        var first = modalElement.querySelector('.focusable');
        if (first) {
          this.setFocus(first);
        }
      } else {
        this.focusFirstAvailable();
      }
    },

    focusFirstAvailable: function () {
      var scope = this.isModalActive && this.activeModalEl ? this.activeModalEl : document;
      // First try active view or nav
      var activeTab = document.querySelector('.nav-tab.active');
      if (activeTab && !this.isModalActive) {
        this.setFocus(activeTab);
        return;
      }
      var candidate = scope.querySelector('.focusable:not([disabled])');
      if (candidate) {
        this.setFocus(candidate);
      }
    },

    setFocus: function (el) {
      if (!el) return;
      if (this.currentFocus && this.currentFocus !== el) {
        this.currentFocus.classList.remove('focused');
        this.currentFocus.blur();
      }
      this.currentFocus = el;
      el.classList.add('focused');
      el.focus();
      this.scrollIntoViewIfNeeded(el);
    },

    scrollIntoViewIfNeeded: function (el) {
      try {
        el.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      } catch (e) {
        // Fallback
      }
    },

    handleKeyDown: function (e) {
      var key = e.keyCode || e.which;
      var handled = false;

      switch (key) {
        case window.TVKeys.KEY_UP:
          this.moveDirection('up');
          window.TVKeys.playClickSound('dpad');
          handled = true;
          break;

        case window.TVKeys.KEY_DOWN:
          this.moveDirection('down');
          window.TVKeys.playClickSound('dpad');
          handled = true;
          break;

        case window.TVKeys.KEY_LEFT:
          this.moveDirection('left');
          window.TVKeys.playClickSound('dpad');
          handled = true;
          break;

        case window.TVKeys.KEY_RIGHT:
          this.moveDirection('right');
          window.TVKeys.playClickSound('dpad');
          handled = true;
          break;

        case window.TVKeys.KEY_ENTER:
          if (this.currentFocus) {
            window.TVKeys.playClickSound('enter');
            this.currentFocus.click();
          }
          handled = true;
          break;

        case window.TVKeys.KEY_RETURN:
        case window.TVKeys.KEY_BACK:
          window.TVKeys.playClickSound('back');
          if (this.isModalActive && window.APKInstaller) {
            window.APKInstaller.closeModal();
            handled = true;
          } else if (window.AndroidApp && window.AndroidApp.currentTab !== 'tab-home') {
            window.AndroidApp.switchTab('tab-home');
            handled = true;
          } else {
            // Already at home: Show exit prompt or confirm
            console.log('[SpatialNav] Back at home screen');
          }
          break;
      }

      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    },

    moveDirection: function (direction) {
      var scope = this.isModalActive && this.activeModalEl ? this.activeModalEl : document;
      var focusables = Array.prototype.slice.call(
        scope.querySelectorAll('.focusable:not([disabled])')
      ).filter(function (el) {
        // Ensure element is visible
        return el.offsetParent !== null && window.getComputedStyle(el).display !== 'none';
      });

      if (!focusables.length) return;

      if (!this.currentFocus || focusables.indexOf(this.currentFocus) === -1) {
        this.setFocus(focusables[0]);
        return;
      }

      var currentRect = this.currentFocus.getBoundingClientRect();
      var currentCenter = {
        x: currentRect.left + currentRect.width / 2,
        y: currentRect.top + currentRect.height / 2
      };

      var bestCandidate = null;
      var bestScore = Infinity;

      for (var i = 0; i < focusables.length; i++) {
        var candidate = focusables[i];
        if (candidate === this.currentFocus) continue;

        var targetRect = candidate.getBoundingClientRect();
        var targetCenter = {
          x: targetRect.left + targetRect.width / 2,
          y: targetRect.top + targetRect.height / 2
        };

        var dx = targetCenter.x - currentCenter.x;
        var dy = targetCenter.y - currentCenter.y;

        var isValidDirection = false;
        if (direction === 'left' && dx < -5) isValidDirection = true;
        if (direction === 'right' && dx > 5) isValidDirection = true;
        if (direction === 'up' && dy < -5) isValidDirection = true;
        if (direction === 'down' && dy > 5) isValidDirection = true;

        if (!isValidDirection) continue;

        // Euclidean distance with directional alignment weighting
        var primaryDist = (direction === 'left' || direction === 'right') ? Math.abs(dx) : Math.abs(dy);
        var orthogonalDist = (direction === 'left' || direction === 'right') ? Math.abs(dy) : Math.abs(dx);
        
        // Penalize perpendicular distance heavily to avoid erratic jumping
        var score = primaryDist + (orthogonalDist * 2.5);

        if (score < bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }

      if (bestCandidate) {
        this.setFocus(bestCandidate);
      }
    }
  };

  window.SpatialNav = SpatialNav;
})(window);
