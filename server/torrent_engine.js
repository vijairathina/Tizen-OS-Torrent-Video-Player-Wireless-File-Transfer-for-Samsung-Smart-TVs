const WebTorrent = require('webtorrent');
const path = require('path');

const client = new WebTorrent();
const torrentInput = process.argv[2];
if (!torrentInput) {
    console.error('[TorrentEngine] Error: No torrent file or magnet link provided.');
    process.exit(1);
}
const downloadDir = path.join(__dirname, 'downloads');

console.log('[TorrentEngine] Adding torrent:', torrentInput);

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

client.add(torrentInput, { path: downloadDir }, torrent => {
    console.log('[TorrentEngine] Torrent parsed:', torrent.name);

    // Find largest video file inside torrent
    let fileIdx = 0;
    let maxSize = 0;
    torrent.files.forEach((f, idx) => {
        console.log(`[TorrentEngine] File #${idx}: ${f.name} (${formatBytes(f.length)})`);
        if (f.length > maxSize) {
            maxSize = f.length;
            fileIdx = idx;
        }
    });

    const server = torrent.createServer();
    const port = 8889;
    server.listen(port, () => {
        const streamUrl = `http://192.168.0.13:${port}/${fileIdx}`;
        console.log(`[ENGINE_STREAM_URL] ${streamUrl}`);
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
            status: torrent.done ? 'Downloaded 100% (Ready)' : (torrent.numPeers > 0 ? 'Downloading & Streaming' : 'Connecting to Peers...')
        };
        console.log(`[ENGINE_STATS] ${JSON.stringify(stats)}`);
    }, 1000);
});

client.on('error', err => {
    console.error('[TorrentEngine] Client error:', err);
});
