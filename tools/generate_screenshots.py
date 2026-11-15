from playwright.sync_api import sync_playwright
import os
import json

def capture():
    os.makedirs('docs/images', exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1920, 'height': 1080})
        app_url = 'file:///' + os.path.abspath('app/index.html').replace('\\', '/')

        # 1. Home Launcher Screen
        page.goto(app_url)
        page.wait_for_timeout(800)
        page.click('#tab-home')
        page.wait_for_timeout(600)
        page.screenshot(path='docs/images/01_home_launcher.png')

        # 2. Video Player Hub Screen (with populated active torrent download cards)
        page.click('#tab-player')
        page.wait_for_timeout(400)
        page.evaluate("""() => {
            const listEl = document.getElementById('player-downloads-list');
            const statsEl = document.getElementById('player-downloads-stats');
            if (statsEl) statsEl.textContent = '1 active stream';
            if (listEl) {
                listEl.innerHTML = `
                    <div class="player-download-card focusable" style="background: rgba(30, 27, 75, 0.7); border: 1px solid rgba(0, 242, 254, 0.5); border-radius: 14px; padding: 18px 24px; margin-bottom: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.4);">
                        <div class="player-download-top" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <span class="player-download-title" style="font-size:20px; font-weight:700; color:#fff;">🎬 Cosmic Voyage (2026) 4K TRUE WEB-DL Atmos - 5.5GB</span>
                            <span class="player-download-badge" style="background: linear-gradient(135deg, #0284c7, #00f2fe); color:#000; font-weight:800; border-radius:8px; padding:6px 14px; font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">Downloading &amp; Streaming 68%</span>
                        </div>
                        <div class="progress-track" style="height:12px; border-radius:6px; background:rgba(255,255,255,0.12); margin-bottom:12px; overflow:hidden;">
                            <div class="progress-fill" style="width:68%; height:100%; background: linear-gradient(90deg, #10b981 0%, #00f2fe 100%);"></div>
                        </div>
                        <div class="player-download-meta" style="display:flex; justify-content:space-between; align-items:center; font-size:14px; color:var(--text-muted);">
                            <span>Completed: <strong style="color:#fff;">3.74 GB</strong> / 5.50 GB • Speed: <strong style="color:#00f2fe;">7.85 MB/s</strong> • <strong>28</strong> peers</span>
                            <div style="display:flex; gap:10px;">
                                <button style="background:linear-gradient(135deg, #7b2cbf, #00f2fe); color:#fff; font-weight:700; padding:8px 18px; border-radius:8px; border:none; cursor:pointer;">▶️ Play Stream</button>
                                <button style="background:rgba(255,255,255,0.12); color:#fff; padding:8px 14px; border-radius:8px; border:1px solid rgba(255,255,255,0.2);">ℹ️ Torrent Info</button>
                            </div>
                        </div>
                    </div>
                `;
            }
        }""")
        page.wait_for_timeout(400)
        page.screenshot(path='docs/images/02_video_player.png')

        # 3. File Receiver Screen
        page.click('#tab-receiver')
        page.wait_for_timeout(400)
        page.evaluate("""() => {
            const queueList = document.getElementById('transfer-queue-list');
            const emptyState = document.getElementById('receiver-empty-state');
            if (emptyState) emptyState.style.display = 'none';
            if (queueList) {
                queueList.innerHTML = `
                    <div class="transfer-card focusable" style="background:rgba(30, 27, 75, 0.7); border:1px solid rgba(16, 185, 129, 0.5); border-radius:14px; padding:18px 24px; margin-bottom:14px; box-shadow:0 8px 32px rgba(0,0,0,0.3);">
                        <div class="transfer-top" style="display:flex; justify-content:space-between; margin-bottom:10px;">
                            <span class="transfer-filename" style="font-size:18px; font-weight:600; color:#fff;">🎬 Interstellar (2014) IMAX 1080p Atmos.mkv</span>
                            <span class="transfer-status-badge status-completed" style="background:#10b981; color:#fff; font-weight:700; padding:5px 12px; border-radius:6px; font-size:12px;">✓ 100% Received &amp; Verified</span>
                        </div>
                        <div class="progress-track" style="height:10px; border-radius:5px; background:rgba(255,255,255,0.12); margin-bottom:8px; overflow:hidden;">
                            <div class="progress-fill" style="width:100%; height:100%; background:linear-gradient(90deg, #10b981, #00f2fe);"></div>
                        </div>
                        <div class="transfer-meta" style="display:flex; justify-content:space-between; font-size:13px; color:var(--text-muted);">
                            <span>Saved to USB Flash Drive: <strong style="color:#fff;">removable_sda3/TVFileHub/Received/</strong></span>
                            <span style="color:#00f2fe; font-weight:700;">3.45 GB</span>
                        </div>
                    </div>
                `;
            }
        }""")
        page.wait_for_timeout(400)
        page.screenshot(path='docs/images/03_file_receiver.png')

        # 4. Multi-USB File Manager Screen
        page.click('#tab-filemanager')
        page.wait_for_timeout(400)
        page.evaluate("""() => {
            const empty = document.getElementById('fm-empty-state');
            if (empty) empty.style.display = 'none';
            const grid = document.getElementById('fm-file-grid');
            if (grid) {
                grid.innerHTML = `
                    <div class="file-card focusable" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:24px 16px; background:rgba(30,27,75,0.6); border-radius:14px; border:1px solid rgba(255,255,255,0.12); cursor:pointer;">
                        <div style="font-size:48px; margin-bottom:8px;">📁</div>
                        <div style="font-size:16px; font-weight:700; color:#fff; text-align:center;">Movies &amp; Series</div>
                        <div style="font-size:13px; color:var(--text-muted); margin-top:4px;">18 items</div>
                    </div>
                    <div class="file-card focusable" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:24px 16px; background:rgba(30,27,75,0.6); border-radius:14px; border:1px solid rgba(0,242,254,0.4); cursor:pointer;">
                        <div style="font-size:48px; margin-bottom:8px;">🎬</div>
                        <div style="font-size:16px; font-weight:700; color:#fff; text-align:center;">Avatar.The.Way.Of.Water.1080p.mkv</div>
                        <div style="font-size:13px; color:#00f2fe; margin-top:4px;">Video • 4.85 GB</div>
                    </div>
                    <div class="file-card focusable" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:24px 16px; background:rgba(30,27,75,0.6); border-radius:14px; border:1px solid rgba(255,255,255,0.12); cursor:pointer;">
                        <div style="font-size:48px; margin-bottom:8px;">🧲</div>
                        <div style="font-size:16px; font-weight:700; color:#fff; text-align:center;">Dune.Part.Two.2024.torrent</div>
                        <div style="font-size:13px; color:#10b981; margin-top:4px;">BitTorrent • 112 KB</div>
                    </div>
                    <div class="file-card focusable" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:24px 16px; background:rgba(30,27,75,0.6); border-radius:14px; border:1px solid rgba(255,255,255,0.12); cursor:pointer;">
                        <div style="font-size:48px; margin-bottom:8px;">🎵</div>
                        <div style="font-size:16px; font-weight:700; color:#fff; text-align:center;">Hans_Zimmer_Live_Concert.flac</div>
                        <div style="font-size:13px; color:var(--text-muted); margin-top:4px;">Audio • 420 MB</div>
                    </div>
                `;
            }
        }""")
        page.wait_for_timeout(400)
        page.screenshot(path='docs/images/04_file_manager.png')

        # 5. AdBlock & Performance Booster Dialog
        page.evaluate("""() => {
            const modal = document.getElementById('adblock-modal-backdrop');
            if (modal) {
                modal.classList.add('dialog-open');
                modal.style.display = 'flex';
                modal.style.opacity = '1';
                modal.style.pointerEvents = 'auto';
            }
        }""")
        page.wait_for_timeout(400)
        page.screenshot(path='docs/images/05_tv_booster_modal.png')

        # 6. Mobile Web Sender (1200x800)
        sender_page = browser.new_page(viewport={'width': 1200, 'height': 800})
        sender_url = 'file:///' + os.path.abspath('server/public/sender.html').replace('\\', '/')
        sender_page.goto(sender_url)
        sender_page.wait_for_timeout(600)
        sender_page.screenshot(path='docs/images/06_mobile_sender_web.png')

        browser.close()
    print("SUCCESS: 6 showcase screenshots generated in docs/images/")

if __name__ == '__main__':
    capture()
