import WebTorrent from 'webtorrent';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const torrentInput = process.argv[2] || path.join(__dirname, 'uploads', 'www.1TamilMV.io - Jailer 2 (2026) Tamil HQ HDRip - 1080p - HEVC - x265 - (AAC 2.0) - 1.7GB - HC-ESub.mkv.torrent');
const downloadDir = path.join(__dirname, 'downloads');

console.log('[TorrentEngine] Initializing WebTorrent for:', torrentInput);

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

    // Pick largest video file
    let fileIdx = 0;
    let maxSize = 0;
    torrent.files.forEach((f, idx) => {
        console.log(`[TorrentEngine] File #${idx}: ${f.name} (${formatBytes(f.length)})`);
        if (f.length > maxSize) {
            maxSize = f.length;
            fileIdx = idx;
        }
    });

    const targetFile = torrent.files[fileIdx];
    const mimeType = targetFile.name.endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4';

    const server = http.createServer((req, res) => {
        const total = targetFile.length;
        const range = req.headers.range;

        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('transferMode.dlna.org', 'Streaming');
        res.setHeader('contentFeatures.dlna.org', 'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000');

        if (req.method === 'HEAD') {
            res.writeHead(200, {
                'Content-Length': total,
                'Content-Type': mimeType
            });
            res.end();
            return;
        }

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
            const chunksize = (end - start) + 1;

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${total}`,
                'Content-Length': chunksize,
                'Content-Type': mimeType
            });

            const stream = targetFile.createReadStream({ start, end });
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
            const stream = targetFile.createReadStream();
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
    server.listen(port, '0.0.0.0', () => {
        const streamUrl = `http://192.168.0.13:${port}/`;
        console.log(`[ENGINE_STREAM_URL] ${streamUrl}`);
    });

    torrent.on('done', () => {
        console.log(`[ENGINE_DONE] ${torrent.name}`);
        console.log(`[ENGINE_DOWNLOADED_FILE] ${targetFile.name}`);
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
