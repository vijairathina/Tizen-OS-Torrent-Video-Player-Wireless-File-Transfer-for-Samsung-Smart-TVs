/**
 * Android TV on Samsung Tizen TV
 * Remote Control Keycode Definitions & Input Device Registration
 */

(function (window) {
  'use strict';

  var TVKeys = {
    // Standard Tizen Remote Keycodes
    KEY_LEFT: 37,
    KEY_UP: 38,
    KEY_RIGHT: 39,
    KEY_DOWN: 40,
    KEY_ENTER: 13,
    KEY_RETURN: 10009, // Tizen Return / Back
    KEY_BACK: 27,      // Browser Escape / Fallback Back
    
    // Media & Control Keys
    KEY_PLAY: 415,
    KEY_PAUSE: 19,
    KEY_STOP: 413,
    KEY_FAST_FORWARD: 417,
    KEY_REWIND: 412,
    KEY_PLAY_PAUSE: 10252,

    // Number Keys
    KEY_0: 48,
    KEY_1: 49,
    KEY_2: 50,
    KEY_3: 51,
    KEY_4: 52,
    KEY_5: 53,
    KEY_6: 54,
    KEY_7: 55,
    KEY_8: 56,
    KEY_9: 57,

    // Color Keys
    KEY_RED: 403,
    KEY_GREEN: 404,
    KEY_YELLOW: 405,
    KEY_BLUE: 406,

    // Volume & Channel
    KEY_VOL_UP: 447,
    KEY_VOL_DOWN: 448,
    KEY_MUTE: 449,
    KEY_CH_UP: 427,
    KEY_CH_DOWN: 428,

    // Web Audio Sound Synthesizer for Remote Clicks
    audioCtx: null,

    initAudioFeedback: function () {
      try {
        var AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.audioCtx = new AudioContext();
        }
      } catch (e) {
        console.warn('[TVKeys] Web Audio not available for click sounds:', e);
      }
    },

    playClickSound: function (type) {
      if (!this.audioCtx) return;
      try {
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }
        var osc = this.audioCtx.createOscillator();
        var gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        var now = this.audioCtx.currentTime;
        if (type === 'enter') {
          osc.frequency.setValueAtTime(580, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
          gain.gain.setValueAtTime(0.08, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc.start(now);
          osc.stop(now + 0.08);
        } else if (type === 'back') {
          osc.frequency.setValueAtTime(420, now);
          osc.frequency.exponentialRampToValueAtTime(260, now + 0.08);
          gain.gain.setValueAtTime(0.06, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc.start(now);
          osc.stop(now + 0.08);
        } else {
          // Subtle D-pad tick
          osc.frequency.setValueAtTime(750, now);
          gain.gain.setValueAtTime(0.03, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
          osc.start(now);
          osc.stop(now + 0.04);
        }
      } catch (e) {
        // Silently ignore audio playback errors
      }
    },

    registerTizenKeys: function () {
      try {
        if (window.tizen && window.tizen.tvinputdevice) {
          var inputDevice = window.tizen.tvinputdevice;
          var keysToRegister = [
            'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
            'MediaFastForward', 'MediaRewind',
            '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
            'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'
          ];
          for (var i = 0; i < keysToRegister.length; i++) {
            try {
              inputDevice.registerKey(keysToRegister[i]);
            } catch (kErr) {
              // Ignore unsupported keys
            }
          }
          console.log('[TVKeys] Samsung TV remote keys registered successfully.');
        }
      } catch (err) {
        console.warn('[TVKeys] Samsung tvinputdevice API not found (running in standard browser)');
      }
      this.initAudioFeedback();
    }
  };

  window.TVKeys = TVKeys;
})(window);
