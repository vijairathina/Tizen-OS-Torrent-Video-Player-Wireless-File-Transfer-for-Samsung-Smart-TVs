# Android – BlueStacks-Style Android Emulator for Samsung Tizen TV

A standalone Samsung Smart TV application named **Android** providing a dedicated Android environment, 10-foot television interface, APK file management, binary manifest analysis, and runtime diagnostics directly on Samsung Smart TVs running Tizen OS.

---

## 🎯 Target Hardware & Live Probing Telemetry

Verified and probed live on target television via Samsung Smart Development Bridge (`sdb`):

| Hardware / OS Parameter | Real Probed Specification |
| :--- | :--- |
| **Device Model** | **Samsung UA43UE84AFULXL** (Crystal 4K UHD, 2024/2025 Series) |
| **Internal Model Code** | `25_KSUE_UB_VOX_T10` |
| **Operating System** | **Samsung Tizen OS 10.0** (Product Version 4.0, Platform Build 10.0) |
| **CPU Architecture** | **armv7 (32-bit ARM)** (`core_abi: arm_32`) |
| **CPU Cores** | Quad-Core ARM Cortex-A53 / A55 in AArch32 mode |
| **Display Panel** | **3840 x 2160 (4K UHD)** @ 60Hz |
| **System Memory** | ~1.5 GB physical RAM (~512MB - 768MB available to user apps) |
| **App Storage Partition** | `/opt/usr/home/owner/apps_rw/aM9fAnd001/` (~1.8 GB free) |
| **Security Architecture** | Sandboxed UID 5001 (`owner`), Smack kernel MAC enforced |
| **Interactive Shell** | Disabled (`intershell_support: disabled`, `sdbd_rootperm: disabled`) |
| **Kernel Binder (`/dev/binder`)**| **Missing in stock Samsung kernel** (Hard blocker for native AOSP) |
| **Hardware Virtualization** | **Absent** (No `/dev/kvm`, ARM EL2 locked by TrustZone) |

---

## 🏗️ Engineering Architecture: Modular Multi-Tier Engine

Due to stock Tizen kernel restrictions (`/dev/binder` and `/dev/kvm` absent, unprivileged UID 5001), running a bare-metal AOSP OS directly on unrooted Tizen is technically impossible. To deliver a genuine BlueStacks-style experience without compromising engineering honesty, the system implements a **Dual-Tier Hybrid Architecture**:

```
+----------------------------------------------------------------------------------+
|                    SAMSUNG TIZEN TV (UA43UE84AFULXL)                             |
|                                                                                  |
|  +----------------------------------------------------------------------------+  |
|  |             STANDALONE TIZEN APPLICATION CONTAINER ("Android")             |  |
|  |                                                                            |  |
|  |  +---------------------------+  +---------------------------------------+  |  |
|  |  |     10-FOOT TV LAUNCHER   |  |        APK MANAGEMENT SUITE           |  |  |
|  |  |  * Android Home Screen    |  |  * Multi-USB File Scanner             |  |  |
|  |  |  * App Drawer & Recents   |  |  * Binary AndroidManifest.xml Parser  |  |  |
|  |  |  * Remote Control D-pad   |  |  * APK Validator (SDK, Arch, Perms)   |  |  |
|  |  |  * Spatial Navigation     |  |  * Local App Library & Icon Extractor |  |  |
|  |  +---------------------------+  +---------------------------------------+  |  |
|  |                                                                            |  |
|  |  +---------------------------+  +---------------------------------------+  |  |
|  |  |   RUNTIME MANAGER & DIAG  |  |       INPUT & DISPLAY ENGINE          |  |  |
|  |  |  * TV Telemetry & RAM     |  |  * Remote Key Event Mapper            |  |  |
|  |  |  * Binder / Kernel Status |  |  * Virtual Touch / Pointer Emulation  |  |  |
|  |  |  * SDB / Security Monitor |  |  * Samsung AVPlay Hardware Surface    |  |  |
|  |  +---------------------------+  +---------------------------------------+  |  |
|  +----------------------------------------------------------------------------+  |
+----------------------------------------------------------------------------------+
```

### 1. Standalone On-TV Application Suite (`tizen-app/`)
- **10-Foot Television User Interface:** Android TV inspired dark theme (`#090C10`, `#12161F`), glowing emerald Android accents (`#3DDC84`), glassmorphism, responsive 1080p and 4K layouts.
- **2D Spatial Navigation Engine:** Full Samsung TV remote support (D-pad Up/Down/Left/Right, Enter, Back, Media keys) with Euclidean directional distance calculations.
- **Audio Feedback:** Subtle procedural remote clicks via HTML5 Web Audio API.
- **Main Dashboard Views:**
  1. 🏠 **Home:** Quick launch, recent tasks, system status cards.
  2. 📱 **Installed Apps:** Android Application Drawer.
  3. 🛍️ **Play Store:** Curated TV catalog (Aurora Store / F-Droid open protocol).
  4. 📦 **APK Installer:** Dual-pane explorer with USB storage selector and 12-step APK install wizard.
  5. 📂 **File Manager:** Multi-USB and internal storage browser.
  6. ⬇️ **Downloads:** APK cache and pending downloads.
  7. ⏱️ **Recent Apps:** Android activity switcher.
  8. ⚙️ **Settings:** Display scale, remote key mapping, audio profiles.
  9. 📊 **Runtime Manager:** Live TV telemetry, kernel verification, live event console.

### 2. Binary APK Parsing Engine (`apk-parser.js`)
- Client-side ZIP Central Directory and Local File Header scanner.
- Binary XML decoder (`AndroidManifest.xml` AXML chunk parser):
  - Extracts package ID (`package="..."`).
  - Decodes version code & version name.
  - Identifies minimum SDK and target SDK requirements.
  - Resolves `<uses-permission>` requirements.
  - Scans `lib/` directory inside the APK for CPU architecture support:
    - `armeabi-v7a` (32-bit ARM) -> **Compatible with TV hardware**
    - `arm64-v8a` (64-bit ARM) -> **Warns: Incompatible with TV 32-bit CPU**
    - `Universal` (Pure DEX bytecode) -> **Universal compatibility**
  - Extracts application icons and converts them to base64 data URLs for display.

---

## 📁 Project Structure

```text
D:\PY\SamsungTV\AndroidTv\
├── tizen-app/                     # Standalone Samsung TV Application
│   ├── config.xml                 # Tizen TV Widget Manifest (App ID: aM9fAnd001.Android)
│   ├── index.html                 # 10-foot TV Interface with 9 Dashboard Views
│   ├── icon.png                   # High-Resolution 512x512 3D Android TV Icon
│   ├── css/
│   │   └── style.css              # Dark theme, glassmorphism, 4K spatial focus states
│   └── js/
│       ├── tv-keys.js             # Samsung remote keycodes & Web Audio click synthesizer
│       ├── navigation.js          # 2D Spatial navigation algorithm
│       ├── apk-parser.js          # Binary APK & AndroidManifest.xml parser
│       ├── usb-manager.js         # Tizen filesystem multi-USB scanner
│       ├── apk-installer.js       # 12-step APK installation workflow & app registry
│       ├── runtime-manager.js     # Live telemetry, kernel status & diagnostic console
│       ├── app-store.js           # Play Store & open-source catalog bridge
│       └── app.js                 # Master controller & lifecycle hooks
├── apk-manager/                   # Modular APK management architecture
├── android-runtime/               # Runtime specs & micro-runtime definitions
├── google-services/               # GMS assessment & open-source catalog integration
├── documentation/
│   └── FEASIBILITY_REPORT.md      # Comprehensive technical engineering assessment
├── build/
│   └── Android.wgt                # Signed, packaged Tizen widget
├── build.py                       # Automated Python packaging script
├── deploy.ps1                     # SDB TV deploy and launch pipeline
└── README.md
```

---

## 🚀 Building & Deploying to Samsung Smart TV

### Prerequisites
- Samsung Smart TV connected to Wi-Fi (`192.168.0.12`).
- Developer Mode enabled on the TV (Host IP: `192.168.0.13`).
- SDB tools available in `D:\PY\SamsungTV\tools\sdb.exe` and `apps2samsung-cli.exe`.

### Automated Deployment
From PowerShell, execute:
```powershell
cd D:\PY\SamsungTV\AndroidTv
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```

The script will:
1. Verify connectivity with the TV REST API.
2. Package `tizen-app/` into `build/Android.wgt`.
3. Connect over SDB to `192.168.0.12:26101`.
4. Sign the package with the TV's Public DUID certificate (`CPCPQMOLXR7O4`).
5. Install and launch the **Android** application directly on the TV.

---

## 🎮 Samsung TV Remote Navigation Guide

| Samsung Remote Button | Function in Android TV |
| :--- | :--- |
| **D-pad Up / Down / Left / Right** | 2D Spatial navigation between UI tiles, cards, and tabs |
| **Enter / Center Select** | Select, open app, inspect APK, trigger installation |
| **Return / Back** | Return to previous view, dismiss modal, exit app |
| **Play / Pause** | Media playback control |
| **Volume Up / Down** | System volume adjustment |

---

*Engineered with strict adherence to real-world hardware capabilities and transparent technical integrity.*
