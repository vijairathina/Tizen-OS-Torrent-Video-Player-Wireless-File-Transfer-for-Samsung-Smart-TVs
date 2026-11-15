/**
 * Spatial Navigation and Samsung TV Remote Control Key Handling Engine
 * Supports Tizen TV WebAPIs and Standard DOM Key Events
 */

window.Navigation = (function() {
    'use strict';

    // Tizen and Standard Remote Key Codes
    const KEY_CODES = {
        TAB: 9,
        RETURN: 10009,
        BACKSPACE: 8,
        ESCAPE: 27,
        LEFT: 37,
        UP: 38,
        RIGHT: 39,
        DOWN: 40,
        ENTER: 13,
        PLAY: 415,
        PAUSE: 19,
        STOP: 413,
        FAST_FORWARD: 417,
        REWIND: 412,
        PLAY_PAUSE: 10252,
        RED: 403,
        GREEN: 404,
        YELLOW: 405,
        BLUE: 406
    };

    let currentFocusedElement = null;
    let isNavigationEnabled = true;

    function init() {
        registerTizenKeys();
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        // Default focus on first available tab or card
        setTimeout(focusInitialElement, 200);
    }

    function registerTizenKeys() {
        if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
            const keysToRegister = [
                'MediaPlay',
                'MediaPause',
                'MediaStop',
                'MediaFastForward',
                'MediaRewind',
                'MediaPlayPause',
                'ColorF0Red',
                'ColorF1Green',
                'ColorF2Yellow',
                'ColorF3Blue'
            ];
            keysToRegister.forEach(key => {
                try {
                    tizen.tvinputdevice.registerKey(key);
                } catch (e) {
                    console.warn('[Navigation] Could not register TV key:', key, e);
                }
            });
        }
    }

    function getActiveModal() {
        const modal = document.querySelector(
            '#amnis-hud-backdrop.dialog-open, #amnis-hud-backdrop.hud-visible, ' +
            '#player-hud-backdrop.dialog-open, #player-hud-backdrop.hud-visible, ' +
            '.app-dialog-backdrop.dialog-open, .app-dialog-backdrop.hud-visible'
        );
        if (modal) {
            const style = window.getComputedStyle(modal);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
                return modal;
            }
        }
        return null;
    }

    function getVisibleFocusables() {
        // 1. If any modal dialog (Torrent HUD, Settings, Subtitles, URL) is currently active,
        // focus navigation MUST be strictly restricted inside this dialog!
        const activeModal = getActiveModal();
        if (activeModal) {
            const modalCandidates = Array.from(activeModal.querySelectorAll('.focusable:not([disabled])'));
            return modalCandidates.filter(el => {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                return (
                    rect.width > 0 &&
                    rect.height > 0 &&
                    style.visibility !== 'hidden' &&
                    style.display !== 'none' &&
                    style.opacity !== '0'
                );
            });
        }

        // 2. If player is active, ONLY search in player-container!
        if (window.Player && window.Player.isActive()) {
            const playerContainer = document.getElementById('player-container');
            if (playerContainer) {
                const candidates = Array.from(playerContainer.querySelectorAll('.focusable:not([disabled])'));
                return candidates.filter(el => {
                    const rect = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    return (
                        rect.width > 0 &&
                        rect.height > 0 &&
                        style.visibility !== 'hidden' &&
                        style.display !== 'none' &&
                        style.opacity !== '0'
                    );
                });
            }
        }

        // 3. Otherwise, search within active view, or fallback to document
        const activeView = document.querySelector('.app-view.active-view');
        const container = activeView || document;

        const candidates = Array.from(container.querySelectorAll('.focusable:not([disabled])'));
        return candidates.filter(el => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return (
                rect.width > 0 &&
                rect.height > 0 &&
                style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                style.opacity !== '0'
            );
        });
    }

    function focusInitialElement() {
        // If modal dialog is open, focus inside it (prefer Close button on HUD so user can easily dismiss)
        const activeModal = getActiveModal();
        if (activeModal) {
            const closeBtn = activeModal.querySelector('#hud-close-btn');
            if (closeBtn) {
                setFocus(closeBtn);
                return;
            }
            const modalFocusables = getVisibleFocusables();
            if (modalFocusables.length > 0) {
                setFocus(modalFocusables[0]);
                return;
            }
        }

        // If inside an active view, focus the first element inside that view!
        const activeView = document.querySelector('.app-view.active-view');
        if (activeView) {
            const viewFocusables = Array.from(activeView.querySelectorAll('.focusable:not([disabled])')).filter(el => {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                return (
                    rect.width > 0 &&
                    rect.height > 0 &&
                    style.visibility !== 'hidden' &&
                    style.display !== 'none' &&
                    style.opacity !== '0'
                );
            });
            if (viewFocusables.length > 0) {
                setFocus(viewFocusables[0]);
                return;
            }
        }

        const focusables = getVisibleFocusables();
        if (focusables.length > 0) {
            setFocus(focusables[0]);
        }
    }

    function setFocus(element) {
        if (!element) return;
        const activeModal = getActiveModal();
        if (activeModal && !activeModal.contains(element)) {
            // Block background elements from stealing focus while a modal is active
            return;
        }
        if (currentFocusedElement && currentFocusedElement !== element) {
            currentFocusedElement.classList.remove('focused');
            currentFocusedElement.blur();
        }
        currentFocusedElement = element;
        currentFocusedElement.classList.add('focused');
        currentFocusedElement.focus();
        currentFocusedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }

    function move(direction) {
        const activeModal = getActiveModal();

        // If modal is active, focus MUST be inside it.
        // If current focus is lost or outside, snap to modal immediately!
        if (activeModal) {
            if (!currentFocusedElement || !activeModal.contains(currentFocusedElement)) {
                focusInitialElement();
                return;
            }
        } else if (!currentFocusedElement) {
            focusInitialElement();
            return;
        }

        const focusables = getVisibleFocusables();
        if (focusables.length <= 1) return;

        // If inside a modal with 2 buttons (e.g. Play and Close in HUD)
        if (activeModal && focusables.length === 2) {
            const currentIndex = focusables.indexOf(currentFocusedElement);
            if (currentIndex !== -1) {
                if (direction === 'left' || direction === 'right') {
                    const otherIndex = (currentIndex === 0) ? 1 : 0;
                    setFocus(focusables[otherIndex]);
                    return;
                } else if (direction === 'up' || direction === 'down') {
                    // Stay inside modal on current button
                    return;
                }
            }
        }

        const currentRect = currentFocusedElement.getBoundingClientRect();
        const currentCenter = {
            x: currentRect.left + currentRect.width / 2,
            y: currentRect.top + currentRect.height / 2
        };

        let bestCandidate = null;
        let minDistance = Infinity;

        focusables.forEach(target => {
            if (target === currentFocusedElement) return;

            const targetRect = target.getBoundingClientRect();
            const targetCenter = {
                x: targetRect.left + targetRect.width / 2,
                y: targetRect.top + targetRect.height / 2
            };

            const dx = targetCenter.x - currentCenter.x;
            const dy = targetCenter.y - currentCenter.y;

            // Directional filter
            let isValidDirection = false;
            if (direction === 'left' && dx < -8 && Math.abs(dx) > Math.abs(dy) * 0.4) isValidDirection = true;
            if (direction === 'right' && dx > 8 && Math.abs(dx) > Math.abs(dy) * 0.4) isValidDirection = true;
            if (direction === 'up' && dy < -8 && Math.abs(dy) > Math.abs(dx) * 0.4) isValidDirection = true;
            if (direction === 'down' && dy > 8 && Math.abs(dy) > Math.abs(dx) * 0.4) isValidDirection = true;

            if (isValidDirection) {
                // Euclidean distance with directional weighting
                const distance = Math.hypot(dx, dy);
                if (distance < minDistance) {
                    minDistance = distance;
                    bestCandidate = target;
                }
            }
        });

        if (bestCandidate) {
            setFocus(bestCandidate);
        }
    }

    function handleKeyDown(e) {
        if (!isNavigationEnabled) return;

        const keyCode = e.keyCode;
        const activeModal = getActiveModal();

        // 1. If an active modal is open on screen, STRICTLY trap and route keys inside the modal only
        if (activeModal) {
            // If focus was somehow lost or outside, immediately snap to modal
            if (!currentFocusedElement || !activeModal.contains(currentFocusedElement)) {
                focusInitialElement();
            }

            // Return / Back key dismisses the modal
            if (keyCode === KEY_CODES.RETURN || keyCode === KEY_CODES.BACKSPACE || keyCode === KEY_CODES.ESCAPE) {
                e.preventDefault();
                handleReturnKey();
                return;
            }

            switch (keyCode) {
                case KEY_CODES.LEFT:
                    e.preventDefault();
                    move('left');
                    return;
                case KEY_CODES.RIGHT:
                    e.preventDefault();
                    move('right');
                    return;
                case KEY_CODES.UP:
                    e.preventDefault();
                    move('up');
                    return;
                case KEY_CODES.DOWN:
                    e.preventDefault();
                    move('down');
                    return;
                case KEY_CODES.ENTER:
                    e.preventDefault();
                    if (currentFocusedElement) {
                        currentFocusedElement.click();
                    }
                    return;
            }
            return;
        }

        // 2. Custom player key handling if player is active (and no modal is open)
        if (window.Player && window.Player.isActive()) {
            if (handlePlayerKeys(keyCode, e)) {
                return;
            }
        }

        switch (keyCode) {
            case KEY_CODES.LEFT:
                e.preventDefault();
                move('left');
                break;
            case KEY_CODES.RIGHT:
                e.preventDefault();
                move('right');
                break;
            case KEY_CODES.UP:
                e.preventDefault();
                move('up');
                break;
            case KEY_CODES.DOWN:
                e.preventDefault();
                move('down');
                break;
            case KEY_CODES.ENTER:
                if (currentFocusedElement) {
                    currentFocusedElement.click();
                }
                break;
            case KEY_CODES.TAB:
                e.preventDefault();
                const focusables = getVisibleFocusables();
                if (focusables.length === 0) break;
                let currentIndex = focusables.indexOf(currentFocusedElement);
                let nextIndex;
                if (e.shiftKey) {
                    nextIndex = (currentIndex - 1 + focusables.length) % focusables.length;
                } else {
                    nextIndex = (currentIndex + 1) % focusables.length;
                }
                setFocus(focusables[nextIndex]);
                break;
            case KEY_CODES.RETURN:
            case KEY_CODES.BACKSPACE:
            case KEY_CODES.ESCAPE:
                e.preventDefault();
                handleReturnKey();
                break;
            default:
                break;
        }
    }

    function handleKeyUp(e) {
        if (!isNavigationEnabled) return;

        if (window.Player && window.Player.isActive()) {
            const keyCode = e.keyCode;
            if (keyCode === KEY_CODES.LEFT || keyCode === KEY_CODES.RIGHT ||
                keyCode === KEY_CODES.FAST_FORWARD || keyCode === KEY_CODES.REWIND) {
                if (window.Player.finishScrubbing) {
                    window.Player.finishScrubbing();
                }
            }
        }
    }

    function handlePlayerKeys(keyCode, e) {
        // If an overlay/dialog (Torrent Info HUD or Subtitle modal) is open inside player
        const activeModal = getActiveModal();
        if (activeModal) {
            if (keyCode === KEY_CODES.RETURN || keyCode === KEY_CODES.BACKSPACE || keyCode === KEY_CODES.ESCAPE) {
                e.preventDefault();
                handleReturnKey();
                return true;
            }
            // Allow default spatial navigation inside the HUD dialog
            return false;
        }

        // If scrubbing was active and user pressed another key, commit scrub first
        if (keyCode !== KEY_CODES.LEFT && keyCode !== KEY_CODES.RIGHT &&
            keyCode !== KEY_CODES.FAST_FORWARD && keyCode !== KEY_CODES.REWIND) {
            if (window.Player.isScrubbingActive && window.Player.isScrubbingActive()) {
                window.Player.finishScrubbing();
            }
        }

        // Dedicated hardware player buttons on Samsung remote
        if (keyCode === KEY_CODES.PLAY) {
            e.preventDefault();
            window.Player.play();
            return true;
        }
        if (keyCode === KEY_CODES.PAUSE) {
            e.preventDefault();
            window.Player.pause();
            return true;
        }
        if (keyCode === KEY_CODES.PLAY_PAUSE) {
            e.preventDefault();
            window.Player.togglePlayPause();
            return true;
        }
        if (keyCode === KEY_CODES.STOP) {
            e.preventDefault();
            window.Player.close();
            return true;
        }
        if (keyCode === KEY_CODES.FAST_FORWARD) {
            e.preventDefault();
            window.Player.seekRelative(15);
            return true;
        }
        if (keyCode === KEY_CODES.REWIND) {
            e.preventDefault();
            window.Player.seekRelative(-15);
            return true;
        }
        if (keyCode === KEY_CODES.RETURN || keyCode === KEY_CODES.BACKSPACE || keyCode === KEY_CODES.ESCAPE) {
            e.preventDefault();
            window.Player.close();
            return true;
        }

        // Directional and action keys (D-pad UP/DOWN/LEFT/RIGHT, ENTER)
        const playBtn = document.getElementById('osd-play-btn');
        const timelineBox = document.getElementById('osd-timeline-box');
        const osdVisible = window.Player.isOsdVisible ? window.Player.isOsdVisible() : true;

        // If OSD is currently hidden, any D-pad key shows OSD and focuses appropriate control
        if (!osdVisible) {
            window.Player.showOSD();
            if (keyCode === KEY_CODES.DOWN) {
                if (timelineBox) setFocus(timelineBox);
            } else {
                if (playBtn) setFocus(playBtn);
            }
            e.preventDefault();
            return true;
        }

        // Always keep OSD visible on any user interaction
        window.Player.showOSD();

        // 1. Focus is on TIMELINE BOX
        if (currentFocusedElement && (currentFocusedElement.id === 'osd-timeline-box' || currentFocusedElement.classList.contains('osd-timeline-box'))) {
            switch (keyCode) {
                case KEY_CODES.LEFT:
                    e.preventDefault();
                    window.Player.seekRelative(-10);
                    return true;
                case KEY_CODES.RIGHT:
                    e.preventDefault();
                    window.Player.seekRelative(10);
                    return true;
                case KEY_CODES.UP:
                    e.preventDefault();
                    if (playBtn) setFocus(playBtn);
                    return true;
                case KEY_CODES.DOWN:
                    e.preventDefault();
                    return true; // Stay on timeline
                case KEY_CODES.ENTER:
                    e.preventDefault();
                    window.Player.togglePlayPause();
                    return true;
            }
        }

        // 2. Focus is on CENTER PLAY/PAUSE BUTTON
        if (currentFocusedElement && currentFocusedElement.id === 'osd-play-btn') {
            switch (keyCode) {
                case KEY_CODES.DOWN:
                    e.preventDefault();
                    if (timelineBox) setFocus(timelineBox);
                    return true;
                case KEY_CODES.UP:
                    e.preventDefault();
                    const topBtn = document.getElementById('osd-info-btn') || document.getElementById('osd-close-btn');
                    if (topBtn) setFocus(topBtn);
                    return true;
                case KEY_CODES.LEFT:
                    e.preventDefault();
                    window.Player.seekRelative(-10);
                    return true;
                case KEY_CODES.RIGHT:
                    e.preventDefault();
                    window.Player.seekRelative(10);
                    return true;
                case KEY_CODES.ENTER:
                    e.preventDefault();
                    window.Player.togglePlayPause();
                    return true;
            }
        }

        // 3. Focus is on TOP ACTION BUTTONS (Stream Info, Subs, Aspect, Exit)
        const isTopAction = currentFocusedElement && currentFocusedElement.closest('.osd-top-actions');
        if (isTopAction) {
            switch (keyCode) {
                case KEY_CODES.DOWN:
                    e.preventDefault();
                    if (playBtn) setFocus(playBtn);
                    return true;
                case KEY_CODES.UP:
                    e.preventDefault();
                    return true;
                case KEY_CODES.LEFT:
                    e.preventDefault();
                    move('left');
                    return true;
                case KEY_CODES.RIGHT:
                    e.preventDefault();
                    move('right');
                    return true;
                case KEY_CODES.ENTER:
                    e.preventDefault();
                    currentFocusedElement.click();
                    return true;
            }
        }

        // 4. Default fallback inside player
        switch (keyCode) {
            case KEY_CODES.DOWN:
                e.preventDefault();
                if (timelineBox) setFocus(timelineBox);
                return true;
            case KEY_CODES.UP:
                e.preventDefault();
                if (playBtn) setFocus(playBtn);
                return true;
            case KEY_CODES.LEFT:
                e.preventDefault();
                window.Player.seekRelative(-10);
                return true;
            case KEY_CODES.RIGHT:
                e.preventDefault();
                window.Player.seekRelative(10);
                return true;
            case KEY_CODES.ENTER:
                e.preventDefault();
                window.Player.togglePlayPause();
                return true;
        }

        return false;
    }

    function handleReturnKey() {
        // 1. If Torrent Info HUD is open, close it cleanly
        const hudBackdrop = document.getElementById('amnis-hud-backdrop') || document.getElementById('player-hud-backdrop');
        if (hudBackdrop && (hudBackdrop.classList.contains('dialog-open') || hudBackdrop.classList.contains('hud-visible'))) {
            const playerModule = window.VideoPlayer || window.Amnis;
            if (playerModule && playerModule.toggleTorrentInfoHud) {
                playerModule.toggleTorrentInfoHud(false);
            } else {
                hudBackdrop.classList.remove('dialog-open', 'hud-visible');
                const overlay = document.getElementById('amnis-hud-overlay');
                if (overlay) overlay.classList.remove('hud-visible');
                focusInitialElement();
            }
            return;
        }

        // 2. If any other dialog is open, close it
        const openDialog = document.querySelector('.app-dialog-backdrop.dialog-open, .app-dialog-backdrop.hud-visible');
        if (openDialog) {
            openDialog.classList.remove('dialog-open', 'hud-visible');
            focusInitialElement();
            return;
        }

        // If in subfolder of USB file manager, go to parent directory
        if (window.FileManager && window.FileManager.canGoBack()) {
            window.FileManager.navigateBack();
            return;
        }

        // If on another tab, return to main tab (player)
        if (window.App && window.App.getCurrentView() !== 'player' && window.App.getCurrentView() !== 'amnis') {
            window.App.switchView('player');
            return;
        }

        // Tizen exit application
        if (typeof tizen !== 'undefined' && tizen.application) {
            try {
                tizen.application.getCurrentApplication().exit();
            } catch (err) {
                console.warn('[Navigation] Exit app error:', err);
            }
        }
    }

    return {
        init: init,
        setFocus: setFocus,
        focusInitialElement: focusInitialElement,
        enable: function() { isNavigationEnabled = true; },
        disable: function() { isNavigationEnabled = false; },
        KEY_CODES: KEY_CODES
    };
})();
