# Existing Architecture: Samsung Tizen TV File Hub & Video Player

## 1. Executive Summary

The existing application is a production-grade Samsung Tizen Smart TV application (**TV File Hub & Video Player**, App ID `aM9fHub001.TVFileHub`) designed for Samsung Smart TVs running Tizen OS 3.0 through 7.0+ (specifically targeting Samsung Crystal UHD CU7000/CU7700 series and higher).

The system consists of two primary operational components:
1. **Frontend Tizen Web Application**: A 1080p 10-foot television interface written in standards-compliant HTML5, CSS3, and modern vanilla JavaScript, utilizing Tizen WebAPIs and Samsung TV AVPlay (`webapis.avplay`) hardware acceleration.
2. **Companion Server & Torrent Streaming Bridge**: A zero-dependency Python 3 HTTP/WebSocket daemon paired with a Node.js streaming engine (`torrent_engine.mjs`) running on a local companion network host ("Server").

```
+-------------------------------------------------------------------------------+
|                             Samsung Smart TV (Tizen)                          |
|  +-------------------------------------------------------------------------+  |
|  |                           TV File Hub Client                            |  |
|  |  +---------------+  +-------------------+  +-------------------------+  |  |
|  |  | HomeLauncher  |  |   Video Player    |  |  File Receiver/Sender   |  |  |
|  |  +---------------+  +-------------------+  +-------------------------+  |  |
|  |  |  FileManager  |  | 2D Spatial Focus  |  | TVFilesystem (USB/Local)|  |  |
|  |  +---------------+  +-------------------+  +-------------------------+  |  |
|  |  +-------------------------------------------------------------------+  |  |
|  |  |           Samsung AVPlay Engine (webapis.avplay) & HTML5          |  |  |
|  +--+-------------------------------------------------------------------+--+  |
+---------------------------------------|---------------------------------------+
                                        | HTTP REST / Range Streaming / RFC 6455 WebSockets
+---------------------------------------v---------------------------------------+
|                            Local Host ("Server")                              |
|  +-------------------------------------------------------------------------+  |
|  |                     Companion Bridge Daemon (server.py)                 |  |
|  |  - Port 8080: HTTP REST API, Upload Handler, Static Media Streaming     |  |
|  |  - WebSocket Endpoint (/ws): Real-time Bi-directional Events & Logs     |  |
|  |  - SSE Endpoint (/events): Real-time Broadcasts                        |  |
|  |  - Queue Worker & Priority Scheduler (Highest, Normal, Low)             |  |
|  +-------------------------------------------------------------------------+  |
|  |                   Node.js Torrent Engine (torrent_engine.mjs)           |  |
|  |  - Port 8889: BitTorrent Range Streaming Server                         |  |
|  |  - Sequential Piece Selector & Background Queue Downloader              |  |
|  |  - Auto MKV Cues / Seek Index Repair (mkvmerge)                         |  |
|  +-------------------------------------------------------------------------+  |
+-------------------------------------------------------------------------------+
```

---

## 2. Technology Stack & Runtime Environment

### 2.1 Tizen Client Stack
| Component | Technology | Detail |
| :--- | :--- | :--- |
| **Platform** | Samsung Tizen Web Application | Profiles: `tv-samsung`, Required Tizen Version: 3.0+ |
| **Viewport** | Full HD (1920x1080) | Fixed 10-foot TV UI, non-scalable viewport |
| **Styling** | Pure CSS3 & Custom Design Tokens | Glassmorphism, neon highlights, dark/light theme |
| **Logic** | Vanilla JavaScript (ES6+ modular IIFE) | No heavy JS frameworks to maintain 60 FPS on TV CPUs |
| **Media Player** | `webapis.avplay` & HTML5 `<video>` | Hardware-accelerated decoders (AVC, HEVC, AAC, AC3, DTS) |
| **Remote Control** | `tizen.tvinputdevice` & DOM Events | D-pad, OK/Enter, Return, Media Keys, Color Keys |
| **Storage API** | `tizen.filesystem` | Multi-partition USB discovery, read/write, base64 binary chunks |
| **QR Code** | `qrcode.min.js` | Instant local web sender pairing via smartphone camera |

### 2.2 Companion Server Stack
| Component | Technology | Detail |
| :--- | :--- | :--- |
| **Runtime** | Python 3.10+ | Pure standard library (`http.server`, `socketserver`, `threading`) |
| **Network Protocol** | HTTP 1.1 + RFC 6455 WebSockets | Custom zero-dependency WebSocket handshake & frame parser |
| **Streaming Engine** | Node.js (ES Modules `torrent_engine.mjs`) | Uses `webtorrent` / `torrent-stream` core with sequential piece buffering |
| **Video Processing** | `mkvtoolnix` (`mkvmerge`) | Dynamic Cues seek table generation for instantaneous TV seeking |
| **Process Model** | Multi-threaded Worker & Subprocess | Threaded HTTP server, async background worker thread for queue |

---

## 3. Client Architecture (`app/`)

### 3.1 Module Breakdown
The application follows a clean modular pattern with single-responsibility IIFE modules attached to `window`:

1. **`app/js/app.js` (Application Orchestrator)**
   - Manages top-level application initialization and view transitions (`home`, `player`, `receiver`, `filemanager`).
   - Hooks into global error reporting (`window.onerror`) and streams unhandled TV exceptions across the WebSocket to the companion server for live remote debugging.
   - Coordinates cross-module storage notifications.

2. **`app/js/navigation.js` (Spatial 2D Focus Engine)**
   - Custom 2D spatial navigation algorithm calculating Euclidean distances and directional angle vectors between DOM focusable bounding boxes (`getBoundingClientRect()`).
   - Remote control key handler intercepting Tizen hardware keys (`MediaPlay`, `MediaPause`, `ColorF0Red`, `Return`, etc.).
   - Implements strict modal focus trapping: when dialogs (HUD, Settings, Subtitles, Episodes) are open, focus movement is confined strictly within the dialog.

3. **`app/js/home.js` (Home Launcher & Dashboard)**
   - Apple TV / Google TV styled home view.
   - Hero spotlight banner with dynamic action triggers.
   - Quick launch cards (`Video Player`, `Wireless Receiver`, `Storage Explorer`, `TV Boost & Ad-Block`).
   - "Continue Watching" carousel populated from recent playback history and saved resume points (`localStorage`).
   - Live storage health and server connectivity gauges.

4. **`app/js/videoplayer.js` (BitTorrent & Media Stream Manager)**
   - Handles sync with Server's `/api/downloads` endpoint.
   - Dual-view subtab switcher:
     - **Available Movies**: Completed media files ready for instant 0-second streaming.
     - **Active Downloads & Queue**: Real-time progress, speed, peer count, time remaining, and priority tags.
   - Torrent control dialogs: Torrent HUD, Subtitle Search (OpenSubtitles/BSPlayer), Episode / Multi-file Selector, Audio Language Selector.

5. **`app/js/player.js` (Samsung AVPlay Hardware Player)**
   - Integrates with Tizen's low-level `webapis.avplay` hardware decoder pipeline (`open()`, `prepareAsync()`, `play()`, `seekTo()`, `setDisplayRect()`).
   - Provides graceful fallback to HTML5 `<video>` for browser or non-Tizen testing.
   - Smooth timeline scrubbing with debounced seeking and seek settling guards.
   - Automatic resume playback saved to `localStorage` (`tvhub_resume_points`).
   - Real-time aspect ratio switching (`Fit (16:9)`, `Zoom (133%)`, `Full (Stretch)`, `4:3`, `21:9 Cinemascope`).

6. **`app/js/receiver.js` (Wireless File Receiver & QR Bridge)**
   - Auto-detects local Wi-Fi IP and renders QR code pointing to companion Web Sender (`http://<SERVER_IP>:8080/`).
   - Maintains WebSocket connection (`/ws`) to receive real-time file upload notifications, download progress, and torrent ingestion alerts.
   - Manages received files list and storage routing.

7. **`app/js/filesystem.js` (Tizen Storage Engine)**
   - Probes physical USB ports (`removable_sda1`, `sda1`, `sdb1`, etc.) via `tizen.filesystem`.
   - Resolves target storage paths according to user preference:
     - `usb`: Prefers attached USB drive (creates `/TVFileHub/Received/`).
     - `local`: Internal TV flash memory (`downloads/TVFileHub/Received/`).
     - `server`: Kept directly on the companion host to consume zero TV flash memory.

8. **`app/js/filemanager.js` (Storage Explorer)**
   - Interactive TV file browser with breadcrumb navigation.
   - Displays storage volume capacity bars and partition metadata.
   - Supports 1-click playback launch for media files and subtitle associations.

---

## 4. Companion Server Architecture (`server/`)

### 4.1 Server Component Architecture
The companion daemon (`server/server.py`) operates as a multi-threaded HTTP/WebSocket server.

```
+------------------------------------------------------------------------------------+
|                                    server.py                                       |
|  +-----------------------+  +--------------------------+  +---------------------+  |
|  | FileHubRequestHandler |  |   TorrentStreamManager   |  |   WebSocket Server  |  |
|  |  - do_GET() / do_POST |  |  - Background Queue Mgr  |  |  - RFC 6455 Frames  |  |
|  |  - Range 206 Parser   |  |  - Priority Scheduler    |  |  - Broadcast Pool   |  |
|  |  - Multipart Upload   |  |  - Stall Detector        |  |  - Client Logger    |  |
|  +-----------------------+  +--------------------------+  +---------------------+  |
|                                         |                                          |
|                                         v (Subprocess PIPE)                        |
|                             torrent_engine.mjs (Node.js)                           |
+------------------------------------------------------------------------------------+
```

### 4.2 API Contract & Endpoints
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/status` | `GET` | Health check endpoint returning `{ status: "online", service: "Samsung TV File Hub" }`. |
| `/api/downloads`, `/api/queue` | `GET` | Dynamic dashboard state: lists completed `available_movies` and `currently_downloading` queue with speeds, peers, progress, and priority badges. |
| `/start_torrent` | `GET` | Starts streaming or background downloading for a torrent file or magnet link. Supports parameters: `file`, `magnet`, `downloadonly=true`, `file_idx`, `episode`. |
| `/stop_torrent` | `GET` | Stops the active streaming engine process. |
| `/torrent_stats` | `GET` | Returns real-time metrics for an active stream (progress, speed, peers, pieces). |
| `/torrent_files` | `GET` | Parses multi-file torrent contents and returns episode list with sizes. |
| `/media_info` | `GET` | Inspects audio tracks inside a media file (Tamil, English, Hindi, etc.). |
| `/api/prioritize` | `GET` | Elevates a queued torrent to Highest streaming priority. |
| `/api/low_priority` | `GET` | Sets a torrent to Low Priority (downloads only when all Normal items finish). |
| `/api/normal_priority` | `GET` | Restores a torrent to Normal background priority. |
| `/delete_file` | `GET` | Removes a torrent and its associated downloaded video files from disk. |
| `/storage_target` | `GET` | Returns active storage target (`CURRENT_STORAGE_TARGET`). |
| `/upload` | `POST` | Multipart file upload endpoint. Automatically queues incoming `.torrent` files into the autonomous background download queue. |
| `/files/<filename>` | `GET` | HTTP 1.1 Byte-Range (206 Partial Content) media streaming handler. Invokes `ensure_mkv_cues()` to guarantee seeking index support. |
| `/ws` | `GET (Upgrade)` | RFC 6455 bi-directional WebSocket connection for TV client. |
| `/events` | `GET` | Server-Sent Events (SSE) fallback channel. |

### 4.3 Streaming & MKV Seeking Engine
Samsung TV AVPlay requires an indexed Matroska SeekHead (`Cues`) at the beginning or end of an MKV container. Unindexed or in-progress torrent streams lack these cue points, preventing timeline seeking.
The server integrates `ensure_mkv_cues()`:
- Inspects the MKV binary tail for the Cues element ID (`0x1C 0x53 0xBB 0x6B`).
- If missing, automatically repairs the seek table using `mkvmerge` before streaming, enabling flawless forward and backward seeking on Samsung Smart TVs.

---

## 5. Security & Network Model

1. **Local Area Network Operation**: All communications operate within the user's private Wi-Fi/Ethernet subnet (e.g., `192.168.0.x`).
2. **Access Control**: CORS (`Access-Control-Allow-Origin: *`) enabled across all endpoints for local TV client consumption.
3. **No Private Secrets**: Architecture operates autonomously without relying on external cloud authentication tokens or third-party proprietary services.

---

## 6. Build and Packaging Pipeline

- **Build Script**: `build.py`
  - Validates all required files (`config.xml`, `index.html`, `icon.png`, CSS, and JS).
  - Packages the entire tree into `build/TVFileHub.wgt` (standard ZIP compression with forward slashes).
- **Deployment Script**: `deploy.ps1`
  - Leverages Samsung Developer Bridge (`sdb.exe`) and `apps2samsung-cli.exe`.
  - Discovers connected TV IP, signs `.wgt` with developer certificates, and installs directly onto the TV.
