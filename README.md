# Samsung Tizen TV File Hub & Video Player

An integrated, production-grade Samsung Tizen TV Web application designed for 10-foot television experiences on Samsung Crystal UHD / QLED / Neo QLED Smart TVs (Tizen 3.0 through 10.0+).

---

## 🌟 Core Features & Modules

### 1. 📡 Wireless File Receiver
- **Real-Time Transfer:** Drag & drop or select large video, torrent, audio, or image files from any Android smartphone, iPhone, or Windows/macOS PC on the local Wi-Fi.
- **Dynamic QR Code:** Auto-detects local network IP and renders a sharp QR code directly on the TV for instant camera connection without typing URLs.
- **Top Right Queue Actions:**
  - **🧹 Clear List:** Clears the on-screen transfer queue and local history cache without modifying physical files on disk.
  - **🗑️ Delete All:** Safely deletes all received files from physical TV storage and companion server, clearing the queue.
- **Auto-Versioning & Integrity:** Non-conflicting filename resolution (`filename (1).mkv`) prevents accidental file overwrites.

### 2. 📁 Multi-Drive USB File Manager
- **Multi-Drive Detection (1, 2, 3, or more USBs):** Detects and renders individual selectable storage pills for every attached USB flash drive (e.g. `USB 1: sda1`, `USB 2: sdb1`, `USB 3: sdc1`) alongside Internal TV Storage.
- **Drive Capacity Monitor:** Live disk space indicator displaying available and total capacity for each storage.
- **Folder Navigation & Breadcrumbs:** Deep folder traversal, parent navigation (`Up Level`), quick home navigation (`Storage Root`), and one-click jump to `Received Files`.
- **Media File Launch:** Directly launches video or audio files in hardware-accelerated playback with AVPlay, or feeds `.torrent` files into the BitTorrent streaming engine.
- **File Deletion:** Delete individual files directly from the TV remote.

### 3. 🎬 Video Player & BitTorrent Streaming Engine
- **Hardware Acceleration:** Uses Samsung TV `webapis.avplay` hardware decoder with smooth HTML5 fallback.
- **Sequential Torrent Streaming:** Streams video files live as they download sequentially from the BitTorrent swarm via the companion node engine.
- **On-Screen Display (OSD):** D-pad navigable timeline seekbar, buffer loading percentages, play/pause controls, and quick skip (±10s).
- **Subtitles & Audio Tracks:** Built-in subtitle support (.srt, .vtt) with OpenSubtitles/BSPlayer search modal.
- **Settings Dialog:**
  - **💾 Default Storage Destination:** Select default destination for received files and torrent downloads: `Auto (Prefer USB)`, `Internal TV Storage`, or any specific connected USB drive (`USB 1`, `USB 2`, `USB 3`).
  - **🎨 Theme Mode:** Seamless toggle between **Night Mode (Dark)** and **Day Mode (Light)** with high-contrast headers, light cards, and legible buttons.
  - **🔍 TV Font Scaling:** Instant scaling between Standard (100%), Large (115%), and Extra Large (130%) for comfortable reading from across the living room.

---

## 📂 Project Structure

```text
D:\PY\SamsungTV\
├── app/
│   ├── config.xml             # Tizen TV widget manifest (permissions, privileges, app name)
│   ├── index.html             # TV UI layout (Receiver, File Manager, Video Player, OSD)
│   ├── icon.png               # High-resolution (512x512) TV app launcher icon
│   ├── css/
│   │   └── style.css          # Night & Day themes, 10-foot spatial navigation focus states
│   └── js/
│       ├── navigation.js      # 2D spatial navigation & Samsung TV remote control key engine
│       ├── filesystem.js      # Multi-USB probe, disk resolution, and storage preference manager
│       ├── receiver.js        # File receiver queue, QR code, and Clear List / Delete All actions
│       ├── player.js          # Samsung AVPlay (webapis.avplay) & HTML5 video engine
│       ├── videoplayer.js     # Video Player 4-card UI, BitTorrent HUD, and Settings modal
│       ├── filemanager.js     # Multi-drive USB browser, breadcrumbs, and media launcher
│       ├── amnis.js           # Legacy compatibility bridge
│       └── qrcode.min.js      # Offline QR code generator for TV screen
├── server/
│   ├── server.py              # Zero-dependency companion HTTP & WebSocket transfer bridge
│   ├── torrent_engine.mjs     # Sequential BitTorrent streaming engine (WebTorrent)
│   ├── public/
│   │   └── sender.html        # Mobile & desktop web sender interface (drag & drop, multi-file)
│   └── uploads/               # Temporary transfer staging directory
├── tools/
│   ├── sdb.exe                # Smart Development Bridge client for Windows
│   └── apps2samsung/          # CLI installer for Tizen TV widget deployment
├── build/
│   └── TVFileHub.wgt          # Compiled Tizen widget package ready for deployment
├── build.py                   # Automated packaging & verification script
├── deploy.ps1                 # Automated deployment & TV connection PowerShell script
├── .gitignore                 # Standard git ignore rules for build artifacts
└── README.md                  # Comprehensive manual & technical documentation
```

---

## 🚀 Getting Started

### Prerequisites
- **Python 3.10+** (for companion server and build tool)
- **Node.js 18+** (for sequential BitTorrent streaming engine)
- **Samsung Smart TV** connected to the same Wi-Fi network with **Developer Mode** enabled.

---

### Step 1: Start the Companion Transfer Bridge

In the project root, run:
```bash
python server\server.py
```
*The server automatically detects your host LAN IP (e.g. `192.168.0.13:8080`) and hosts the Web Sender UI, WebSocket handshake, and BitTorrent bridge.*

---

### Step 2: Build the TV Application Package

Build the Tizen widget archive (`TVFileHub.wgt`):
```bash
python build.py
```
This generates `build\TVFileHub.wgt` containing all verified HTML, CSS, JavaScript, and asset files.

---

### Step 3: Deploy to Samsung Smart TV

Deploy and launch directly onto the TV via `apps2samsung-cli`:
```bash
.\tools\apps2samsung\apps2samsung-cli.exe install build\TVFileHub.wgt --tv 192.168.0.12 --launch --plain
```
Replace `192.168.0.12` with your TV's IP address.

---

## 🎮 Samsung TV Remote Control Mapping

| Remote Button | Action |
| :--- | :--- |
| **D-pad (Up / Down / Left / Right)** | 2D Spatial navigation across tabs, cards, storage pills, and buttons |
| **Enter (OK)** | Select item, open folder, start video, or confirm action |
| **Return (Back)** | Exit player OSD, return to parent folder, or switch to Video Player tab |
| **Play / Pause** | Toggle video playback |
| **Fast-Forward / Rewind** | Seek forward / backward by 10 seconds |
| **Color Keys (Red / Green / Yellow / Blue)** | Quick actions inside player and file manager |

---

## 📄 License
MIT License. Created for Samsung Smart TV enthusiasts.
