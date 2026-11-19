# Feature Inventory: TV File Hub & Video Player

## 1. Overview

This document provides a comprehensive inventory of all features, functional capabilities, user interface views, background processes, network protocols, and data models in the **TV File Hub & Video Player** ecosystem.

---

## 2. Feature Matrix by Module

### 2.1 Module 0: Home Launcher & TV Dashboard
| Feature ID | Feature Name | Description | Tizen Implementation | Key Actions / Triggers |
| :--- | :--- | :--- | :--- | :--- |
| `HOME-01` | **Hero Spotlight Banner** | Prominently highlights featured torrent streams or the most recent media with backdrop art and badge tags. | `app/js/home.js` (`renderSpotlight`) | Primary action launches playback; Secondary opens Receiver. |
| `HOME-02` | **Quick Launch Grid** | 4-tile launcher grid designed for fast D-pad access: Video Player, Wireless Receiver, Storage Explorer, TV Boost. | `app/js/home.js` (`setupEventListeners`) | Direct navigation switch to respective views or modals. |
| `HOME-03` | **Continue Watching Carousel** | Displays horizontal card carousel of in-progress movies with resume progress bars and timestamps. | `app/js/home.js` (`renderContinueWatching`) | Clicking a card resumes playback from exact saved timestamp. |
| `HOME-04` | **Storage Health Gauge** | Live visual card reporting active storage mount, used/free space, and target destination path. | `app/js/home.js` (`renderStorageHealth`) | Enter key opens Storage Settings modal. |
| `HOME-05` | **Network & Companion Gauge**| Live indicator showing TV local IP, Server IP, Wi-Fi status, and WebSocket connectivity. | `app/js/home.js` (`renderSystemStatus`) | Visual indicator of network health. |
| `HOME-06` | **TV Memory Boost & Cleaner** | Clears memory caches, unneeded DOM nodes, and triggers browser garbage collection for 60 FPS TV performance. | `app/js/home.js` (`runTVBoost`) | Header button or Quick Launch tile. Shows animated toast. |
| `HOME-07` | **Ad-Block & Telemetry Guide** | Interactive 3-step modal showing TV users how to disable Smart Hub ads, IBA tracking, and set AdGuard DNS. | `app/js/home.js` (`openAdBlockModal`) | Modal display with TV optimization walkthrough. |

---

### 2.2 Module 1: Wireless File Receiver
| Feature ID | Feature Name | Description | Tizen Implementation | Key Actions / Triggers |
| :--- | :--- | :--- | :--- | :--- |
| `RCV-01` | **Dynamic QR Code Pairing** | Generates an on-screen QR code pointing to the Server's Web Sender (`http://<SERVER_IP>:8080/`). | `app/js/receiver.js` (`renderQRCode`) | Phone camera scans QR to open mobile web sender interface. |
| `RCV-02` | **Direct Connection Metadata**| Displays TV IP, Server Port, and clickable direct URL for manual browser entry. | `app/js/receiver.js` (`updateNetworkDisplay`) | On-screen network connection details. |
| `RCV-03` | **Storage Target Selector** | Indicates destination for received files: USB Flash Drive, Local TV Flash, or Server Storage. | `app/js/receiver.js` (`receiver-usb-target`) | Enter key opens Settings modal to toggle target storage. |
| `RCV-04` | **Real-Time Transfer Feed** | Live listing of incoming and received files with file sizes, timestamps, and status badges. | `app/js/receiver.js` (`createCompletedCard`) | WebSocket pushes `file_upload_start` and `file_upload_complete`. |
| `RCV-05` | **1-Click Launch into Player** | Clicking a received `.torrent` or video file immediately launches it in the Video Player. | `app/js/receiver.js` | Direct view transition and player start. |
| `RCV-06` | **Clear List History** | Clears the received files list UI and local history cache without deleting underlying storage files. | `app/js/receiver.js` (`clearTransferHistory`) | Button `receiver-clear-list-btn`. |
| `RCV-07` | **Auto-Torrent Enqueue** | Uploaded `.torrent` files are automatically ingested and queued for autonomous background download on Server. | `server/server.py` (`do_POST /upload`) | Automatic background worker enqueue. |

---

### 2.3 Module 2: Storage Explorer / File Manager
| Feature ID | Feature Name | Description | Tizen Implementation | Key Actions / Triggers |
| :--- | :--- | :--- | :--- | :--- |
| `FM-01` | **Multi-Drive Tab Selector** | Detects all mounted USB partitions (`sda1`, `sdb1`, etc.) and Internal storage as selectable pills. | `app/js/filemanager.js` (`renderStoragePills`) | D-pad horizontal selection switches active drive partition. |
| `FM-02` | **Capacity & Space Gauge** | Displays total gigabytes, free gigabytes, and usage percentage bar for the selected drive. | `app/js/filemanager.js` (`updateCapacityDisplay`) | Live updates on drive mount/unmount. |
| `FM-03` | **Breadcrumb Path Navigator** | Visual breadcrumb trail showing current directory path with 1-click level jumping. | `app/js/filemanager.js` (`renderBreadcrumbs`) | Allows moving to any parent directory. |
| `FM-04` | **Folder Traversal & Grid** | Grid view of folders and media files with type-specific badges (MKV, MP4, AVI, Subtitles, Torrents). | `app/js/filemanager.js` (`renderGrid`) | Enter key on folder opens directory; on video opens player. |
| `FM-05` | **Quick Navigation Bar** | Shortcuts for "Up Level" (parent), "Storage Root", and "Received Files" folder. | `app/js/filemanager.js` | Fast access buttons in toolbar. |
| `FM-06` | **Live Storage Rescan** | Manually re-scans filesystem hardware mounts to pick up newly inserted USB drives. | `app/js/filemanager.js` (`fm-refresh-btn`) | Rescans `tizen.filesystem`. |

---

### 2.4 Module 3: Video Player & BitTorrent Dashboard
| Feature ID | Feature Name | Description | Tizen Implementation | Key Actions / Triggers |
| :--- | :--- | :--- | :--- | :--- |
| `VP-01` | **Dual Subtab Hub** | Subtabs: **Available Movies** (completed on Server) and **Active Downloads & Queue**. | `app/js/videoplayer.js` (`switchSubtab`) | Synchronized with Server `/api/downloads` endpoint. |
| `VP-02` | **Instant Server Playback** | Clicking an available movie immediately streams it over HTTP 1.1 Partial Content (0s latency). | `app/js/videoplayer.js` (`playRPiMovie`) | Launches Player with `/files/<name>` stream URL. |
| `VP-03` | **Priority Scheduling System** | Three-tier download priority: **Highest (Streaming)**, **Normal (Background)**, and **Low (Downloads Last)**. | `server/server.py` (`TorrentStreamManager`) | UI buttons: `Priority (Stream)`, `Normal`, `Low`. |
| `VP-04` | **Real-time Download Metrics**| Displays download speed, upload speed, downloaded/total MB, progress percentage, active peers, ETA. | `app/js/videoplayer.js` (`updateCardMetrics`) | Polled every 2 seconds via `/api/downloads`. |
| `VP-05` | **Torrent HUD Modal** | In-depth streaming diagnostic popup: active peers, sequential piece buffer status, swarm throughput. | `app/js/videoplayer.js` (`showTorrentHUD`) | Color Key or OSD info button. |
| `VP-06` | **Storage Browser Modal** | Direct popup to pick and stream files from attached USB drives or Local TV storage. | `app/js/videoplayer.js` (`openStorageDialog`) | Header Storage button or Green Color Key. |
| `VP-07` | **URL & Magnet Stream Modal**| Streams any arbitrary HTTP, HTTPS, HLS (`.m3u8`), or Magnet link with preset 4K test streams. | `app/js/videoplayer.js` (`openUrlDialog`) | Header URL button or Yellow Color Key. |
| `VP-08` | **Subtitle Search Modal** | Searches OpenSubtitles and BSPlayer for matched `.srt` subtitles based on movie title. | `app/js/videoplayer.js` (`openSubtitlesDialog`) | Header Subtitles button or Blue Color Key. |
| `VP-09` | **Multi-File / Episode Picker** | For series and multi-file torrents, displays individual episode list with episode file sizes. | `app/js/videoplayer.js` (`openEpisodesDialog`) | Episode button on card or OSD top bar. |
| `VP-10` | **Audio Track Selector** | Detects embedded multi-audio streams (Tamil, Telugu, Hindi, English) and lets user switch tracks. | `app/js/videoplayer.js` (`openAudioDialog`) | Audio Language button in OSD. |
| `VP-11` | **Clear Completed Torrents** | Clears completed torrent cards from queue without deleting downloaded video files. | `app/js/videoplayer.js` | Clear completed action button. |
| `VP-12` | **Delete Torrent & Media** | Permanently deletes torrent entry and corresponding files from Server disk. | `app/js/videoplayer.js` (`deleteRPiDownload`) | Delete button with confirmation. |

---

### 2.5 Module 4: Video Playback Engine & OSD Controls
| Feature ID | Feature Name | Description | Tizen Implementation | Key Actions / Triggers |
| :--- | :--- | :--- | :--- | :--- |
| `PLY-01` | **Samsung AVPlay Integration** | Hardware-accelerated decoding via `webapis.avplay` for low-latency 4K UHD video playback. | `app/js/player.js` (`initAVPlay`) | Native TV hardware decoder pipeline. |
| `PLY-02` | **HTML5 `<video>` Fallback** | Automatic fallback to HTML5 video element when AVPlay WebAPI is unavailable (e.g., standard browser). | `app/js/player.js` (`initHTML5`) | Seamless platform fallback. |
| `PLY-03` | **Full OSD Transport Bar** | Auto-hiding TV OSD overlay with Play/Pause, timeline scrubber, elapsed time, total duration, and title. | `app/js/player.js` (`showOSD`) | Any D-pad key displays OSD; auto-hides after 5s. |
| `PLY-04` | **Precision Timeline Scrubbing** | Debounced seeking with visual scrub thumb, time jump feedback (e.g., "+30s", "-10s"), and settle guard. | `app/js/player.js` (`scrubTimeline`) | Left/Right D-pad keys seek in incremental steps. |
| `PLY-05` | **Auto Resume Playback** | Saves playback position every 4 seconds to `localStorage`; automatically offers resume toast on restart. | `app/js/player.js` (`saveResumePosition`) | Persistent resume markers across reboots. |
| `PLY-06` | **Aspect Ratio Switcher** | 5 aspect ratio modes: **Fit (16:9 Letterbox)**, **Zoom (133% Fill)**, **Full (Stretch)**, **4:3 Standard**, **21:9 Cinemascope**. | `app/js/player.js` (`cycleAspectRatio`) | OSD Aspect button cycles modes with on-screen toast. |
| `PLY-07` | **In-Player Download Badge** | Non-intrusive top-right badge displaying live torrent download percentage while streaming. | `app/js/player.js` (`updateDownloadBadge`) | Live streaming status while video is playing. |
| `PLY-08` | **Subtitles Rendering Engine** | Custom subtitle renderer supporting `.srt` and `.vtt` format parsing and synchronized on-screen display. | `app/js/player.js` (`renderSubtitle`) | On-screen subtitle display with custom TV font styling. |

---

### 2.6 Module 5: Settings & Preferences
| Feature ID | Feature Name | Description | Tizen Implementation | Key Actions / Triggers |
| :--- | :--- | :--- | :--- | :--- |
| `SET-01` | **Storage Target Mode** | Sets default destination: Local Storage (TV Flash), USB Drive, or Server (Zero TV Space). | `app/js/videoplayer.js` (`setStorageMode`) | Settings dialog pill buttons. |
| `SET-02` | **Auto-Torrent Download** | Toggles whether received `.torrent` files immediately begin downloading in background. | `app/js/videoplayer.js` (`setAutoTorrentMode`) | Settings dialog toggle. |
| `SET-03` | **Theme Mode (Day / Night)** | Toggles UI theme between Night Mode (dark neon) and Day Mode (high-contrast light). | `app/js/videoplayer.js` (`applyTheme`) | Settings dialog toggle; saves to `localStorage`. |
| `SET-04` | **TV Font Size Scaling** | Scales UI typography: Standard (100%), Large (115%), Extra Large (130%). | `app/js/videoplayer.js` (`applyFontSize`) | Settings dialog toggle; saves to `localStorage`. |

---

## 3. Data Structures & Schemas

### 3.1 Download / Movie Item (`server.py` `/api/downloads`)
```json
{
  "id": "stream-a1b2c3d4",
  "name": "Movie.Title.2026.1080p.mkv",
  "clean_title": "Movie Title (2026)",
  "priority": "Highest | Normal | Low | Completed",
  "priority_badge": "⚡ Highest Priority (Streaming)",
  "is_active_stream": true,
  "status": "Downloading & Streaming (Highest Priority)",
  "progress": 45.2,
  "speed": "6.4 MB/s",
  "upload_speed": "240 KB/s",
  "downloaded": "1.2 GB",
  "total": "2.8 GB",
  "peers": 42,
  "time_remaining": "3m 40s",
  "completed": false,
  "stream_url": "http://192.168.0.14:8080/files/Movie.Title.2026.1080p.mkv"
}
```

### 3.2 System Status Object (`server.py` `/api/downloads`)
```json
{
  "system_status": {
    "mode": "streaming_priority | background_downloading | idle",
    "mode_label": "Highest Priority Video Streaming Active",
    "active_stream": "Movie Title (2026)",
    "active_bg_download": null,
    "total_available": 8,
    "total_downloading": 2,
    "seeding_status": "Active (Tit-for-Tat Peer Sharing; Seeding Stops at 100%)",
    "api_endpoint": "http://192.168.0.14:8080/api/downloads",
    "host_ip": "192.168.0.14",
    "port": 8080
  }
}
```

### 3.3 Resume Point (`localStorage` `tvhub_resume_points`)
```json
{
  "file_sample_mp4": {
    "time": 342.5,
    "duration": 1820.0,
    "updatedAt": 1731920000000
  }
}
```
