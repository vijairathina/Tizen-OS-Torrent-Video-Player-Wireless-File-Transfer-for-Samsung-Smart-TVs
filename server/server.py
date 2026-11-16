#!/usr/bin/env python3
"""
Samsung Tizen TV File Hub - Companion HTTP & Transfer Bridge Server
Lightweight, zero-dependency server that hosts the Web Sender UI,
receives files from phones/PCs, and streams them directly to the Samsung TV app
over WebSockets (RFC 6455) and Server-Sent Events (SSE).
"""

import os
import sys
import json
import time
import uuid
import cgi
import struct
import base64
import hashlib
import threading
import subprocess
import re
import shutil
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

PORT = int(os.environ.get("PORT", 8080))
TORRENT_STREAM_PORT = int(os.environ.get("TORRENT_STREAM_PORT", 8889))
HOST_IP = os.environ.get("HOST_IP", "192.168.0.14")
BIND_IP = os.environ.get("BIND_IP", "0.0.0.0")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')
UPLOADS_DIR = os.path.join(BASE_DIR, 'uploads')
DOWNLOADS_DIR = os.path.join(BASE_DIR, 'downloads')

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(PUBLIC_DIR, exist_ok=True)
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

CURRENT_STORAGE_TARGET = "USB Drive"

def format_bytes(bytes_num):
    if not bytes_num or bytes_num <= 0:
        return "0 B"
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_num < 1024.0:
            return f"{bytes_num:.2f} {unit}"
        bytes_num /= 1024.0
    return f"{bytes_num:.2f} PB"

def get_mime_type(filepath):
    ext = filepath.lower().split('.')[-1]
    if ext in ('mp4', 'm4v'): return 'video/mp4'
    elif ext == 'mkv': return 'video/x-matroska'
    elif ext == 'webm': return 'video/webm'
    elif ext == 'avi': return 'video/x-msvideo'
    elif ext == 'mov': return 'video/quicktime'
    elif ext == 'ts': return 'video/mp2t'
    elif ext == 'mp3': return 'audio/mpeg'
    elif ext == 'aac': return 'audio/aac'
    elif ext == 'flac': return 'audio/flac'
    elif ext in ('srt', 'vtt'): return 'text/plain; charset=utf-8'
    elif ext == 'torrent': return 'application/x-bittorrent'
    return 'application/octet-stream'

def find_media_file(filename_or_query):
    """Finds an exact uploaded or downloaded file on disk."""
    if not filename_or_query:
        return None
    
    clean_target = os.path.basename(filename_or_query).strip()

    # 1. Exact match in UPLOADS_DIR (for uploaded files, torrents, etc.)
    p = os.path.join(UPLOADS_DIR, clean_target)
    if os.path.exists(p) and os.path.isfile(p):
        return p

    # 2. Exact match in DOWNLOADS_DIR (for downloaded videos, files, etc.)
    p = os.path.join(DOWNLOADS_DIR, clean_target)
    if os.path.exists(p) and os.path.isfile(p):
        return p

    # 3. Case-insensitive or clean match in UPLOADS_DIR
    target_lower = clean_target.lower()
    for root, dirs, files in os.walk(UPLOADS_DIR):
        for f in files:
            if f.lower() == target_lower:
                return os.path.join(root, f)

    # 4. Case-insensitive or clean match in DOWNLOADS_DIR
    for root, dirs, files in os.walk(DOWNLOADS_DIR):
        for f in files:
            if f.lower() == target_lower:
                return os.path.join(root, f)

    # 5. Substring match in DOWNLOADS_DIR
    for root, dirs, files in os.walk(DOWNLOADS_DIR):
        for f in files:
            if target_lower in f.lower() or f.lower() in target_lower:
                return os.path.join(root, f)

    return None

def find_torrent_file(filename_or_query):
    """Finds exact, prefix, or keyword-matched torrent file in UPLOADS_DIR. Never returns an unrelated movie."""
    if not filename_or_query:
        return None

    clean = os.path.basename(filename_or_query).strip()
    p = os.path.join(UPLOADS_DIR, clean)
    if os.path.exists(p) and os.path.isfile(p):
        return p

    stem = re.sub(r'\.torrent$', '', clean, flags=re.IGNORECASE).strip()
    target_lower = clean.lower()
    stem_lower = stem.lower()

    torrents = [f for f in os.listdir(UPLOADS_DIR) if f.lower().endswith('.torrent')]

    # 1. Exact case-insensitive match
    for f in torrents:
        if f.lower() == target_lower or f.lower() == stem_lower + '.torrent':
            return os.path.join(UPLOADS_DIR, f)

    # 2. Prefix / substring match (handles truncated filenames)
    for f in torrents:
        f_stem = re.sub(r'\.torrent$', '', f, flags=re.IGNORECASE).lower()
        if (len(stem_lower) >= 20 and (stem_lower.startswith(f_stem[:30]) or f_stem.startswith(stem_lower[:30]))) or \
           (stem_lower in f_stem or f_stem in stem_lower):
            return os.path.join(UPLOADS_DIR, f)

    # 3. Release title and year keyword match, e.g. "Title (Year)"
    m = re.search(r'-\s*([A-Za-z0-9\s]+?)\s*\((\d{4})\)', clean)
    if m:
        keyword = m.group(1).strip().lower()
        year = m.group(2)
        for f in torrents:
            if keyword in f.lower() and year in f:
                return os.path.join(UPLOADS_DIR, f)

    # 4. Fallback search by any distinct release title word
    words = [w for w in re.split(r'[^a-zA-Z0-9]+', stem_lower) if len(w) >= 3 and w not in (
        'tamil', 'hindi', 'telugu', '1080p', '720p', 'hevc', 'x264', 'x265', 'true',
        'web', 'dl', 'hdts', 'hdrip', 'atmos', 'esub', 'clean', 'www', 'torrent', 'bluray', 'remux', 'dvdrip', 'aac', 'ac3')]
    if words:
        for f in torrents:
            f_lower = f.lower()
            if all(w in f_lower for w in words):
                return os.path.join(UPLOADS_DIR, f)

    return None

def get_torrent_main_file_info(torrent_path):
    """Extracts target video file name and expected size in bytes from torrent file metadata."""
    if not torrent_path or not os.path.exists(torrent_path):
        return None, 0
    try:
        with open(torrent_path, 'rb') as f:
            c = f.read()
        names = re.findall(rb'4:name(\d+):', c)
        file_name = None
        if names:
            n_len = int(names[0])
            idx = c.find(b'4:name' + str(n_len).encode() + b':') + len(b'4:name' + str(n_len).encode() + b':')
            file_name = c[idx:idx+n_len].decode('utf-8', errors='ignore')
        lengths = re.findall(rb'6:lengthi(\d+)e', c)
        if not lengths:
            lengths = re.findall(rb':lengthi(\d+)e', c)
        tot_size = max(int(l) for l in lengths) if lengths else 0
        return file_name, tot_size
    except Exception:
        return None, 0

def parse_torrent_files(torrent_path):
    """Parses .torrent bencode metadata and returns list of video files/episodes."""
    if not torrent_path or not os.path.exists(torrent_path):
        return []

    try:
        with open(torrent_path, 'rb') as f:
            data = f.read()

        def decode_bencode(idx=0):
            if idx >= len(data): return None, idx
            b = data[idx:idx+1]
            if b == b'i':
                end = data.find(b'e', idx)
                return int(data[idx+1:end]), end + 1
            elif b == b'l':
                idx += 1
                res = []
                while idx < len(data) and data[idx:idx+1] != b'e':
                    val, idx = decode_bencode(idx)
                    res.append(val)
                return res, idx + 1
            elif b == b'd':
                idx += 1
                res = {}
                while idx < len(data) and data[idx:idx+1] != b'e':
                    key, idx = decode_bencode(idx)
                    val, idx = decode_bencode(idx)
                    if isinstance(key, bytes):
                        try: key = key.decode('utf-8', errors='ignore')
                        except Exception: key = str(key)
                    res[key] = val
                return res, idx + 1
            elif b.isdigit():
                colon = data.find(b':', idx)
                length = int(data[idx:colon])
                start = colon + 1
                return data[start:start+length], start + length
            return None, idx + 1

        meta, _ = decode_bencode(0)
        info = meta.get('info', {}) if meta else {}
        files_list = []
        video_exts = ('.mkv', '.mp4', '.avi', '.mov', '.webm', '.ts')
        import urllib.parse

        if 'files' in info:
            for idx, item in enumerate(info['files']):
                length = item.get('length', 0)
                raw_path = item.get('path', [])
                path_parts = [p.decode('utf-8', errors='ignore') if isinstance(p, bytes) else str(p) for p in raw_path]
                file_name = path_parts[-1] if path_parts else f'file_{idx}'
                if file_name.lower().endswith(video_exts):
                    downloaded_path = find_media_file(file_name)
                    is_downloaded = bool(downloaded_path and os.path.exists(downloaded_path) and os.path.getsize(downloaded_path) > 0)
                    url = f"http://{HOST_IP}:{PORT}/files/{urllib.parse.quote(file_name)}" if is_downloaded else f"http://{HOST_IP}:8889/{idx}"
                    files_list.append({
                        'index': idx,
                        'name': file_name,
                        'path': '/'.join(path_parts),
                        'length': length,
                        'sizeStr': format_bytes(length),
                        'isDownloaded': is_downloaded,
                        'streamUrl': url
                    })
        else:
            name = info.get('name', b'').decode('utf-8', errors='ignore') if isinstance(info.get('name'), bytes) else str(info.get('name', ''))
            length = info.get('length', 0)
            if name.lower().endswith(video_exts):
                downloaded_path = find_media_file(name)
                is_downloaded = bool(downloaded_path and os.path.exists(downloaded_path) and os.path.getsize(downloaded_path) > 0)
                url = f"http://{HOST_IP}:{PORT}/files/{urllib.parse.quote(name)}" if is_downloaded else f"http://{HOST_IP}:8889/0"
                files_list.append({
                    'index': 0,
                    'name': name,
                    'path': name,
                    'length': length,
                    'sizeStr': format_bytes(length),
                    'isDownloaded': is_downloaded,
                    'streamUrl': url
                })
        return files_list
    except Exception as e:
        print(f"[TorrentEngine] Error parsing torrent files: {e}")
        return []


def is_torrent_fully_downloaded(torrent_path_or_filename):
    """
    Checks whether all media files for a torrent are 100% completed on disk.
    Auto-creates .done marker files when confirmed complete.
    """
    if not torrent_path_or_filename:
        return False
    t_path = torrent_path_or_filename if os.path.isabs(torrent_path_or_filename) else find_torrent_file(torrent_path_or_filename)
    if not t_path or not os.path.exists(t_path):
        return False

    t_name = os.path.basename(t_path)
    stem = re.sub(r'\.torrent$', '', t_name, flags=re.IGNORECASE).strip()

    # If top-level .done marker exists
    if os.path.exists(os.path.join(DOWNLOADS_DIR, t_name + '.done')) or \
       os.path.exists(os.path.join(DOWNLOADS_DIR, stem + '.done')):
        return True

    # Parse torrent metadata
    files = parse_torrent_files(t_path)
    if not files:
        exp_name, exp_size = get_torrent_main_file_info(t_path)
        if exp_name and exp_size > 0:
            for root, _, disk_files in os.walk(DOWNLOADS_DIR):
                if exp_name in disk_files:
                    fp = os.path.join(root, exp_name)
                    if os.path.exists(fp + '.done') or os.path.getsize(fp) >= exp_size * 0.99:
                        try:
                            with open(fp + '.done', 'w') as df: df.write('1')
                            with open(os.path.join(DOWNLOADS_DIR, stem + '.done'), 'w') as df: df.write('1')
                        except Exception: pass
                        return True
        return False

    video_files = [f for f in files if f.get('name') and not f['name'].startswith('.pad')]
    if not video_files:
        return False

    all_done = True
    found_count = 0
    for vf in video_files:
        v_name = vf['name']
        v_len = vf.get('length', 0)
        found_fp = None
        for root, _, disk_files in os.walk(DOWNLOADS_DIR):
            if v_name in disk_files:
                found_fp = os.path.join(root, v_name)
                break
        if not found_fp:
            all_done = False
            break

        actual_size = os.path.getsize(found_fp)
        has_marker = os.path.exists(found_fp + '.done') or os.path.exists(os.path.join(DOWNLOADS_DIR, v_name + '.done'))
        if has_marker or (v_len > 0 and actual_size >= v_len * 0.99):
            found_count += 1
            if not has_marker:
                try:
                    with open(found_fp + '.done', 'w') as df: df.write('1')
                except Exception: pass
        else:
            all_done = False
            break

    if all_done and found_count == len(video_files):
        try:
            with open(os.path.join(DOWNLOADS_DIR, stem + '.done'), 'w') as df: df.write('1')
        except Exception: pass
        return True

    return False


def get_torrent_disk_progress(t_path):
    """Calculates progress (percentage, downloaded_bytes, total_bytes) from disk files."""
    if not t_path or not os.path.exists(t_path):
        return 0, 0, 0
    files = parse_torrent_files(t_path)
    if not files:
        exp_name, exp_size = get_torrent_main_file_info(t_path)
        if exp_name and exp_size > 0:
            for root, _, disk_files in os.walk(DOWNLOADS_DIR):
                if exp_name in disk_files:
                    act = os.path.getsize(os.path.join(root, exp_name))
                    prog = min(100, int((act / exp_size) * 100))
                    return prog, act, exp_size
        return 0, 0, 0

    video_files = [f for f in files if f.get('name') and not f['name'].startswith('.pad')]
    if not video_files:
        return 0, 0, 0

    total_len = sum(f.get('length', 0) for f in video_files)
    if total_len <= 0:
        return 0, 0, 0

    downloaded_len = 0
    for vf in video_files:
        v_name = vf['name']
        v_len = vf.get('length', 0)
        for root, _, disk_files in os.walk(DOWNLOADS_DIR):
            if v_name in disk_files:
                act = os.path.getsize(os.path.join(root, v_name))
                downloaded_len += min(v_len, act)
                break

    prog = min(100, int((downloaded_len / total_len) * 100))
    return prog, downloaded_len, total_len


def find_downloaded_video(filename_or_query):
    """Finds a truly 100% completed video file matching a torrent in DOWNLOADS_DIR."""
    if not filename_or_query:
        return None

    # Check if torrent as a whole is complete
    t_path = find_torrent_file(filename_or_query)
    if t_path and is_torrent_fully_downloaded(t_path):
        exp_name, _ = get_torrent_main_file_info(t_path)
        if exp_name:
            for root, _, files in os.walk(DOWNLOADS_DIR):
                if exp_name in files:
                    return os.path.join(root, exp_name)
        stem = re.sub(r'\.torrent$', '', os.path.basename(t_path), flags=re.I).strip()
        cand = os.path.join(DOWNLOADS_DIR, stem)
        if os.path.exists(cand):
            return cand

    # Direct file match with .done marker
    clean_target = os.path.basename(filename_or_query).strip()
    stem = re.sub(r'\.torrent$', '', clean_target, flags=re.I).strip()
    if os.path.exists(DOWNLOADS_DIR):
        for root, _, files in os.walk(DOWNLOADS_DIR):
            for f in files:
                if f.lower().endswith(('.mkv', '.mp4', '.avi', '.mov', '.webm', '.ts')):
                    if f == clean_target or f == stem or (stem and stem.lower() in f.lower()):
                        fp = os.path.join(root, f)
                        if os.path.exists(fp + '.done') or os.path.exists(os.path.join(DOWNLOADS_DIR, f + '.done')):
                            return fp

    return None

LANG_NAME_MAP = {
    'tam': 'Tamil', 'ta': 'Tamil',
    'tel': 'Telugu', 'te': 'Telugu',
    'hin': 'Hindi', 'hi': 'Hindi',
    'mal': 'Malayalam', 'ml': 'Malayalam',
    'kan': 'Kannada', 'kn': 'Kannada',
    'eng': 'English', 'en': 'English',
    'spa': 'Spanish', 'es': 'Spanish',
    'fra': 'French', 'fr': 'French',
    'ger': 'German', 'de': 'German',
    'ben': 'Bengali', 'bn': 'Bengali',
    'mar': 'Marathi', 'mr': 'Marathi'
}

def get_media_audio_tracks(filename_or_path):
    """Detects embedded audio language tracks from MKV / MP4 container headers."""
    filepath = find_media_file(filename_or_path)
    if not filepath or not os.path.exists(filepath):
        clean = os.path.basename(filename_or_path)
        m = re.search(r'\[(.*?)\]', clean)
        if m:
            raw_langs = re.split(r'[\+\,\/\|\s]+', m.group(1))
            res = []
            idx = 0
            for rl in raw_langs:
                low = rl.strip().lower()
                if low in LANG_NAME_MAP:
                    res.append({'index': idx, 'code': low, 'name': LANG_NAME_MAP[low]})
                    idx += 1
            if res:
                return res
        return []

    try:
        with open(filepath, 'rb') as f:
            data = f.read(300000)

        # Matroska EBML: Element ID 0x22B59C (\x22\xb5\x9c) is Language
        raw_matches = re.findall(b'\\x22\\xb5\\x9c\\x83([a-z]{3})', data)
        audio_tracks = []
        idx = 0
        for m in raw_matches:
            code = m.decode('ascii', errors='ignore').strip().lower()
            if code and code != 'und':
                name = LANG_NAME_MAP.get(code, code.upper())
                audio_tracks.append({
                    'index': idx,
                    'code': code,
                    'name': name
                })
                idx += 1

        if not audio_tracks:
            clean = os.path.basename(filepath)
            m = re.search(r'\[(.*?)\]', clean)
            if m:
                raw_langs = re.split(r'[\+\,\/\|\s]+', m.group(1))
                idx = 0
                for rl in raw_langs:
                    low = rl.strip().lower()
                    if low in LANG_NAME_MAP:
                        audio_tracks.append({'index': idx, 'code': low, 'name': LANG_NAME_MAP[low]})
                        idx += 1

        return audio_tracks
    except Exception as e:
        print(f"[MediaInfo] Error reading audio tracks: {e}")
        return []


def clean_media_title(raw_name):
    """Cleans up raw torrent / movie filenames into readable display titles."""
    if not raw_name:
        return "Unknown"
    t = re.sub(r'^www\.[a-zA-Z0-9-]+\.[a-zA-Z]+\s*-\s*', '', raw_name, flags=re.I)
    t = re.sub(r'\.torrent$', '', t, flags=re.I)
    t = re.sub(r'\.mkv$', '', t, flags=re.I)
    t = re.sub(r'\.mp4$', '', t, flags=re.I)
    t = re.sub(r'\.avi$', '', t, flags=re.I)
    return t.strip()


class TorrentStreamManager:
    def __init__(self, host_ip=None):
        self.host_ip = host_ip or HOST_IP
        self.process = None  # Active Highest Priority stream process
        self.current_stream_url = None
        self.current_title = ""
        self.current_torrent = None
        self.current_file_idx = None
        self.stats = {
            "name": "",
            "title": "",
            "speed": "0 KB/s",
            "upload_speed": "0 B/s (Seeding Stopped)",
            "downloaded": "0 MB",
            "total": "0 GB",
            "peers": 0,
            "progress": 0,
            "timeRemaining": "",
            "status": "Idle"
        }

        # Priority Queue System
        self.queue = []            # list of queue dicts
        self.bg_downloads = {}     # backward compatibility mapping: title -> { proc, torrent, title, stats }
        self.active_bg_proc = None # Active Normal Priority background download process
        self.active_bg_title = None
        self.lock = threading.RLock()
        self.stop_worker = False

        # Scan existing torrents in uploads on startup
        self.scan_and_enqueue_existing()

        # Start autonomous queue worker loop (runs independently on Raspberry Pi)
        self.worker_thread = threading.Thread(target=self._queue_worker_loop, daemon=True)
        self.worker_thread.start()

    def scan_and_enqueue_existing(self):
        """Scans UPLOADS_DIR on startup for .torrent files and enqueues incomplete ones for idle downloading."""
        try:
            if not os.path.exists(UPLOADS_DIR):
                return
            torrent_files = [f for f in os.listdir(UPLOADS_DIR) if f.lower().endswith('.torrent')]
            # Sort by modification time ascending so newer uploads are enqueued last and placed at the head of the queue
            torrent_files.sort(key=lambda f: os.path.getmtime(os.path.join(UPLOADS_DIR, f)))
            for f in torrent_files:
                t_path = os.path.join(UPLOADS_DIR, f)
                if is_torrent_fully_downloaded(t_path):
                    clean = clean_media_title(f)
                    print(f"[Queue] '{clean}' is ALREADY 100% completed on disk. Skipping startup queue.")
                    continue
                self.enqueue_torrent(t_path, filename=f, high_priority=False)
        except Exception as e:
            print(f"[Queue] Error scanning uploads on startup: {e}")

    def enqueue_torrent(self, torrent_path_or_magnet, filename=None, high_priority=False):
        """Enqueues a torrent for background download. Runs independently of TV status."""
        with self.lock:
            fname = filename or os.path.basename(torrent_path_or_magnet)
            clean = clean_media_title(fname)

            # Check if video is ALREADY in DOWNLOADS_DIR with .done marker or full size
            if is_torrent_fully_downloaded(torrent_path_or_magnet) or find_downloaded_video(fname):
                print(f"[Queue] '{clean}' is ALREADY 100% completed on disk. Skipping download queue.")
                return False

            # Check if already in queue
            for item in self.queue:
                if item["filename"] == fname or item["torrent_path"] == torrent_path_or_magnet:
                    # If previously marked completed but not actually on disk, revive it
                    if item.get("completed", False) and not find_downloaded_video(fname):
                        item["completed"] = False
                        item["progress"] = 0
                        item["priority"] = "HIGHEST" if high_priority else "QUEUED"
                        item["status"] = "Highest Priority (Queued)" if high_priority else "Queued in Background"
                    if high_priority and item["priority"] != "HIGHEST":
                        item["priority"] = "HIGHEST"
                        item["status"] = "Highest Priority (Queued)"
                        self.queue.remove(item)
                        self.queue.insert(0, item)
                    elif not high_priority:
                        # Move to front of queued items so user's newly uploaded torrent starts next
                        self.queue.remove(item)
                        insert_idx = 0
                        for i, q in enumerate(self.queue):
                            if q.get("priority") == "HIGHEST":
                                insert_idx = i + 1
                            else:
                                break
                        self.queue.insert(insert_idx, item)
                    print(f"[Queue] Updated existing queue item for '{clean}' (Priority: {item['priority']})")
                    return True

            exp_size = 0
            if os.path.exists(torrent_path_or_magnet):
                _, exp_size = get_torrent_main_file_info(torrent_path_or_magnet)

            item = {
                "id": str(uuid.uuid4())[:8],
                "torrent_path": torrent_path_or_magnet,
                "filename": fname,
                "clean_title": clean,
                "priority": "HIGHEST" if high_priority else "QUEUED",
                "status": "Highest Priority (Streaming)" if high_priority else "Queued in Background",
                "progress": 0,
                "speed": "0 B/s",
                "upload_speed": "0 B/s (Active)",
                "downloaded": "0 B",
                "total": format_bytes(exp_size) if exp_size > 0 else "Calculating...",
                "peers": 0,
                "time_remaining": "Calculating...",
                "completed": False,
                "is_active_stream": False,
                "stream_url": None,
                "retry_count": 0,
                "created_at": time.time()
            }

            if high_priority:
                self.queue.insert(0, item)
            else:
                # Place before older queued items so newly uploaded torrent starts next in idle mode
                insert_idx = 0
                for i, q in enumerate(self.queue):
                    if q.get("priority") == "HIGHEST":
                        insert_idx = i + 1
                    else:
                        break
                self.queue.insert(insert_idx, item)

            print(f"[Queue] Enqueued torrent: '{clean}' (Priority: {item['priority']})")
            return True

    def start_torrent(self, torrent_path_or_magnet, title=None, file_idx=None):
        """
        Highest Priority: When user opens or plays a video, immediately prioritize and stream it.
        Suspends any normal background download to allocate 100% bandwidth to video playback.
        """
        with self.lock:
            clean_title = title or os.path.basename(torrent_path_or_magnet)

            # Check if video is ALREADY 100% in DOWNLOADS_DIR
            downloaded = find_downloaded_video(clean_title)
            if downloaded and not downloaded.lower().endswith('.torrent'):
                v_name = os.path.basename(downloaded)
                v_size = os.path.getsize(downloaded)
                import urllib.parse
                encoded = urllib.parse.quote(v_name)
                stream_url = f"http://{self.host_ip}:{PORT}/files/{encoded}"
                print(f"[TorrentEngine] Torrent '{clean_title}' is ALREADY 100% DOWNLOADED at: {downloaded}")
                print(f"[TorrentEngine] Direct HTTP streaming URL: {stream_url}")

                self.stop()
                self.current_stream_url = stream_url
                self.current_title = v_name
                self.current_torrent = downloaded
                self.stats = {
                    "name": v_name,
                    "title": v_name,
                    "speed": "0 B/s (Completed)",
                    "upload_speed": "0 B/s (Seeding Stopped)",
                    "downloaded": format_bytes(v_size),
                    "total": format_bytes(v_size),
                    "peers": 0,
                    "progress": 100,
                    "timeRemaining": "0s",
                    "status": "Downloaded 100% (Ready to Stream)"
                }
                broadcast_message({
                    "type": "torrent_stream_started",
                    "streamUrl": stream_url,
                    "title": v_name,
                    "isDownloaded": True
                })
                return stream_url

            # If already running as the active stream
            if self.process and self.current_torrent == torrent_path_or_magnet:
                target_url = f"http://{self.host_ip}:{TORRENT_STREAM_PORT}/{file_idx}" if file_idx is not None else self.current_stream_url
                if self.current_stream_url:
                    broadcast_message({
                        "type": "torrent_stream_started",
                        "streamUrl": target_url or self.current_stream_url,
                        "title": clean_title
                    })
                    return target_url or self.current_stream_url

            # HIGHEST PRIORITY: If a normal background download is running, pause it immediately
            if self.active_bg_proc:
                print(f"[Queue] Yielding background download for '{self.active_bg_title}' to prioritize video stream.")
                self._kill_bg_download()

            self.stop()
            self.current_torrent = torrent_path_or_magnet
            self.current_title = clean_title
            self.current_file_idx = file_idx
            self.current_stream_url = None
            self.stats = {
                "name": clean_title,
                "title": clean_title,
                "speed": "Connecting...",
                "upload_speed": "0 B/s (Seeding Stopped)",
                "downloaded": "0 MB",
                "total": "Calculating...",
                "peers": 0,
                "progress": 1,
                "timeRemaining": "connecting...",
                "status": "Highest Priority (Downloading & Streaming)"
            }

            # Update queue item to HIGHEST priority
            for item in self.queue:
                if item["torrent_path"] == torrent_path_or_magnet or item["filename"] == os.path.basename(torrent_path_or_magnet):
                    item["priority"] = "HIGHEST"
                    item["status"] = "Highest Priority (Downloading & Streaming)"
                    item["is_active_stream"] = True

            cmd = ["node", os.path.join(BASE_DIR, "torrent_engine.mjs"), torrent_path_or_magnet]
            if file_idx is not None:
                cmd.append(f"--file-idx={file_idx}")
            print(f"[TorrentEngine] Starting sequential download & stream (HIGHEST PRIORITY) for: {clean_title} (file_idx={file_idx})")

            try:
                self.process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    cwd=BASE_DIR
                )
                self.current_stream_url = f"http://{self.host_ip}:{TORRENT_STREAM_PORT}/{file_idx if file_idx is not None else ''}"
                threading.Thread(target=self._monitor_stream, args=(self.process,), daemon=True).start()
                return self.current_stream_url
            except Exception as e:
                print(f"[TorrentEngine] Error starting torrent_engine: {e}")
                return None

    def _monitor_stream(self, proc):
        import urllib.parse
        while proc and proc.poll() is None:
            try:
                line = proc.stdout.readline()
                if not line:
                    break
                line_str = line.strip()

                if line_str.startswith("[ENGINE_STREAM_URL]"):
                    url = line_str.replace("[ENGINE_STREAM_URL]", "").strip()
                    self.current_stream_url = url
                    print(f"[TorrentEngine] TV Stream URL confirmed: {url}")
                    broadcast_message({
                        "type": "torrent_stream_started",
                        "streamUrl": url,
                        "title": self.current_title
                    })

                elif line_str.startswith("[ENGINE_DOWNLOADED_FILE]"):
                    v_name = line_str.replace("[ENGINE_DOWNLOADED_FILE]", "").strip()
                    encoded = urllib.parse.quote(v_name)
                    direct_url = f"http://{self.host_ip}:{PORT}/files/{encoded}"
                    self.current_stream_url = direct_url
                    done_path = os.path.join(DOWNLOADS_DIR, v_name + '.done')
                    try:
                        with open(done_path, 'w') as df:
                            df.write('1')
                    except Exception:
                        pass
                    print(f"[TorrentEngine] 100% Downloaded! Direct HTTP stream available: {direct_url}")
                    broadcast_message({
                        "type": "torrent_stream_started",
                        "streamUrl": direct_url,
                        "title": v_name,
                        "isDownloaded": True
                    })

                elif line_str.startswith("[ENGINE_STOP_SEEDING]"):
                    with self.lock:
                        self.stats["upload_speed"] = "0 B/s (Seeding Stopped)"
                        self.stats["status"] = "Completed (Seeding Stopped)"
                        self.stats["progress"] = 100
                        self.stats["completed"] = True

                elif line_str.startswith("[ENGINE_STATS]"):
                    payload = line_str.replace("[ENGINE_STATS]", "").strip()
                    try:
                        st = json.loads(payload)
                        with self.lock:
                            self.stats = {
                                "name": st.get("name", self.current_title),
                                "title": self.current_title,
                                "speed": st.get("downloadSpeed", "0 B/s"),
                                "upload_speed": st.get("uploadSpeed", "0 B/s (Seeding Stopped)"),
                                "downloaded": st.get("downloaded", "0 B"),
                                "total": st.get("total", "0 B"),
                                "peers": st.get("peers", 0),
                                "progress": st.get("progress", 0),
                                "timeRemaining": st.get("timeRemaining", ""),
                                "status": st.get("status", "Active")
                            }
                            # Sync to queue item
                            for item in self.queue:
                                if self.current_torrent and (item["torrent_path"] == self.current_torrent or item["filename"] in self.current_torrent):
                                    item["progress"] = self.stats["progress"]
                                    item["speed"] = self.stats["speed"]
                                    item["upload_speed"] = self.stats["upload_speed"]
                                    item["downloaded"] = self.stats["downloaded"]
                                    item["total"] = self.stats["total"]
                                    item["peers"] = self.stats["peers"]
                                    item["time_remaining"] = self.stats["timeRemaining"]
                                    item["status"] = self.stats["status"]
                                    if self.stats["progress"] >= 100:
                                        item["completed"] = True
                                        item["priority"] = "Completed"

                        broadcast_message({
                            "type": "torrent_stats_update",
                            "name": self.stats["name"],
                            "title": self.current_title,
                            "speed": self.stats["speed"],
                            "downloaded": self.stats["downloaded"],
                            "total": self.stats["total"],
                            "peers": self.stats["peers"],
                            "progress": self.stats["progress"],
                            "timeRemaining": self.stats["timeRemaining"],
                            "status": self.stats["status"]
                        })
                    except Exception:
                        pass
                else:
                    if line_str:
                        print(f"[TorrentEngineLog] {line_str}")
            except Exception:
                break

    def _kill_port_8889(self):
        try:
            if sys.platform == 'win32':
                out = subprocess.check_output("netstat -ano", shell=True, text=True)
                for line in out.splitlines():
                    if ':8889 ' in line and ('LISTENING' in line or 'ESTABLISHED' in line):
                        parts = line.strip().split()
                        pid = parts[-1]
                        if pid.isdigit() and int(pid) != os.getpid():
                            subprocess.run(f"taskkill /F /PID {pid}", shell=True, capture_output=True)
            else:
                subprocess.run(["fuser", "-k", "8889/tcp"], capture_output=True)
        except Exception:
            pass

    def _kill_bg_download(self):
        """Terminates or pauses normal priority background download."""
        if self.active_bg_proc:
            try:
                if sys.platform == 'win32':
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(self.active_bg_proc.pid)], capture_output=True)
                else:
                    self.active_bg_proc.terminate()
                    try:
                        self.active_bg_proc.wait(timeout=1)
                    except subprocess.TimeoutExpired:
                        self.active_bg_proc.kill()
            except Exception:
                try: self.active_bg_proc.kill()
                except Exception: pass

            if self.active_bg_title:
                for item in self.queue:
                    if item["filename"] == self.active_bg_title and not item.get("completed", False):
                        item["priority"] = "QUEUED"
                        item["status"] = "Queued in Background"
                        item["speed"] = "0 B/s"

            self.active_bg_proc = None
            self.active_bg_title = None

    def start_background_download(self, torrent_path_or_magnet, title=None):
        """Public method to start background download via queue."""
        fname = title or os.path.basename(torrent_path_or_magnet)
        return self.enqueue_torrent(torrent_path_or_magnet, filename=fname, high_priority=False)

    def _queue_worker_loop(self):
        """
        Autonomous priority queue manager loop running on Raspberry Pi.
        - Highest priority: Active stream running -> normal downloads yield.
        - Idle mode: When no video is playing, automatically download incomplete queue items.
        - When download completes, stop seeding and start next item.
        """
        while not self.stop_worker:
            try:
                time.sleep(1.5)
                with self.lock:
                    # 1. If active stream (HIGHEST PRIORITY) is running and downloading, keep normal downloads paused
                    if self.process and self.process.poll() is None:
                        is_stream_downloading = (self.stats.get("progress", 0) < 100) and not self.stats.get("completed", False)
                        if is_stream_downloading:
                            if self.active_bg_proc and self.active_bg_proc.poll() is None:
                                print("[Queue] Active stream running and downloading. Suspending background download.")
                                self._kill_bg_download()
                            continue

                    # 2. Check if background download process finished
                    if self.active_bg_proc:
                        if self.active_bg_proc.poll() is not None:
                            exit_code = self.active_bg_proc.poll()
                            print(f"[Queue] Background download process exited (code={exit_code}) for: {self.active_bg_title}")
                            if self.active_bg_title:
                                is_actually_done = bool(find_downloaded_video(self.active_bg_title))
                                for item in self.queue:
                                    if item["filename"] == self.active_bg_title:
                                        if is_actually_done or item.get("completed", False):
                                            item["completed"] = True
                                            item["progress"] = 100
                                            item["speed"] = "0 B/s"
                                            item["upload_speed"] = "0 B/s (Seeding Stopped)"
                                            item["status"] = "Completed (Seeding Stopped)"
                                            item["priority"] = "Completed"
                                            print(f"[Queue] Background download 100% verified completed on disk: {self.active_bg_title}")
                                        else:
                                            # Process exited or crashed without completing
                                            item["completed"] = False
                                            item["speed"] = "0 B/s"
                                            item["upload_speed"] = "0 B/s (Seeding Stopped)"
                                            item["priority"] = "QUEUED"
                                            item["retry_count"] = item.get("retry_count", 0) + 1
                                            item["status"] = f"Queued (Retry #{item['retry_count']})"
                                            print(f"[Queue] Process exited without completion (retries: {item['retry_count']}). Keeping queued: {self.active_bg_title}")
                            self.active_bg_proc = None
                            self.active_bg_title = None

                    # 3. IDLE MODE: If no stream and no background download running, start next incomplete item
                    if not self.active_bg_proc:
                        next_item = None
                        for item in list(self.queue):
                            if item.get("completed", False):
                                continue
                            if is_torrent_fully_downloaded(item["torrent_path"]) or find_downloaded_video(item["filename"]):
                                item["completed"] = True
                                item["progress"] = 100
                                item["speed"] = "0 B/s"
                                item["upload_speed"] = "0 B/s (Seeding Stopped)"
                                item["status"] = "Completed (Seeding Stopped)"
                                item["priority"] = "Completed"
                                continue
                            if item.get("retry_count", 0) >= 5:
                                continue
                            next_item = item
                            break

                        if next_item:
                            self._start_normal_bg_download(next_item)

            except Exception as e:
                print(f"[Queue Worker Exception] {e}")

    def _start_normal_bg_download(self, item):
        clean_title = item["clean_title"]
        torrent_path = item["torrent_path"]
        print(f"[Queue] [Idle Mode] Starting normal priority background download for: {clean_title}")
        cmd = ["node", os.path.join(BASE_DIR, "torrent_engine.mjs"), torrent_path, "--download-only"]
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                cwd=BASE_DIR
            )
            self.active_bg_proc = proc
            self.active_bg_title = item["filename"]
            item["priority"] = "NORMAL"
            item["status"] = "Downloading (Normal Priority)"
            self.bg_downloads[item["filename"]] = {
                "proc": proc,
                "torrent": torrent_path,
                "title": clean_title,
                "stats": item
            }

            threading.Thread(target=self._monitor_bg_stream, args=(proc, item), daemon=True).start()
        except Exception as e:
            print(f"[Queue] Error launching background download for {clean_title}: {e}")

    def _monitor_bg_stream(self, proc, item):
        while proc and proc.poll() is None:
            try:
                line = proc.stdout.readline()
                if not line:
                    break
                line_str = line.strip()

                if line_str.startswith("[ENGINE_DOWNLOADED_FILE]"):
                    v_name = line_str.replace("[ENGINE_DOWNLOADED_FILE]", "").strip()
                    done_path = os.path.join(DOWNLOADS_DIR, v_name + '.done')
                    try:
                        with open(done_path, 'w') as df:
                            df.write('1')
                    except Exception:
                        pass
                    print(f"[Queue] Background Download 100% completed: {v_name}")

                elif line_str.startswith("[ENGINE_STOP_SEEDING]") or line_str.startswith("[ENGINE_BG_COMPLETE]"):
                    item["completed"] = True
                    item["progress"] = 100
                    item["speed"] = "0 B/s"
                    item["upload_speed"] = "0 B/s (Seeding Stopped)"
                    item["status"] = "Completed (Seeding Stopped)"
                    item["priority"] = "Completed"

                elif line_str.startswith("[ENGINE_STATS]"):
                    payload = line_str.replace("[ENGINE_STATS]", "").strip()
                    try:
                        st = json.loads(payload)
                        with self.lock:
                            item["progress"] = st.get("progress", item.get("progress", 0))
                            item["speed"] = st.get("downloadSpeed", "0 B/s")
                            item["upload_speed"] = st.get("uploadSpeed", "0 B/s")
                            item["downloaded"] = st.get("downloaded", item.get("downloaded", "0 B"))
                            item["total"] = st.get("total", item.get("total", "0 B"))
                            item["peers"] = st.get("peers", 0)
                            item["time_remaining"] = st.get("timeRemaining", "0s")
                            if st.get("completed"):
                                item["completed"] = True
                                item["status"] = "Completed (Seeding Stopped)"
                                item["priority"] = "Completed"
                            else:
                                item["status"] = "Downloading (Normal Priority)"

                            if item["filename"] in self.bg_downloads:
                                self.bg_downloads[item["filename"]]["stats"] = dict(item)

                        broadcast_message({
                            "type": "torrent_stats_update",
                            "name": item["filename"],
                            "title": item["clean_title"],
                            "speed": item["speed"],
                            "downloaded": item["downloaded"],
                            "total": item["total"],
                            "peers": item["peers"],
                            "progress": item["progress"],
                            "timeRemaining": item["time_remaining"],
                            "status": item["status"],
                            "priority": item["priority"]
                        })
                    except Exception:
                        pass
                else:
                    if line_str:
                        print(f"[QueueBg:{item['clean_title'][:15]}] {line_str}")
            except Exception:
                break

    def prioritize_torrent(self, query):
        """Promotes a torrent to HIGHEST PRIORITY and starts streaming/downloading it."""
        with self.lock:
            if not query:
                return None
            clean_q = query.strip().lower()
            target_item = None
            for item in self.queue:
                if clean_q in item["filename"].lower() or clean_q in item["clean_title"].lower():
                    target_item = item
                    break

            if not target_item:
                t_path = find_torrent_file(query)
                if t_path and os.path.exists(t_path):
                    self.enqueue_torrent(t_path, filename=os.path.basename(t_path), high_priority=True)
                    target_item = self.queue[0]

            if target_item:
                print(f"[Queue] Promoting to HIGHEST PRIORITY: {target_item['clean_title']}")
                target_item["priority"] = "HIGHEST"
                return self.start_torrent(target_item["torrent_path"], title=target_item["clean_title"])
            return None

    def remove_from_queue(self, query):
        """Cancels and removes a torrent from queue and stops any associated process."""
        with self.lock:
            if not query:
                return
            clean_q = query.strip().lower()
            if self.current_torrent and clean_q in self.current_torrent.lower():
                self.stop()
            if self.active_bg_title and clean_q in self.active_bg_title.lower():
                self._kill_bg_download()
            self.queue = [item for item in self.queue if clean_q not in item["filename"].lower() and clean_q not in item["clean_title"].lower()]
            self.bg_downloads.pop(query, None)

    def stop(self):
        """Stops active stream and ports, allowing idle mode to resume in background."""
        if self.process:
            try:
                if sys.platform == 'win32':
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(self.process.pid)], capture_output=True)
                else:
                    self.process.terminate()
                    try:
                        self.process.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        self.process.kill()
            except Exception:
                try: self.process.kill()
                except Exception: pass
            self.process = None

        if self.current_torrent:
            for item in self.queue:
                if item["torrent_path"] == self.current_torrent or item["filename"] in self.current_torrent:
                    item["is_active_stream"] = False
                    if not item.get("completed", False):
                        item["priority"] = "QUEUED"
                        item["status"] = "Queued in Background"

        self.current_stream_url = None
        self.current_title = ""
        self.current_torrent = None
        self._kill_port_8889()

    def get_stats(self, query=None):
        with self.lock:
            if query:
                q_clean = query.strip().lower()
                for item in self.queue:
                    if q_clean in item["filename"].lower() or q_clean in item["clean_title"].lower():
                        return {
                            "active": True,
                            "streamUrl": item.get("stream_url", ""),
                            "title": item["clean_title"],
                            "name": item["filename"],
                            "stats": item
                        }
            return {
                "active": bool(self.process is not None or self.current_stream_url),
                "streamUrl": self.current_stream_url,
                "title": self.current_title,
                "name": self.stats.get("name", self.current_title),
                "stats": self.stats
            }

    def get_downloads_dashboard_data(self, req_host=None):
        """
        Returns dynamic dashboard data for Download Management:
        - List of all available movies
        - List of currently downloading movies (with status, progress, speed, completion)
        - System status (idle mode, streaming priority, upload seeding status)
        All retrieved dynamically with zero hardcoded entries.
        """
        with self.lock:
            import urllib.parse
            effective_host = req_host or f"{self.host_ip}:{PORT}"
            effective_ip = effective_host.split(':')[0]

            # 1. Discover all available movies (completed on disk)
            available_movies = []
            seen_names = set()

            # Build set of titles/filenames that are actively downloading or incomplete in queue
            incomplete_titles = set()
            if self.process and self.current_torrent:
                is_stream_incomplete = (self.stats.get("progress", 0) < 100) and not self.stats.get("completed", False)
                if is_stream_incomplete:
                    incomplete_titles.add(os.path.basename(self.current_torrent).lower())
                    if self.current_title:
                        incomplete_titles.add(self.current_title.lower())
            if self.active_bg_title:
                incomplete_titles.add(self.active_bg_title.lower())
            for q in self.queue:
                if not q.get("completed", False):
                    incomplete_titles.add(q["filename"].lower())
                    incomplete_titles.add(q["clean_title"].lower())

            # A. Scan DOWNLOADS_DIR for truly completed media files
            if os.path.exists(DOWNLOADS_DIR):
                for root, dirs, files in os.walk(DOWNLOADS_DIR):
                    for f in files:
                        if f.lower().endswith(('.mkv', '.mp4', '.avi', '.mov', '.webm', '.ts')):
                            fp = os.path.join(root, f)
                            done_marker = fp + '.done'
                            root_done_marker = os.path.join(DOWNLOADS_DIR, f + '.done')
                            parent_done = os.path.join(DOWNLOADS_DIR, os.path.basename(root) + '.done')

                            # Check if active or incomplete in queue
                            is_active_incomplete = False
                            f_clean = clean_media_title(f).lower()
                            f_lower = f.lower()
                            for it in incomplete_titles:
                                if it in f_lower or f_lower in it or it in f_clean or f_clean in it:
                                    is_active_incomplete = True
                                    break

                            if is_active_incomplete:
                                continue

                            is_done = os.path.exists(done_marker) or os.path.exists(root_done_marker) or os.path.exists(parent_done)

                            # If no marker, verify completion with matching torrent metadata
                            if not is_done:
                                t_cand = find_torrent_file(f) or find_torrent_file(os.path.basename(root))
                                if t_cand and is_torrent_fully_downloaded(t_cand):
                                    is_done = True

                            if is_done and f not in seen_names:
                                seen_names.add(f)
                                fsize = os.path.getsize(fp)
                                stream_url = f"http://{effective_host}/files/{urllib.parse.quote(f)}"
                                available_movies.append({
                                    "id": "avail-" + hashlib.md5(f.encode()).hexdigest()[:8],
                                    "name": f,
                                    "clean_title": clean_media_title(f),
                                    "size": fsize,
                                    "size_formatted": format_bytes(fsize),
                                    "status": "Completed (Seeding Stopped)",
                                    "progress": 100,
                                    "speed": "0 B/s",
                                    "seeding": "Stopped (0 B/s)",
                                    "completed": True,
                                    "stream_url": stream_url
                                })

            # B. Scan UPLOADS_DIR for standalone video files
            if os.path.exists(UPLOADS_DIR):
                for f in os.listdir(UPLOADS_DIR):
                    if f.lower().endswith(('.mkv', '.mp4', '.avi', '.mov', '.webm', '.ts')) and f not in seen_names:
                        fp = os.path.join(UPLOADS_DIR, f)
                        if os.path.isfile(fp):
                            seen_names.add(f)
                            fsize = os.path.getsize(fp)
                            stream_url = f"http://{effective_host}/files/{urllib.parse.quote(f)}"
                            available_movies.append({
                                "id": "avail-" + hashlib.md5(f.encode()).hexdigest()[:8],
                                "name": f,
                                "clean_title": clean_media_title(f),
                                "size": fsize,
                                "size_formatted": format_bytes(fsize),
                                "status": "Completed (Direct Server Media)",
                                "progress": 100,
                                "speed": "0 B/s",
                                "seeding": "N/A",
                                "completed": True,
                                "stream_url": stream_url
                            })

            available_movies.sort(key=lambda m: m["clean_title"].lower())

            # 2. Currently downloading & queued movies
            currently_downloading = []

            # If Highest Priority stream is active and still downloading:
            if self.process and self.process.poll() is None and self.current_torrent:
                is_stream_incomplete = (self.stats.get("progress", 0) < 100) and not self.stats.get("completed", False)
                if is_stream_incomplete:
                    c_name = os.path.basename(self.current_torrent)
                    currently_downloading.append({
                        "id": "stream-" + hashlib.md5(c_name.encode()).hexdigest()[:8],
                        "name": c_name,
                        "clean_title": self.current_title or clean_media_title(c_name),
                        "priority": "Highest",
                        "priority_badge": "⚡ Highest Priority (Streaming)",
                        "is_active_stream": True,
                        "status": "Downloading & Streaming (Highest Priority)",
                        "progress": self.stats.get("progress", 0),
                        "speed": self.stats.get("speed", "0 B/s"),
                        "upload_speed": self.stats.get("upload_speed", "0 B/s"),
                        "downloaded": self.stats.get("downloaded", "0 B"),
                        "total": self.stats.get("total", "Calculating..."),
                        "peers": self.stats.get("peers", 0),
                        "time_remaining": self.stats.get("timeRemaining", "Calculating..."),
                        "completed": False,
                        "stream_url": self.current_stream_url
                    })

            # Add items from self.queue (excluding active stream)
            for item in self.queue:
                if item.get("completed", False):
                    continue
                if self.current_torrent and (item["torrent_path"] == self.current_torrent or item["filename"] in self.current_torrent):
                    if self.stats.get("progress", 0) >= 100 or self.stats.get("completed", False):
                        continue

                is_active_bg = bool(self.active_bg_proc and self.active_bg_title == item["filename"])
                priority_name = "Normal" if is_active_bg else "Queued"
                priority_badge = "⏳ Normal Priority (Background)" if is_active_bg else "🕒 Queued (Idle Mode)"

                # Compute on-disk downloaded size if queued
                downloaded_str = item.get("downloaded", "0 B")
                total_str = item.get("total", "Calculating...")
                progress_val = item.get("progress", 0)
                if not is_active_bg and progress_val == 0:
                    disk_prog, disk_dl, disk_tot = get_torrent_disk_progress(item["torrent_path"])
                    if disk_prog > 0:
                        progress_val = disk_prog
                        downloaded_str = format_bytes(disk_dl)
                        if disk_tot > 0 and (total_str == "Calculating..." or total_str == "0 B"):
                            total_str = format_bytes(disk_tot)

                currently_downloading.append({
                    "id": item["id"],
                    "name": item["filename"],
                    "clean_title": item["clean_title"],
                    "priority": priority_name,
                    "priority_badge": priority_badge,
                    "is_active_stream": False,
                    "status": item.get("status", "Queued in Background"),
                    "progress": progress_val,
                    "speed": item.get("speed", "0 B/s") if is_active_bg else "0 B/s (Waiting)",
                    "upload_speed": item.get("upload_speed", "0 B/s") if is_active_bg else "0 B/s (Waiting)",
                    "downloaded": downloaded_str,
                    "total": total_str,
                    "peers": item.get("peers", 0) if is_active_bg else 0,
                    "time_remaining": item.get("time_remaining", "In Queue") if is_active_bg else "In Queue",
                    "completed": False,
                    "stream_url": None
                })

            # System mode calculation
            is_stream_downloading = bool(self.process and self.process.poll() is None and self.stats.get("progress", 0) < 100 and not self.stats.get("completed", False))
            if is_stream_downloading:
                system_mode = "streaming_priority"
                mode_label = "Highest Priority Video Streaming Active"
            elif self.active_bg_proc and self.active_bg_proc.poll() is None:
                system_mode = "background_downloading"
                mode_label = "Idle Mode (Auto-Downloading Background Queue)"
            else:
                system_mode = "idle"
                mode_label = "Idle Mode (Monitoring Queue)"

            active_stream_name = None
            if self.process and self.process.poll() is None and self.current_title:
                if is_stream_downloading:
                    active_stream_name = self.current_title
                else:
                    active_stream_name = f"{self.current_title} (Completed - Playing)"

            is_downloading_any = is_stream_downloading or bool(self.active_bg_proc and self.active_bg_proc.poll() is None)
            seeding_status_text = "Active (Tit-for-Tat Peer Sharing; Seeding Stops at 100%)" if is_downloading_any else "Stopped (Zero Upload - BitTorrent Upload Disabled)"

            return {
                "system_status": {
                    "mode": system_mode,
                    "mode_label": mode_label,
                    "active_stream": active_stream_name,
                    "active_bg_download": self.active_bg_title if (self.active_bg_proc and self.active_bg_proc.poll() is None) else None,
                    "total_available": len(available_movies),
                    "total_downloading": len(currently_downloading),
                    "seeding_status": seeding_status_text,
                    "api_endpoint": f"http://{effective_host}/api/downloads",
                    "host_ip": effective_ip,
                    "port": PORT
                },
                "available_movies": available_movies,
                "currently_downloading": currently_downloading
            }

TORRENT_MANAGER = TorrentStreamManager(host_ip=HOST_IP)

# Active clients
WS_CLIENTS_LOCK = threading.Lock()
WS_CLIENTS = []       # list of raw socket objects
SSE_SUBSCRIBERS = []  # list of SSE queues

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

def send_ws_frame(sock, text_payload):
    """Encodes and sends an unmasked RFC 6455 text frame to a WebSocket client."""
    try:
        data = text_payload.encode('utf-8')
        length = len(data)
        if length <= 125:
            header = bytes([0x81, length])
        elif length <= 65535:
            header = struct.pack('!BBH', 0x81, 126, length)
        else:
            header = struct.pack('!BBQ', 0x81, 127, length)
        sock.sendall(header + data)
        return True
    except Exception as e:
        return False

def broadcast_message(msg_dict):
    """Broadcasts a JSON message to all connected TV apps (both WebSocket & SSE)."""
    payload_str = json.dumps(msg_dict)
    
    # 1. Broadcast to WebSockets
    dead_socks = []
    with WS_CLIENTS_LOCK:
        for sock in WS_CLIENTS:
            if not send_ws_frame(sock, payload_str):
                dead_socks.append(sock)
        for ds in dead_socks:
            if ds in WS_CLIENTS:
                WS_CLIENTS.remove(ds)
                
    # 2. Broadcast to SSE
    for sub in list(SSE_SUBSCRIBERS):
        try:
            sub.append(msg_dict)
        except Exception:
            pass

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class FileHubRequestHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Range')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def parse_byte_range(self, range_header, file_size):
        """Parse RFC 7233 Range header into (start, end, length). Returns None if invalid/unspecified."""
        if not range_header:
            return None
        r = range_header.strip()
        if r.startswith('bytes='):
            r = r[6:].strip()
        
        # Suffix range, e.g. bytes=-65536 (last 64KB, critical for MKV SeekHead/Cues)
        if r.startswith('-'):
            try:
                suffix_len = int(r[1:].strip())
                if suffix_len <= 0:
                    return None
                start = max(0, file_size - suffix_len)
                end = file_size - 1
                return (start, end, end - start + 1)
            except ValueError:
                return None
        
        # Standard range: bytes=start-end or bytes=start-
        if '-' in r:
            parts = r.split('-', 1)
            try:
                start = int(parts[0].strip()) if parts[0].strip() else 0
                end = int(parts[1].strip()) if parts[1].strip() else file_size - 1
            except ValueError:
                return None
            
            if start < 0 or start >= file_size or start > end:
                return False # 416 Not Satisfiable
            end = min(end, file_size - 1)
            return (start, end, end - start + 1)
        return None

    def do_HEAD(self):
        path = self.path.split('?')[0]
        norm_path = path.rstrip('/') if path != '/' else '/'

        if norm_path in ('/', '/index.html', '/sender', '/dashboard', '/downloads', '/downloads.html', '/dashboard.html'):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            return

        if path.startswith('/files/') or path.startswith('/stream/') or (path.startswith('/downloads/') and len(path.strip('/')) > len('downloads')):
            import urllib.parse
            filename = urllib.parse.unquote(path.split('/', 2)[-1])
            filepath = find_media_file(filename)
            if filepath and os.path.exists(filepath) and os.path.isfile(filepath):
                file_size = os.path.getsize(filepath)
                content_type = get_mime_type(filepath)
                range_header = self.headers.get('Range')
                parsed_range = self.parse_byte_range(range_header, file_size)

                if parsed_range is False:
                    self.send_response(416, 'Range Not Satisfiable')
                    self.send_header('Content-Range', f'bytes */{file_size}')
                    self.end_headers()
                    return

                if parsed_range:
                    start, end, length = parsed_range
                    self.send_response(206, 'Partial Content')
                    self.send_header('Content-Type', content_type)
                    self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
                    self.send_header('Content-Length', str(length))
                else:
                    self.send_response(200)
                    self.send_header('Content-Type', content_type)
                    self.send_header('Content-Length', str(file_size))

                self.send_header('Accept-Ranges', 'bytes')
                self.send_header('transferMode.dlna.org', 'Streaming')
                # DLNA.ORG_OP=11 explicitly enables BOTH time-seek and byte-range seek for Samsung TV AVPlay!
                self.send_header('contentFeatures.dlna.org', 'DLNA.ORG_OP=11;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000')
                self.end_headers()
                return
            else:
                self.send_error(404, f'File not found: {filename}')
                return
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        path = self.path.split('?')[0]
        norm_path = path.rstrip('/') if path != '/' else '/'

        # 1. WebSocket Upgrade for TV App
        if path == '/ws':
            upgrade_hdr = self.headers.get('Upgrade', '').lower()
            if 'websocket' in upgrade_hdr:
                self.handle_websocket()
                return
            else:
                self.send_error(400, 'Expected WebSocket Upgrade')
                return

        # 2. Web Sender UI
        if norm_path in ('/', '/index.html', '/sender'):
            sender_file = os.path.join(PUBLIC_DIR, 'sender.html')
            if os.path.exists(sender_file):
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                with open(sender_file, 'rb') as f:
                    content = f.read()
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            else:
                self.send_error(404, 'sender.html not found')
            return

        # 2.1. Download Management Dashboard UI (for Mobile & PC Browser)
        elif norm_path in ('/dashboard', '/downloads', '/downloads.html', '/dashboard.html'):
            dash_file = os.path.join(PUBLIC_DIR, 'dashboard.html')
            if os.path.exists(dash_file):
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                with open(dash_file, 'rb') as f:
                    content = f.read()
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            else:
                self.send_error(404, 'dashboard.html not found')
            return

        elif norm_path == '/storage_target':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'target': CURRENT_STORAGE_TARGET}).encode('utf-8'))
            return

        # 3. Static Files & Streaming Downloads
        elif path.startswith('/files/') or path.startswith('/stream/') or (path.startswith('/downloads/') and len(path.strip('/')) > len('downloads')):
            import urllib.parse
            filename = urllib.parse.unquote(path.split('/', 2)[-1])
            filepath = find_media_file(filename)
            if filepath and os.path.exists(filepath) and os.path.isfile(filepath):
                file_size = os.path.getsize(filepath)
                range_header = self.headers.get('Range')
                content_type = get_mime_type(filepath)
                parsed_range = self.parse_byte_range(range_header, file_size)

                if parsed_range is False:
                    self.send_response(416, 'Range Not Satisfiable')
                    self.send_header('Content-Range', f'bytes */{file_size}')
                    self.end_headers()
                    return

                if parsed_range:
                    start, end, length = parsed_range
                    print(f"[HTTP Stream] Range seek '{os.path.basename(filepath)}': bytes={start}-{end}/{file_size} ({length} bytes)")
                    sys.stdout.flush()

                    self.send_response(206, 'Partial Content')
                    self.send_header('Content-Type', content_type)
                    self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
                    self.send_header('Content-Length', str(length))
                    self.send_header('Accept-Ranges', 'bytes')
                    self.send_header('transferMode.dlna.org', 'Streaming')
                    self.send_header('contentFeatures.dlna.org', 'DLNA.ORG_OP=11;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000')
                    self.end_headers()

                    with open(filepath, 'rb') as f:
                        f.seek(start)
                        remaining = length
                        try:
                            while remaining > 0:
                                chunk = f.read(min(remaining, 128 * 1024))
                                if not chunk: break
                                self.wfile.write(chunk)
                                remaining -= len(chunk)
                        except (BrokenPipeError, ConnectionResetError):
                            pass
                else:
                    print(f"[HTTP Stream] Initial stream '{os.path.basename(filepath)}': {file_size} bytes")
                    sys.stdout.flush()
                    self.send_response(200)
                    self.send_header('Content-Type', content_type)
                    self.send_header('Content-Disposition', f'inline; filename="{os.path.basename(filepath)}"')
                    self.send_header('Content-Length', str(file_size))
                    self.send_header('Accept-Ranges', 'bytes')
                    self.send_header('transferMode.dlna.org', 'Streaming')
                    self.send_header('contentFeatures.dlna.org', 'DLNA.ORG_OP=11;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000')
                    self.end_headers()
                    with open(filepath, 'rb') as f:
                        try:
                            while chunk := f.read(128 * 1024):
                                self.wfile.write(chunk)
                        except (BrokenPipeError, ConnectionResetError):
                            pass
            else:
                self.send_error(404, f'File not found: {filename}')
            return

        # 4. Health Check / Status
        elif path == '/status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            data = json.dumps({'status': 'online', 'service': 'Samsung TV File Hub'}).encode('utf-8')
            self.wfile.write(data)
            return

        # 4.5. Download Management Dashboard API
        # Dynamic API for Download Dashboard: available movies, downloading movies, status, progress, speed, completion
        elif norm_path in ('/api/downloads', '/api/queue'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            dashboard_data = TORRENT_MANAGER.get_downloads_dashboard_data(req_host=self.headers.get('Host'))
            self.wfile.write(json.dumps(dashboard_data).encode('utf-8'))
            return

        elif norm_path in ('/api/prioritize', '/prioritize'):
            import urllib.parse
            qs = urllib.parse.parse_qs(self.path.split('?', 1)[1] if '?' in self.path else '')
            fnames = qs.get('file', [])
            target = fnames[0] if fnames else ''
            stream_url = TORRENT_MANAGER.prioritize_torrent(target)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'prioritized', 'streamUrl': stream_url, 'file': target}).encode('utf-8'))
            return

        # 5. Live BitTorrent Streaming Engine APIs (Video Player Integration)
        elif path == '/start_torrent':
            import urllib.parse
            raw_query = self.path.split('?', 1)[1] if '?' in self.path else ''
            qs = urllib.parse.parse_qs(raw_query)
            fnames = qs.get('file', [])
            magnets = qs.get('magnet', [])
            download_only = 'downloadonly=true' in raw_query.lower()

            # Handle unencoded '&' in filename parameter
            if 'file=' in raw_query:
                file_part = raw_query.split('file=', 1)[1]
                file_part = re.split(r'&(?:magnet|downloadOnly)=', file_part, flags=re.I)[0]
                unquoted = urllib.parse.unquote(file_part).strip()
                if unquoted:
                    fnames = [unquoted]

            file_idx_str = qs.get('fileIdx', qs.get('file_idx', [None]))[0]
            file_idx = int(file_idx_str) if (file_idx_str is not None and str(file_idx_str).isdigit()) else None
            episode_param = qs.get('episode', [None])[0]

            if fnames:
                fname = os.path.basename(fnames[0]).strip()
                print(f"[TorrentEngine] /start_torrent requested for: {fname} (downloadOnly={download_only}, file_idx={file_idx}, ep={episode_param})")
                sys.stdout.flush()

                # Check if specific episode is already on disk
                if episode_param:
                    ep_clean = os.path.basename(episode_param)
                    ep_path = find_media_file(ep_clean)
                    if ep_path and os.path.exists(ep_path) and os.path.getsize(ep_path) > 0:
                        import urllib.parse
                        direct_url = f"http://{TORRENT_MANAGER.host_ip}:{PORT}/files/{urllib.parse.quote(os.path.basename(ep_path))}"
                        print(f"[TorrentEngine] Episode '{ep_clean}' directly served from disk: {direct_url}")
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({'status': 'started', 'streamUrl': direct_url, 'filename': ep_clean, 'isDownloaded': True}).encode('utf-8'))
                        return

                # 1. Check if video is already downloaded in DOWNLOADS_DIR for this specific title
                media_path = find_downloaded_video(fname)
                if media_path and not media_path.lower().endswith('.torrent'):
                    if download_only:
                        print(f"[TorrentEngine] (Background) File is ALREADY downloaded: {os.path.basename(media_path)}")
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({'status': 'already_downloaded', 'filename': os.path.basename(media_path), 'downloadOnly': True, 'isDownloaded': True}).encode('utf-8'))
                        return
                    stream_url = TORRENT_MANAGER.start_torrent(media_path, title=os.path.basename(media_path), file_idx=file_idx)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'started', 'streamUrl': stream_url, 'filename': os.path.basename(media_path), 'isDownloaded': True}).encode('utf-8'))
                    return

                # 2. Check for matching torrent file in UPLOADS_DIR
                torrent_path = find_torrent_file(fname)
                if torrent_path and os.path.exists(torrent_path):
                    matched_name = os.path.basename(torrent_path)
                    print(f"[TorrentEngine] Matched torrent file: {matched_name}")
                    sys.stdout.flush()

                    if download_only:
                        print(f"[TorrentEngine] Starting background sequential download (running stream uninterrupted): {matched_name}")
                        sys.stdout.flush()
                        TORRENT_MANAGER.start_background_download(torrent_path, title=matched_name)
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps({'status': 'background_started', 'filename': matched_name, 'downloadOnly': True}).encode('utf-8'))
                        return

                    stream_url = TORRENT_MANAGER.start_torrent(torrent_path, title=matched_name, file_idx=file_idx)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'started', 'streamUrl': stream_url, 'filename': matched_name, 'fileIdx': file_idx}).encode('utf-8'))
                    return
                else:
                    print(f"[TorrentEngine] ERROR: No matching torrent found for '{fname}' in uploads")
                    sys.stdout.flush()
                    self.send_error(404, f'Torrent file not found for: {fname}')
                    return
            elif magnets:
                if download_only:
                    TORRENT_MANAGER.start_background_download(magnets[0], title="Magnet Download")
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'background_started', 'downloadOnly': True}).encode('utf-8'))
                    return
                stream_url = TORRENT_MANAGER.start_torrent(magnets[0], title="Magnet Stream", file_idx=file_idx)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'started', 'streamUrl': stream_url, 'fileIdx': file_idx}).encode('utf-8'))
                return
            else:
                self.send_error(400, 'Missing file or magnet parameter')
                return

        elif path == '/stop_torrent':
            TORRENT_MANAGER.stop()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'stopped'}).encode('utf-8'))
            return

        elif path == '/torrent_stats':
            import urllib.parse
            qs = urllib.parse.parse_qs(self.path.split('?')[1] if '?' in self.path else '')
            file_query = qs.get('file', [''])[0]
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(TORRENT_MANAGER.get_stats(file_query)).encode('utf-8'))
            return

        elif path == '/torrent_files':
            import urllib.parse
            qs = urllib.parse.parse_qs(self.path.split('?')[1] if '?' in self.path else '')
            query = qs.get('file', [''])[0]
            t_path = find_torrent_file(query)
            if not t_path and query:
                cand = os.path.join(UPLOADS_DIR, query)
                if os.path.exists(cand): t_path = cand
            files = parse_torrent_files(t_path) if t_path else []
            resp = {
                "success": bool(files),
                "torrentFile": os.path.basename(t_path) if t_path else query,
                "totalEpisodes": len(files),
                "episodes": files
            }
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(resp).encode('utf-8'))
            return

        elif path == '/media_info':
            import urllib.parse
            qs = urllib.parse.parse_qs(self.path.split('?')[1] if '?' in self.path else '')
            query = qs.get('file', [''])[0]
            tracks = get_media_audio_tracks(query)
            resp = {
                "filename": query,
                "hasMultipleAudio": len(tracks) > 1,
                "audioTracks": tracks
            }
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(resp).encode('utf-8'))
            return

        elif path == '/delete_file':
            import urllib.parse
            qs = urllib.parse.parse_qs(self.path.split('?')[1] if '?' in self.path else '')
            fnames = qs.get('file', [])
            if fnames:
                fname = os.path.basename(fnames[0])
                TORRENT_MANAGER.remove_from_queue(fname)

                up_path = os.path.join(UPLOADS_DIR, fname)
                if os.path.exists(up_path):
                    try: os.remove(up_path)
                    except Exception: pass

                # Also delete associated download and .done markers in DOWNLOADS_DIR
                stem = re.sub(r'\.torrent$', '', fname, flags=re.I)
                for cand_name in (fname, stem, stem + '.mkv', stem + '.mp4'):
                    cand_path = os.path.join(DOWNLOADS_DIR, cand_name)
                    if os.path.exists(cand_path):
                        try:
                            if os.path.isfile(cand_path): os.remove(cand_path)
                            elif os.path.isdir(cand_path): shutil.rmtree(cand_path)
                        except Exception: pass
                    done_marker = cand_path + '.done'
                    if os.path.exists(done_marker):
                        try: os.remove(done_marker)
                        except Exception: pass

                broadcast_message({
                    "type": "file_deleted",
                    "filename": fname
                })

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'deleted', 'filename': fname}).encode('utf-8'))
                return
            else:
                self.send_error(400, 'Missing file parameter')
                return

        # 6. Favicon
        elif path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return

        # 6. Server-Sent Events (SSE) Stream
        elif path == '/events':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.end_headers()
            
            queue = []
            SSE_SUBSCRIBERS.append(queue)
            try:
                self.wfile.write(b"data: {\"type\": \"connected\"}\n\n")
                self.wfile.flush()
                while True:
                    if queue:
                        msg = queue.pop(0)
                        payload = f"data: {json.dumps(msg)}\n\n".encode('utf-8')
                        self.wfile.write(payload)
                        self.wfile.flush()
                    else:
                        time.sleep(0.5)
            except Exception:
                pass
            finally:
                if queue in SSE_SUBSCRIBERS:
                    SSE_SUBSCRIBERS.remove(queue)
            return

        self.send_error(404, 'Not Found')

    def handle_websocket(self):
        """RFC 6455 WebSocket Handshake and Connection Loop."""
        key = self.headers.get('Sec-WebSocket-Key', '').strip()
        if not key:
            self.send_error(400, 'Missing Sec-WebSocket-Key')
            return

        accept_val = base64.b64encode(hashlib.sha1((key + WS_GUID).encode('utf-8')).digest()).decode('utf-8')
        
        # Handshake response
        self.send_response(101, 'Switching Protocols')
        self.send_header('Upgrade', 'websocket')
        self.send_header('Connection', 'Upgrade')
        self.send_header('Sec-WebSocket-Accept', accept_val)
        self.end_headers()

        sock = self.request
        with WS_CLIENTS_LOCK:
            WS_CLIENTS.append(sock)
        
        client_ip = self.client_address[0]
        print(f"[WebSocket] Samsung TV connected from {client_ip}")

        # Send welcome message
        send_ws_frame(sock, json.dumps({'type': 'connected', 'message': 'Samsung TV File Hub Bridge Online'}))

        # If a live BitTorrent stream is currently running, notify the TV of stats (do not trigger auto-play on connect)
        if TORRENT_MANAGER.current_stream_url:
            send_ws_frame(sock, json.dumps({
                'type': 'torrent_stats_update',
                'streamUrl': TORRENT_MANAGER.current_stream_url,
                'title': TORRENT_MANAGER.current_title,
                'stats': TORRENT_MANAGER.stats
            }))

        # Read frames until disconnect
        try:
            while True:
                header = sock.recv(2)
                if not header or len(header) < 2:
                    break
                b1, b2 = header[0], header[1]
                opcode = b1 & 0x0F
                masked = (b2 & 0x80) != 0
                payload_len = b2 & 0x7F

                if opcode == 0x8: # Close frame
                    break
                elif opcode == 0x9: # Ping
                    # Send Pong (0x8A)
                    sock.sendall(bytes([0x8A, 0x00]))
                    continue

                if payload_len == 126:
                    ext = sock.recv(2)
                    payload_len = struct.unpack('!H', ext)[0]
                elif payload_len == 127:
                    ext = sock.recv(8)
                    payload_len = struct.unpack('!Q', ext)[0]

                mask_key = b''
                if masked:
                    mask_key = sock.recv(4)

                payload_data = b''
                while len(payload_data) < payload_len:
                    chunk = sock.recv(min(payload_len - len(payload_data), 4096))
                    if not chunk:
                        break
                    payload_data += chunk

                # Print incoming messages from TV
                if opcode == 0x1: # Text
                    if masked and mask_key:
                        unmasked = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload_data))
                    else:
                        unmasked = payload_data
                    try:
                        tv_text = unmasked.decode('utf-8', errors='ignore')
                        print(f"  [TV LOG] {tv_text}")
                        sys.stdout.flush()
                        # Parse JSON commands from TV
                        try:
                            cmd_data = json.loads(tv_text)
                            if isinstance(cmd_data, dict):
                                ctype = cmd_data.get('type')
                                if ctype == 'start_torrent':
                                    fname = cmd_data.get('filename')
                                    magnet = cmd_data.get('magnet')
                                    if fname:
                                        t_path = find_torrent_file(fname)
                                        if t_path and os.path.exists(t_path):
                                            TORRENT_MANAGER.start_torrent(t_path, title=os.path.basename(t_path))
                                    elif magnet:
                                        TORRENT_MANAGER.start_torrent(magnet, title="Magnet Stream")
                                elif ctype == 'stop_torrent':
                                    TORRENT_MANAGER.stop()
                                elif ctype == 'storage_mode_changed':
                                    mode = cmd_data.get('mode', 'usb')
                                    global CURRENT_STORAGE_TARGET
                                    if mode == 'server':
                                        CURRENT_STORAGE_TARGET = 'Server (Pi / Zero TV Memory)'
                                    elif mode in ('local', 'internal'):
                                        CURRENT_STORAGE_TARGET = 'Local Storage (TV Flash)'
                                    else:
                                        CURRENT_STORAGE_TARGET = 'USB Drive'
                                    print(f"  [STORAGE TARGET] Updated to: {CURRENT_STORAGE_TARGET}")
                                    broadcast_ws_message({
                                        'type': 'storage_target_update',
                                        'target': CURRENT_STORAGE_TARGET
                                    })
                        except Exception:
                            pass
                    except Exception as e:
                        pass

        except Exception as e:
            pass
        finally:
            with WS_CLIENTS_LOCK:
                if sock in WS_CLIENTS:
                    WS_CLIENTS.remove(sock)
            print(f"[WebSocket] Samsung TV disconnected from {client_ip}")

    def do_POST(self):
        if self.path == '/upload':
            try:
                content_type = self.headers.get('Content-Type')
                if not content_type or 'multipart/form-data' not in content_type:
                    self.send_error(400, 'Content-Type must be multipart/form-data')
                    return

                # Parse multipart upload
                form = cgi.FieldStorage(
                    fp=self.rfile,
                    headers=self.headers,
                    environ={'REQUEST_METHOD': 'POST', 'CONTENT_TYPE': content_type}
                )

                if 'file' not in form:
                    self.send_error(400, 'Missing "file" field')
                    return

                file_item = form['file']
                filename = os.path.basename(file_item.filename or f'upload_{uuid.uuid4().hex[:8]}')
                filepath = os.path.join(UPLOADS_DIR, filename)

                file_id = uuid.uuid4().hex[:12]
                print(f"[Upload] Receiving '{filename}'...")

                # Notify TV immediately that an upload has begun
                broadcast_message({
                    'type': 'file_upload_start',
                    'fileId': file_id,
                    'filename': filename,
                    'totalBytes': 0
                })

                # Save file to disk
                file_size = 0
                with open(filepath, 'wb') as f:
                    while chunk := file_item.file.read(64 * 1024):
                        f.write(chunk)
                        file_size += len(chunk)

                print(f"[Upload] Finished '{filename}' ({file_size} bytes)")

                # Background Torrent Download Management:
                # When a torrent file is received, start downloading it in the background on the Raspberry Pi,
                # even if the TV is offline or disconnected.
                if filename.lower().endswith('.torrent'):
                    print(f"[Queue] Received torrent file '{filename}'. Enqueuing autonomous background download on Raspberry Pi.")
                    TORRENT_MANAGER.enqueue_torrent(filepath, filename=filename, high_priority=False)

                # Broadcast notification to connected TV apps
                import urllib.parse
                event_msg = {
                    'type': 'file_upload_complete',
                    'fileId': file_id,
                    'filename': filename,
                    'totalBytes': file_size,
                    'downloadUrl': f'/files/{urllib.parse.quote(filename)}'
                }
                broadcast_message(event_msg)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                res = json.dumps({'ok': True, 'filename': filename, 'size': file_size}).encode('utf-8')
                self.wfile.write(res)
            except Exception as e:
                print(f"[Upload Error] {e}", file=sys.stderr)
                self.send_error(500, f'Upload failed: {str(e)}')
            return

        self.send_error(404, 'Not Found')

def run_server(port=PORT):
    bind_target = BIND_IP if BIND_IP else '0.0.0.0'
    try:
        server = ThreadedHTTPServer((bind_target, port), FileHubRequestHandler)
    except OSError as e:
        if bind_target == '0.0.0.0':
            print(f"[Server] 0.0.0.0:{port} busy/unavailable ({e}), binding to {HOST_IP}:{port} instead...")
            server = ThreadedHTTPServer((HOST_IP, port), FileHubRequestHandler)
            bind_target = HOST_IP
        else:
            raise
    print(f"================================================================")
    print(f" Samsung TV File Hub - Companion Transfer Bridge")
    print(f" Bound Interface:       {bind_target}:{port}")
    print(f" Web Sender running at: http://localhost:{port}/")
    print(f" Network Sender URL:    http://{HOST_IP}:{port}/")
    print(f" Torrent Stream Port:   {TORRENT_STREAM_PORT}")
    print(f" Storage Directory:     {UPLOADS_DIR}")
    print(f"================================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        server.server_close()

if __name__ == '__main__':
    run_server()
