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
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

PORT = 8080
TORRENT_STREAM_PORT = 8889
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')
UPLOADS_DIR = os.path.join(BASE_DIR, 'uploads')
DOWNLOADS_DIR = os.path.join(BASE_DIR, 'downloads')

os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(PUBLIC_DIR, exist_ok=True)
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

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

    # 3. Movie title keyword match, e.g. "DC", "Scene", "Sandakari", "Jailer 2"
    m = re.search(r'-\s*([A-Za-z0-9\s]+?)\s*\((\d{4})\)', clean)
    if m:
        keyword = m.group(1).strip().lower()
        year = m.group(2)
        for f in torrents:
            if keyword in f.lower() and year in f:
                return os.path.join(UPLOADS_DIR, f)

    # 4. Fallback search by any distinct movie title word
    words = [w for w in re.split(r'[^a-zA-Z0-9]+', stem_lower) if len(w) >= 3 and w not in (
        'tamil', 'hindi', 'telugu', '1080p', '720p', 'hevc', 'x264', 'x265', 'true',
        'web', 'dl', 'hdts', 'hdrip', 'atmos', 'esub', 'clean', 'www', '1tamilmv', 'insure', 'meme', 'torrent')]
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

def find_downloaded_video(filename_or_query):
    """Finds a truly 100% completed video file matching a torrent in DOWNLOADS_DIR.
    A BitTorrent download is ONLY considered 100% complete if its .done marker exists,
    because BitTorrent clients pre-allocate the full file size on disk."""
    if not filename_or_query:
        return None

    # 1. Match the specific torrent first
    t_path = find_torrent_file(filename_or_query)
    if t_path and os.path.exists(t_path):
        exp_name, exp_size = get_torrent_main_file_info(t_path)
        if exp_name:
            cand = os.path.join(DOWNLOADS_DIR, exp_name)
            done_marker = cand + '.done'
            if os.path.exists(cand) and os.path.isfile(cand):
                if os.path.exists(done_marker):
                    return cand
                else:
                    print(f"[TorrentEngine] '{exp_name}' exists on disk but has no .done marker. Running live sequential torrent engine.")
                    sys.stdout.flush()
                    return None

    # 2. Direct exact stem matching in DOWNLOADS_DIR
    clean_target = os.path.basename(filename_or_query).strip()
    stem = re.sub(r'\.torrent$', '', clean_target, flags=re.IGNORECASE).strip()
    p = os.path.join(DOWNLOADS_DIR, stem)
    if os.path.exists(p) and os.path.isfile(p) and not p.lower().endswith('.torrent'):
        t_matching = find_torrent_file(stem)
        if t_matching:
            if os.path.exists(p + '.done'):
                return p
            return None
        return p

    return None


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
                    url = f"http://192.168.0.13:{PORT}/files/{urllib.parse.quote(file_name)}" if is_downloaded else f"http://192.168.0.13:8889/{idx}"
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
                url = f"http://192.168.0.13:{PORT}/files/{urllib.parse.quote(name)}" if is_downloaded else f"http://192.168.0.13:8889/0"
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


class TorrentStreamManager:
    def __init__(self, host_ip="192.168.0.13"):
        self.host_ip = host_ip
        self.process = None
        self.current_stream_url = None
        self.current_title = ""
        self.current_torrent = None
        self.bg_downloads = {} # clean_title -> { proc, torrent, title, stats }
        self.lock = threading.Lock()
        self.stats = {
            "speed": "0 KB/s",
            "downloaded": "0 MB",
            "total": "0 GB",
            "peers": 0,
            "timeRemaining": ""
        }

    def start_torrent(self, torrent_path_or_magnet, title=None, file_idx=None):
        with self.lock:
            clean_title = title or os.path.basename(torrent_path_or_magnet)
            
            # Check if video is ALREADY in DOWNLOADS_DIR
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
                    "speed": "Completed",
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

            if self.process and self.current_torrent == torrent_path_or_magnet:
                target_url = f"http://{self.host_ip}:{TORRENT_STREAM_PORT}/{file_idx}" if file_idx is not None else self.current_stream_url
                if self.current_stream_url:
                    broadcast_message({
                        "type": "torrent_stream_started",
                        "streamUrl": target_url or self.current_stream_url,
                        "title": clean_title
                    })
                    return target_url or self.current_stream_url

            self.stop()
            self.current_torrent = torrent_path_or_magnet
            self.current_title = clean_title
            self.current_stream_url = None
            self.stats = {
                "speed": "0 KB/s",
                "downloaded": "0 MB",
                "total": "0 GB",
                "peers": 0,
                "timeRemaining": "connecting..."
            }

            cmd = ["node", os.path.join(BASE_DIR, "torrent_engine.mjs"), torrent_path_or_magnet]
            if file_idx is not None:
                cmd.append(f"--file-idx={file_idx}")
            print(f"[TorrentEngine] Starting sequential download & stream for: {clean_title} (file_idx={file_idx})")

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

                elif line_str.startswith("[ENGINE_STATS]"):
                    payload = line_str.replace("[ENGINE_STATS]", "").strip()
                    try:
                        st = json.loads(payload)
                        self.stats = {
                            "name": st.get("name", self.current_title),
                            "title": self.current_title,
                            "speed": st.get("downloadSpeed", "0 B/s"),
                            "downloaded": st.get("downloaded", "0 B"),
                            "total": st.get("total", "0 B"),
                            "peers": st.get("peers", 0),
                            "progress": st.get("progress", 0),
                            "timeRemaining": st.get("timeRemaining", ""),
                            "status": st.get("status", "Active")
                        }
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
            out = subprocess.check_output("netstat -ano", shell=True, text=True)
            for line in out.splitlines():
                if ':8889 ' in line and ('LISTENING' in line or 'ESTABLISHED' in line):
                    parts = line.strip().split()
                    pid = parts[-1]
                    if pid.isdigit() and int(pid) != os.getpid():
                        subprocess.run(f"taskkill /F /PID {pid}", shell=True, capture_output=True)
        except Exception:
            pass

    def start_background_download(self, torrent_path_or_magnet, title=None):
        with self.lock:
            clean_title = title or os.path.basename(torrent_path_or_magnet)
            
            # Check if video is ALREADY in DOWNLOADS_DIR with .done marker
            downloaded = find_downloaded_video(clean_title)
            if downloaded and not downloaded.lower().endswith('.torrent'):
                v_name = os.path.basename(downloaded)
                v_size = os.path.getsize(downloaded)
                print(f"[TorrentEngine] (Background) '{clean_title}' is ALREADY 100% DOWNLOADED at: {downloaded}")
                broadcast_message({
                    "type": "torrent_stats_update",
                    "name": v_name,
                    "title": v_name,
                    "speed": "Completed",
                    "downloaded": format_bytes(v_size),
                    "total": format_bytes(v_size),
                    "peers": 0,
                    "progress": 100,
                    "timeRemaining": "0s",
                    "status": "Downloaded 100% (Ready to Stream)"
                })
                return True

            # If this torrent is ALREADY running as active stream in self.process:
            if self.process and self.current_torrent == torrent_path_or_magnet:
                print(f"[TorrentEngine] (Background) Torrent '{clean_title}' is already active stream.")
                return True

            # If already running as background download:
            if clean_title in self.bg_downloads:
                existing = self.bg_downloads[clean_title]
                if existing.get("proc") and existing["proc"].poll() is None:
                    print(f"[TorrentEngine] (Background) Download already active for: {clean_title}")
                    return True

            cmd = ["node", os.path.join(BASE_DIR, "torrent_engine.mjs"), torrent_path_or_magnet, "--download-only"]
            print(f"[TorrentEngine] Starting background sequential download for: {clean_title}")
            try:
                proc = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    cwd=BASE_DIR
                )
                self.bg_downloads[clean_title] = {
                    "proc": proc,
                    "torrent": torrent_path_or_magnet,
                    "title": clean_title,
                    "stats": {
                        "name": clean_title,
                        "title": clean_title,
                        "speed": "Connecting...",
                        "downloaded": "0 MB",
                        "total": "...",
                        "peers": 0,
                        "progress": 1,
                        "timeRemaining": "connecting...",
                        "status": "Background Downloading..."
                    }
                }
                threading.Thread(target=self._monitor_bg_download, args=(proc, clean_title), daemon=True).start()
                return True
            except Exception as e:
                print(f"[TorrentEngine] Error starting background download for {clean_title}: {e}")
                return False

    def _monitor_bg_download(self, proc, clean_title):
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
                    print(f"[TorrentEngine] (Background) 100% Download completed: {v_name}")
                    broadcast_message({
                        "type": "torrent_stats_update",
                        "name": v_name,
                        "title": clean_title,
                        "speed": "Completed",
                        "peers": 0,
                        "progress": 100,
                        "timeRemaining": "0s",
                        "status": "Downloaded 100% (Ready to Stream)"
                    })

                elif line_str.startswith("[ENGINE_STATS]"):
                    payload = line_str.replace("[ENGINE_STATS]", "").strip()
                    try:
                        st = json.loads(payload)
                        st_name = st.get("name", clean_title)
                        stats_obj = {
                            "name": st_name,
                            "title": clean_title,
                            "speed": st.get("downloadSpeed", "0 B/s"),
                            "downloaded": st.get("downloaded", "0 B"),
                            "total": st.get("total", "0 B"),
                            "peers": st.get("peers", 0),
                            "progress": st.get("progress", 0),
                            "timeRemaining": st.get("timeRemaining", ""),
                            "status": st.get("status", "Active")
                        }
                        if clean_title in self.bg_downloads:
                            self.bg_downloads[clean_title]["stats"] = stats_obj
                        broadcast_message({
                            "type": "torrent_stats_update",
                            "name": stats_obj["name"],
                            "title": clean_title,
                            "speed": stats_obj["speed"],
                            "downloaded": stats_obj["downloaded"],
                            "total": stats_obj["total"],
                            "peers": stats_obj["peers"],
                            "progress": stats_obj["progress"],
                            "timeRemaining": stats_obj["timeRemaining"],
                            "status": stats_obj["status"]
                        })
                    except Exception:
                        pass
                else:
                    if line_str:
                        print(f"[TorrentEngineBg:{clean_title[:15]}] {line_str}")
            except Exception:
                break

    def stop(self):
        if self.process:
            try:
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(self.process.pid)], capture_output=True)
            except Exception:
                try: self.process.terminate()
                except Exception: pass
            self.process = None
        self._kill_port_8889()

    def get_stats(self, query=None):
        with self.lock:
            if query:
                q_clean = query.strip().lower()
                for title, bg in self.bg_downloads.items():
                    bg_name = bg.get("stats", {}).get("name", title).lower()
                    if q_clean in title.lower() or title.lower() in q_clean or q_clean in bg_name:
                        return {
                            "active": True,
                            "streamUrl": "",
                            "title": title,
                            "name": bg.get("stats", {}).get("name", title),
                            "stats": bg.get("stats", {})
                        }
            return {
                "active": bool(self.process is not None or self.current_stream_url),
                "streamUrl": self.current_stream_url,
                "title": self.current_title,
                "name": self.stats.get("name", self.current_title),
                "stats": self.stats
            }

TORRENT_MANAGER = TorrentStreamManager(host_ip="192.168.0.13")

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
        if path.startswith('/files/') or path.startswith('/downloads/') or path.startswith('/stream/'):
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
        if path in ('/', '/index.html', '/sender'):
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

        # 3. Static Files & Streaming Downloads
        elif path.startswith('/files/') or path.startswith('/downloads/') or path.startswith('/stream/'):
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
                if TORRENT_MANAGER.current_torrent and fname in TORRENT_MANAGER.current_torrent:
                    TORRENT_MANAGER.stop()
                if fname in TORRENT_MANAGER.bg_downloads:
                    bg_entry = TORRENT_MANAGER.bg_downloads.pop(fname, None)
                    if bg_entry and bg_entry.get("proc"):
                        try:
                            subprocess.run(["taskkill", "/F", "/T", "/PID", str(bg_entry["proc"].pid)], capture_output=True)
                        except Exception:
                            try: bg_entry["proc"].terminate()
                            except Exception: pass
                
                up_path = os.path.join(UPLOADS_DIR, fname)
                if os.path.exists(up_path):
                    try: os.remove(up_path)
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
    server = ThreadedHTTPServer(('0.0.0.0', port), FileHubRequestHandler)
    print(f"================================================================")
    print(f" Samsung TV File Hub - Companion Transfer Bridge")
    print(f" Web Sender running at: http://localhost:{port}/")
    print(f" Network Sender URL:    http://192.168.0.13:{port}/")
    print(f" Storage Directory:     {UPLOADS_DIR}")
    print(f"================================================================")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        server.server_close()

if __name__ == '__main__':
    run_server()
