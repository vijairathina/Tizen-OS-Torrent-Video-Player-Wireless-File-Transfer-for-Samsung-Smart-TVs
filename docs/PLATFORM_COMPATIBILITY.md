# Platform Compatibility & Multi-Platform Strategy

## 1. Executive Summary

This document establishes the platform compatibility analysis, technical feasibility assessment, feature parity mapping, and architectural isolation strategy across four target platforms:
1. **Samsung Tizen OS** (Existing Production Application)
2. **Android TV & Google TV** (New Native Application)
3. **Android Phone** (New Native Application)
4. **Android Auto** (New Automotive Media Experience)

All platforms interface with the identical companion server backend (`server.py` + `torrent_engine.mjs`) hosted on the local network host ("Server").

---

## 2. Platform Feature Parity & Feasibility Matrix

| Feature / Capability | Samsung Tizen OS | Android TV / Google TV | Android Phone | Android Auto | Notes / Feasibility Assessment |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Technology Stack** | Tizen Web / AVPlay | Kotlin / Compose TV | Kotlin / Material 3 | Kotlin / Car App Library | Idiomatic native UI for each platform. |
| **Orientation** | Fixed Landscape | Fixed Landscape | Dynamic (Port/Land) | Automotive Display | Phone supports auto-rotation. |
| **Input Method** | TV Remote (D-pad) | TV Remote (D-pad) | Touch / Gestures | Rotary / Touchpad / Car Touch | TV platforms share D-pad navigation logic. |
| **Hero Spotlight Banner** | Supported | Supported | Adapted Mobile Tile | Not Applicable | Not permitted by Car App UI templates. |
| **Continue Watching Carousel** | Supported | Supported | Supported (Cards) | Supported (Media List) | Synced via shared Room database / API. |
| **Completed Movies Listing** | Supported | Supported | Supported | Supported (Browse Root) | Auto media items mapped to audio/media tree. |
| **Active Downloads Queue** | Supported | Supported | Supported | Not Applicable | Driver safety rules disallow active queue ops. |
| **Download Priority Controls** | Supported | Supported | Supported | Not Applicable | Only Phone, TV, and Tizen manage priority. |
| **Video Playback Engine** | Samsung AVPlay | AndroidX Media3 (ExoPlayer) | AndroidX Media3 (ExoPlayer) | **Restricted / Audio Only** | Video strictly blocked on Auto while driving. |
| **Audio Playback Engine** | Supported | Supported | Supported | **Native Media3 Session** | Fully supported in Android Auto. |
| **Timeline Scrubbing / Seeking**| Supported (D-pad) | Supported (D-pad) | Supported (Touch Scrub) | Supported (Car Transport) | MediaSession standard playback controls. |
| **Multi-Audio Track Selector** | Supported | Supported | Supported | MediaSession Track | ExoPlayer track selector. |
| **Subtitles Rendering (SRT/VTT)**| Supported | Supported | Supported | Not Applicable | Subtitles not permitted on Auto screen. |
| **Wireless File Receiver** | Supported | Supported | Supported (Sender/Recv) | Not Applicable | Android Phone acts as primary file sender. |
| **Storage Explorer / Manager** | Supported (USB/Flash)| Supported (SAF/USB) | Supported (Local Storage) | Not Applicable | Storage browsing not permitted in Auto. |
| **TV Boost / Ad-Block Guide** | Supported | Supported (TV Clean) | Not Applicable | Not Applicable | TV specific feature. |

---

## 3. In-Depth Android Auto Assessment & Compliance

### 3.1 Google Play Automotive Policy & Driver Distraction Rules
Android Auto operates under strict regulatory and safety constraints defined by Google and transportation authorities (NHTSA):
- **Allowed Categories**: Media (Audio only), Navigation, Point of Interest (POI), and Internet of Things (IoT).
- **Prohibited Capabilities**: Video playback, custom web views, arbitrary canvas rendering, interactive file file managers, and torrent queue controls are strictly disallowed while the vehicle is in motion or connected to the car head unit.
- **Strict UI Templates**: Android Auto apps must render through the `androidx.car.app` template engine or standard `MediaLibraryService` (`androidx.media3.session`), rendering standard media browse trees and playback controls.

### 3.2 Implemented Automotive Architecture
To maintain 100% compliance without risking store rejection or driver safety violations:
1. **MediaLibraryService Integration**: The automotive module exposes a standard `MediaLibraryService` powered by AndroidX Media3.
2. **Media Browse Hierarchy**:
   - `Root`
     - 📁 `Completed Media`: Lists all ready-to-stream movies and audio tracks hosted on the Server.
     - 📁 `Continue Watching`: Surfaces recently played media with resume points.
     - 📁 `Audio Tracks`: Serves audio streams and audio tracks extracted from completed downloads.
3. **Audio-Stream Playback**: While driving, playing any media item automatically routes the high-fidelity audio stream to the car's sound system with media metadata (title, artist/server, duration, artwork, play/pause/seek controls).
4. **Separation of Concerns**: Video playback, torrent downloading controls, and file receiving remain exclusively available on the Android Phone and Android TV applications.

---

## 4. Shared Core Architecture (`android/core/`)

To eliminate code duplication across Android Phone, Android TV, and Android Auto, all non-UI logic is extracted into a shared library module (`android:core`):

```
android/core/
├── common/
│   ├── Result.kt (Functional error handling)
│   ├── Constants.kt (API routes, storage keys, ports)
│   └── Extensions.kt (Formatting bytes, clean titles, time parsing)
├── network/
│   ├── ApiClient.kt (Retrofit/OkHttp builder, timeouts, logging)
│   ├── ServerApi.kt (Retrofit interface for all server.py endpoints)
│   └── WebSocketClient.kt (OkHttp WebSocket listener for /ws)
├── database/
│   ├── AppDatabase.kt (Room database definition)
│   ├── MediaDao.kt (Continue watching & resume point CRUD)
│   └── DownloadDao.kt (Cached downloads and priority state)
├── models/
│   ├── DownloadItem.kt (Completed & currently downloading movies)
│   ├── TorrentStats.kt (Progress, speed, peers, ETA)
│   ├── SystemStatus.kt (Streaming priority, active downloads, server health)
│   ├── StorageTarget.kt (Local flash, USB drive, server storage)
│   ├── MediaTrack.kt (Audio tracks and languages)
│   └── FileItem.kt (Storage explorer node)
├── repository/
│   ├── MediaRepository.kt (Single source of truth for media & resume points)
│   ├── TorrentRepository.kt (Controls start, stop, prioritize, queue sync)
│   └── FileTransferRepository.kt (Upload and file receive manager)
└── services/
    └── MediaPlaybackManager.kt (Shared ExoPlayer lifecycle & state holder)
```

---

## 5. Platform-Specific Manifest & Application IDs

| Platform | Application ID / Package | Minimum SDK | Target SDK | Primary Entry Point |
| :--- | :--- | :---: | :---: | :--- |
| **Samsung Tizen** | `aM9fHub001.TVFileHub` | Tizen 3.0 | Tizen 7.0+ | `index.html` |
| **Android TV** | `com.tvfilehub.tv` | 24 (Android 7.0) | 34 (Android 14) | `TvMainActivity.kt` (Leanback / TV Banner) |
| **Android Phone** | `com.tvfilehub.phone` | 24 (Android 7.0) | 34 (Android 14) | `PhoneMainActivity.kt` (Material 3) |
| **Android Auto** | `com.tvfilehub.phone` (Shared Service) / Auto Module | 24 (Android 7.0) | 34 (Android 14) | `CarMediaLibraryService.kt` (`automotive_app_desc.xml`) |

---

## 6. Development & Release Validation Criteria

1. **Tizen Backward Compatibility**: Build and deployment commands (`python build.py`, `./deploy.ps1`) must produce identical, functional Tizen `.wgt` packages without regressions.
2. **Android TV Remote Navigation**: All TV screens must be 100% navigable with a 5-way D-pad (Up, Down, Left, Right, OK) plus Back key; zero touch reliance.
3. **Android Phone Touch Optimization**: Fluid touch scrolling, pull-to-refresh, adaptive orientation, and bottom navigation.
4. **Android Auto Compliance**: Passes Android Media Browser verification tests (no video display during driving, compliant MediaSession metadata).
