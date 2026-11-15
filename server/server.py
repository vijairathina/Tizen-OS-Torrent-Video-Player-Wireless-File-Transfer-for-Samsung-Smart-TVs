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

    return None

def find_downloaded_video(filename_or_query):
    """Finds a 100% completed video file matching a torrent or query in DOWNLOADS_DIR."""
    if not filename_or_query:
        return None

    clean_target = os.path.basename(filename_or_query).strip()
    stem = re.sub(r'\.torrent$', '', clean_target, flags=re.IGNORECASE).strip()
    stem_clean = re.sub(r'\s*\(\d+\)$', '', stem, flags=re.IGNORECASE).strip()
    stem_lower = stem_clean.lower()

    # 1. Direct stem match in DOWNLOADS_DIR
    p = os.path.join(DOWNLOADS_DIR, stem)
    if os.path.exists(p) and os.path.isfile(p) and not p.lower().endswith('.torrent'):
        return p

    p = os.path.join(DOWNLOADS_DIR, stem_clean)
    if os.path.exists(p) and os.path.isfile(p) and not p.lower().endswith('.torrent'):
        return p

    # 2. Search DOWNLOADS_DIR recursively for matching video files
    for root, dirs, files in os.walk(DOWNLOADS_DIR):
        for f in files:
            f_lower = f.lower()
            if any(f_lower.endswith(ext) for ext in ('.mkv', '.mp4', '.avi', '.webm', '.mov', '.ts')):
                if f_lower == stem_lower or (stem_lower and (stem_lower in f_lower or f_lower in stem_lower)):
                    return os.path.join(root, f)

    return None

class TorrentStreamManager:
    def __init__(self, host_ip="192.168.0.13"):
        self.host_ip = host_ip
        self.process = None
        self.current_stream_url = None
        self.current_title = ""
        self.current_torrent = None
        self.lock = threading.Lock()
        self.stats = {
            "speed": "0 KB/s",
            "downloaded": "0 MB",
            "total": "0 GB",
            "peers": 0,
            "timeRemaining": ""
        }

    def start_torrent(self, torrent_path_or_magnet, title=None):
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
                if self.current_stream_url:
                    broadcast_message({
                        "type": "torrent_stream_started",
                        "streamUrl": self.current_stream_url,
                        "title": clean_title
                    })
                    return self.current_stream_url

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
            print(f"[TorrentEngine] Starting sequential download & stream for: {clean_title}")

            try:
                self.process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    cwd=BASE_DIR
                )
                self.current_stream_url = f"http://{self.host_ip}:{TORRENT_STREAM_PORT}/"
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

    def stop(self):
        if self.process:
            try:
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(self.process.pid)], capture_output=True)
            except Exception:
                try: self.process.terminate()
                except Exception: pass
            self.process = None
        self._kill_port_8889()

    def get_stats(self):
        # Auto-discover completed downloaded media if streamUrl is not set
        if not self.current_stream_url:
            import urllib.parse
            for root, dirs, files in os.walk(DOWNLOADS_DIR):
                for f in files:
                    if any(f.lower().endswith(ext) for ext in ('.mkv', '.mp4', '.avi', '.webm')):
                        f_path = os.path.join(root, f)
                        v_size = os.path.getsize(f_path)
                        encoded = urllib.parse.quote(f)
                        self.current_stream_url = f"http://{self.host_ip}:{PORT}/files/{encoded}"
                        self.current_title = f
                        self.stats = {
                            "speed": "Completed",
                            "downloaded": format_bytes(v_size),
                            "total": format_bytes(v_size),
                            "peers": 0,
                            "progress": 100,
                            "timeRemaining": "0s",
                            "status": "Downloaded 100% (Ready to Stream)"
                        }
                        break
                if self.current_stream_url:
                    break

        return {
            "active": bool(self.process is not None or self.current_stream_url),
            "streamUrl": self.current_stream_url,
            "title": self.current_title,
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
            qs = urllib.parse.parse_qs(self.path.split('?')[1] if '?' in self.path else '')
            fnames = qs.get('file', [])
            magnets = qs.get('magnet', [])
            if fnames:
                fname = os.path.basename(fnames[0])
                
                # Check if video is already downloaded in DOWNLOADS_DIR
                media_path = find_downloaded_video(fname)
                if media_path and not media_path.lower().endswith('.torrent'):
                    stream_url = TORRENT_MANAGER.start_torrent(media_path, title=os.path.basename(media_path))
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'started', 'streamUrl': stream_url, 'filename': os.path.basename(media_path), 'isDownloaded': True}).encode('utf-8'))
                    return

                # Otherwise check for torrent file to start WebTorrent engine
                fpath = os.path.join(UPLOADS_DIR, fname)
                if not os.path.exists(fpath):
                    clean_fname = re.sub(r'\s*\(\d+\)\.torrent$', '.torrent', fname, flags=re.IGNORECASE)
                    alt_path = os.path.join(UPLOADS_DIR, clean_fname)
                    if os.path.exists(alt_path):
                        fpath = alt_path
                        fname = clean_fname

                if not os.path.exists(fpath):
                    lower_target = fname.lower()
                    for f in os.listdir(UPLOADS_DIR):
                        if f.lower() == lower_target or (f.lower().endswith('.torrent') and ('jailer' in lower_target and 'jailer' in f.lower())):
                            fpath = os.path.join(UPLOADS_DIR, f)
                            fname = f
                            break

                if not os.path.exists(fpath):
                    torrents = [f for f in os.listdir(UPLOADS_DIR) if f.lower().endswith('.torrent')]
                    if torrents:
                        fpath = os.path.join(UPLOADS_DIR, torrents[0])
                        fname = torrents[0]

                if os.path.exists(fpath):
                    stream_url = TORRENT_MANAGER.start_torrent(fpath, title=fname)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({'status': 'started', 'streamUrl': stream_url, 'filename': fname}).encode('utf-8'))
                    return
                else:
                    # Final check: is there ANY video file in DOWNLOADS_DIR we can serve?
                    for root, dirs, files in os.walk(DOWNLOADS_DIR):
                        for f in files:
                            if any(f.lower().endswith(ext) for ext in ('.mkv', '.mp4', '.avi', '.webm')):
                                f_path = os.path.join(root, f)
                                stream_url = TORRENT_MANAGER.start_torrent(f_path, title=f)
                                self.send_response(200)
                                self.send_header('Content-Type', 'application/json')
                                self.end_headers()
                                self.wfile.write(json.dumps({'status': 'started', 'streamUrl': stream_url, 'filename': f, 'isDownloaded': True}).encode('utf-8'))
                                return

                    self.send_error(404, f'Torrent or video file not found: {fname}')
                    return
            elif magnets:
                stream_url = TORRENT_MANAGER.start_torrent(magnets[0], title="Magnet Stream")
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'started', 'streamUrl': stream_url}).encode('utf-8'))
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
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(TORRENT_MANAGER.get_stats()).encode('utf-8'))
            return

        elif path == '/delete_file':
            import urllib.parse
            qs = urllib.parse.parse_qs(self.path.split('?')[1] if '?' in self.path else '')
            fnames = qs.get('file', [])
            if fnames:
                fname = os.path.basename(fnames[0])
                if TORRENT_MANAGER.current_torrent and fname in TORRENT_MANAGER.current_torrent:
                    TORRENT_MANAGER.stop()
                
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
                                        fpath = os.path.join(UPLOADS_DIR, fname)
                                        if os.path.exists(fpath):
                                            TORRENT_MANAGER.start_torrent(fpath, title=fname)
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
