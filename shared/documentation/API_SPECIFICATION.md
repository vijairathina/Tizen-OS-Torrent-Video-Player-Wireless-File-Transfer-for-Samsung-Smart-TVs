# Shared API Specification & Companion Contracts

## 1. Overview

This document specifies the exact communication protocols, REST API payloads, WebSocket frames, and HTTP byte-range streaming conventions used across all client platforms (Samsung Tizen, Android TV, Android Phone, and Android Auto) when communicating with the companion **Server**.

All clients must strictly adhere to these contracts to guarantee cross-platform synchronization and state consistency.

---

## 2. Server Configuration

- **Default Server IP**: `192.168.0.14` (configurable via user settings or QR discovery)
- **HTTP Bridge Port**: `8080`
- **BitTorrent Streaming Port**: `8889`
- **WebSocket Endpoint**: `ws://<SERVER_IP>:8080/ws`
- **Streaming URL Pattern**: `http://<SERVER_IP>:8080/files/<FILENAME>`

---

## 3. Endpoints Specification

### 3.1 Health Check: `GET /status`
Verifies that the companion server is alive.

**Response** (`200 OK`, `application/json`):
```json
{
  "status": "online",
  "service": "Samsung TV File Hub"
}
```

---

### 3.2 Dynamic Downloads Dashboard: `GET /api/downloads`
Returns the complete dynamic list of all completed movies on the Server, the active downloading queue with real-time throughput metrics, and overall system state.

**Response** (`200 OK`, `application/json`):
```json
{
  "system_status": {
    "mode": "streaming_priority | background_downloading | idle",
    "mode_label": "Highest Priority Video Streaming Active",
    "active_stream": "Movie Title (2026)",
    "active_bg_download": null,
    "total_available": 5,
    "total_downloading": 2,
    "seeding_status": "Active (Tit-for-Tat Peer Sharing; Seeding Stops at 100%)",
    "api_endpoint": "http://192.168.0.14:8080/api/downloads",
    "host_ip": "192.168.0.14",
    "port": 8080
  },
  "available_movies": [
    {
      "id": "avail-d41d8cd9",
      "name": "The.Court.S01.E41-44.1080p.mkv",
      "clean_title": "The Court S01 EP 41-44 (2026)",
      "size": 2415919104,
      "size_formatted": "2.25 GB",
      "status": "Completed (Seeding Stopped)",
      "progress": 100,
      "speed": "0 B/s",
      "seeding": "Stopped (0 B/s)",
      "completed": true,
      "stream_url": "http://192.168.0.14:8080/files/The.Court.S01.E41-44.1080p.mkv"
    }
  ],
  "currently_downloading": [
    {
      "id": "item-7f9a2b",
      "name": "Sandakari.2026.1080p.HEVC.mkv",
      "clean_title": "Sandakari (2026)",
      "priority": "Highest | Normal | Low",
      "priority_badge": "⚡ Highest Priority (Streaming)",
      "is_active_stream": true,
      "status": "Downloading & Streaming (Highest Priority)",
      "progress": 38.4,
      "speed": "5.2 MB/s",
      "upload_speed": "180 KB/s",
      "downloaded": "820 MB",
      "total": "2.1 GB",
      "peers": 48,
      "time_remaining": "4m 12s",
      "completed": false,
      "stream_url": "http://192.168.0.14:8889/0"
    }
  ]
}
```

---

### 3.3 Start Torrent / Stream: `GET /start_torrent`
Initiates live streaming or sequential background downloading for a torrent file or magnet URI.

**Query Parameters:**
- `file` (string, optional): Filename of the `.torrent` or video file in `uploads/` or `downloads/`.
- `magnet` (string, optional): Magnet link URI.
- `downloadOnly` (boolean, optional): If `true`, runs sequentially in background without interrupting active streaming.
- `fileIdx` (integer, optional): 0-indexed file inside multi-file torrent.
- `episode` (string, optional): Specific episode filename.

**Response** (`200 OK`, `application/json`):
```json
{
  "status": "started | background_started | already_downloaded",
  "streamUrl": "http://192.168.0.14:8889/0",
  "filename": "Movie.Title.torrent",
  "isDownloaded": false
}
```

---

### 3.4 Stop Torrent: `GET /stop_torrent`
Terminates the active live torrent engine stream.

**Response** (`200 OK`, `application/json`):
```json
{
  "status": "stopped"
}
```

---

### 3.5 Priority Management
- **`GET /api/prioritize?file=<FILENAME>`**: Promotes torrent to Highest streaming priority.
- **`GET /api/low_priority?file=<FILENAME>`**: Sets torrent to Low priority (downloads last).
- **`GET /api/normal_priority?file=<FILENAME>`**: Restores torrent to Normal priority.

---

### 3.6 File Upload: `POST /upload`
Receives multipart binary file uploads from client devices (phones, tablets, PCs).

**Request**: `multipart/form-data`, field name `file`.

**Behavior**:
- Automatically saves binary stream into `uploads/`.
- If the uploaded file is a `.torrent`, the Server enqueues it for background download.
- Broadcasts WebSocket events `file_upload_start` and `file_upload_complete` to all active clients.

---

### 3.7 WebSocket Bridge: `ws://<SERVER_IP>:8080/ws`
RFC 6455 compliant persistent socket.

**Server to Client Message Types**:
- `connected`: Handshake confirmation.
- `file_upload_start`: Notification that an upload has begun (`fileId`, `filename`).
- `file_upload_complete`: Notification of finished upload (`fileId`, `filename`, `downloadUrl`).
- `torrent_stats_update`: Real-time streaming speed and peer count.
- `storage_target_update`: Broadcast when active storage destination changes.

**Client to Server Commands**:
- `{"type": "start_torrent", "filename": "example.torrent"}`
- `{"type": "stop_torrent"}`
- `{"type": "storage_mode_changed", "mode": "usb | local | server"}`
- Any raw string message is logged to the Server terminal for remote TV debugging (`[TV LOG] <msg>`).
