import WebTorrent from 'webtorrent';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDownloadOnly = process.argv.includes('--download-only');
const torrentArgs = process.argv.slice(2).filter(a => a !== '--download-only');
const torrentInput = torrentArgs[0] || path.join(__dirname, 'uploads', 'www.1TamilMV.io - Jailer 2 (2026) Tamil HQ HDRip - 1080p - HEVC - x265 - (AAC 2.0) - 1.7GB - HC-ESub.mkv.torrent');
const downloadDir = path.join(__dirname, 'downloads');

console.log('[TorrentEngine] Initializing WebTorrent (downloadOnly=' + isDownloadOnly + ') for:', torrentInput);

const client = new WebTorrent();

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

client.add(torrentInput, { path: downloadDir }, torrent => {
    console.log('[TorrentEngine] Torrent ready:', torrent.name);

    // Parse optional target file index from command-line argument: --file-idx=N
    let targetFileIdx = -1;
    const fileIdxArg = process.argv.find(a => a.startsWith('--file-idx='));
    if (fileIdxArg) {
        targetFileIdx = parseInt(fileIdxArg.split('=')[1], 10);
    }

    // Default to largest video file if no index specified
    let fileIdx = 0;
    let maxSize = 0;
    torrent.files.forEach((f, idx) => {
        console.log(`[TorrentEngine] File #${idx}: ${f.name} (${formatBytes(f.length)})`);
        if (f.length > maxSize) {
            maxSize = f.length;
            fileIdx = idx;
        }
    });

    if (targetFileIdx >= 0 && targetFileIdx < torrent.files.length) {
        fileIdx = targetFileIdx;
        console.log(`[TorrentEngine] Targeted specific file #${fileIdx}: ${torrent.files[fileIdx].name}`);
    }

    const targetFile = torrent.files[fileIdx];

    // Log structured file list for companion server episode discovery
    const filesMeta = torrent.files.map((f, idx) => ({
        index: idx,
        name: f.name,
        length: f.length,
        path: f.path,
        isVideo: /\.(mkv|mp4|avi|mov|webm|ts)$/i.test(f.name)
    }));
    console.log(`[ENGINE_FILES] ${JSON.stringify(filesMeta)}`);

    if (!isDownloadOnly) {
        const server = http.createServer((req, res) => {
            // Determine active file for this HTTP request (allows streaming any episode via /<index> or ?file=<index>)
            let reqFile = targetFile;
            try {
                const u = new URL(req.url, 'http://127.0.0.1:8889');
                let reqIdx = -1;
                if (u.searchParams.has('file')) {
                    reqIdx = parseInt(u.searchParams.get('file'), 10);
                } else {
                    const m = u.pathname.match(/^\/(\d+)/);
                    if (m) reqIdx = parseInt(m[1], 10);
                }
                if (reqIdx >= 0 && reqIdx < torrent.files.length) {
                    reqFile = torrent.files[reqIdx];
                }
            } catch (e) {}

            const total = reqFile.length;
            const mimeType = reqFile.name.endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4';
            const range = req.headers.range;

            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('transferMode.dlna.org', 'Streaming');
            res.setHeader('contentFeatures.dlna.org', 'DLNA.ORG_OP=11;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000');

            if (req.method === 'HEAD') {
                res.writeHead(200, {
                    'Content-Length': total,
                    'Content-Type': mimeType
                });
                res.end();
                return;
            }

            if (range) {
                const rStr = range.replace(/bytes=/, '').trim();
                let start = 0;
                let end = total - 1;

                if (rStr.startsWith('-')) {
                    // Suffix range: bytes=-65536
                    const suffix = parseInt(rStr.slice(1).trim(), 10) || 0;
                    start = Math.max(0, total - suffix);
                    end = total - 1;
                } else if (rStr.includes('-')) {
                    const parts = rStr.split('-');
                    start = parseInt(parts[0].trim(), 10) || 0;
                    end = parts[1] && parts[1].trim() ? parseInt(parts[1].trim(), 10) : total - 1;
                }

                start = Math.max(0, Math.min(start, total - 1));
                end = Math.max(start, Math.min(end, total - 1));
                const chunksize = (end - start) + 1;

                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${total}`,
                    'Content-Length': chunksize,
                    'Content-Type': mimeType
                });

                const stream = reqFile.createReadStream({ start, end });
                stream.on('error', err => {
                    console.warn('[TorrentEngine] Stream range error:', err);
                    try { res.end(); } catch (e) {}
                });
                res.on('close', () => {
                    try { stream.destroy(); } catch (e) {}
                });
                stream.pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Length': total,
                    'Content-Type': mimeType
                });
                const stream = reqFile.createReadStream();
                stream.on('error', err => {
                    console.warn('[TorrentEngine] Stream full error:', err);
                    try { res.end(); } catch (e) {}
                });
                res.on('close', () => {
                    try { stream.destroy(); } catch (e) {}
                });
                stream.pipe(res);
            }
        });

        const port = 8889;
        server.on('error', err => {
            console.error('[TorrentEngine] HTTP server error:', err.message);
        });
        server.listen(port, '0.0.0.0', () => {
            const streamUrl = `http://192.168.0.13:${port}/${fileIdx}`;
            console.log(`[ENGINE_STREAM_URL] ${streamUrl}`);
        });
    } else {
        console.log(`[ENGINE_BG_DOWNLOAD] Background sequential downloading active for: ${torrent.name}`);
    }

    torrent.on('done', () => {
        console.log(`[ENGINE_DONE] ${torrent.name}`);
        // Mark all video files as done
        torrent.files.forEach(f => {
            if (/\.(mkv|mp4|avi|mov|webm|ts)$/i.test(f.name)) {
                console.log(`[ENGINE_DOWNLOADED_FILE] ${f.name}`);
                try {
                    const markerPath = path.join(downloadDir, `${f.name}.done`);
                    fs.writeFileSync(markerPath, '1', 'utf-8');
                } catch (e) {}
            }
        });
    });

    setInterval(() => {
        const stats = {
            name: torrent.name,
            progress: Math.floor(torrent.progress * 100),
            downloadSpeed: formatBytes(torrent.downloadSpeed) + '/s',
            uploadSpeed: formatBytes(torrent.uploadSpeed) + '/s',
            downloaded: formatBytes(torrent.downloaded),
            total: formatBytes(torrent.length),
            peers: torrent.numPeers,
            timeRemaining: torrent.timeRemaining ? Math.round(torrent.timeRemaining / 1000) + 's' : '0s',
            status: torrent.done ? 'Downloaded 100% (Ready to Stream)' : (torrent.numPeers > 0 ? 'Downloading & Streaming' : 'Connecting to Peers...')
        };
        console.log(`[ENGINE_STATS] ${JSON.stringify(stats)}`);
    }, 1000);
});

client.on('error', err => {
    console.error('[TorrentEngine] WebTorrent error:', err);
});
