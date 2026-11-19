package com.tvfilehub.tv.receiver

import android.content.Context
import android.net.Uri
import com.tvfilehub.core.services.LocalMediaScanner
import kotlinx.coroutines.*
import java.io.*
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.util.concurrent.atomic.AtomicBoolean

class TvEmbeddedReceiverServer(
    private val context: Context,
    var onFileReceived: ((File) -> Unit)? = null
) {
    private var serverSocket: ServerSocket? = null
    private val isRunning = AtomicBoolean(false)
    private val serverScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    var activePort: Int = 8080
        private set

    var targetDirectory: File = LocalMediaScanner.getLocalMoviesDirectory(context)

    fun start(preferredPort: Int = 8080): Int {
        if (isRunning.get()) return activePort

        var port = preferredPort
        try {
            serverSocket = ServerSocket(port)
        } catch (_: Exception) {
            try {
                port = 8888
                serverSocket = ServerSocket(port)
            } catch (_: Exception) {
                port = 0
                serverSocket = ServerSocket(0)
            }
        }

        activePort = serverSocket?.localPort ?: port
        isRunning.set(true)

        serverScope.launch {
            while (isRunning.get()) {
                try {
                    val socket = serverSocket?.accept() ?: break
                    launch { handleClientSocket(socket) }
                } catch (_: Exception) {
                    break
                }
            }
        }

        return activePort
    }

    fun stop() {
        isRunning.set(false)
        try {
            serverSocket?.close()
        } catch (_: Exception) {}
        serverSocket = null
    }

    private fun handleClientSocket(socket: Socket) {
        socket.use { s ->
            s.soTimeout = 30000
            val input = BufferedInputStream(s.getInputStream())
            val output = BufferedOutputStream(s.getOutputStream())

            // Read request line
            val reqLine = readLine(input) ?: return
            val parts = reqLine.split(" ")
            if (parts.size < 2) return
            val method = parts[0].uppercase()
            val fullPath = parts[1]

            // Read headers
            val headers = mutableMapOf<String, String>()
            while (true) {
                val line = readLine(input) ?: break
                if (line.isEmpty()) break
                val colonIdx = line.indexOf(':')
                if (colonIdx > 0) {
                    val key = line.substring(0, colonIdx).trim().lowercase()
                    val value = line.substring(colonIdx + 1).trim()
                    headers[key] = value
                }
            }

            if (method == "OPTIONS") {
                sendCorsOk(output)
                return
            }

            val pathOnly = if (fullPath.contains("?")) fullPath.substringBefore("?") else fullPath

            when {
                method == "GET" && (pathOnly == "/" || pathOnly == "/index.html") -> {
                    serveUploadHtml(output)
                }
                method == "GET" && pathOnly == "/status" -> {
                    serveStatusJson(output)
                }
                method == "POST" && pathOnly.startsWith("/upload") -> {
                    handleFileUpload(fullPath, headers, input, output)
                }
                else -> {
                    sendResponse(output, 404, "Not Found", "text/plain", "Not Found")
                }
            }
        }
    }

    private fun handleFileUpload(
        fullPath: String,
        headers: Map<String, String>,
        input: InputStream,
        output: OutputStream
    ) {
        var filename = "received_${System.currentTimeMillis()}.mp4"

        // Check query param e.g. /upload?filename=myvideo.mp4
        if (fullPath.contains("?")) {
            val query = fullPath.substringAfter("?")
            for (param in query.split("&")) {
                val kv = param.split("=")
                if (kv.size == 2 && kv[0] == "filename") {
                    try {
                        filename = URLDecoder.decode(kv[1], "UTF-8")
                    } catch (_: Exception) {}
                }
            }
        } else if (headers.containsKey("x-filename")) {
            filename = headers["x-filename"] ?: filename
        }

        // Sanitize filename
        filename = File(filename).name.replace("[^a-zA-Z0-9._-]".toRegex(), "_")
        if (!targetDirectory.exists()) targetDirectory.mkdirs()

        val destination = File(targetDirectory, filename)
        val contentLength = headers["content-length"]?.toLongOrNull() ?: -1L

        try {
            FileOutputStream(destination).use { fos ->
                val buffer = ByteArray(64 * 1024)
                var remaining = contentLength
                if (contentLength > 0) {
                    while (remaining > 0) {
                        val toRead = if (remaining > buffer.size) buffer.size else remaining.toInt()
                        val bytesRead = input.read(buffer, 0, toRead)
                        if (bytesRead == -1) break
                        fos.write(buffer, 0, bytesRead)
                        remaining -= bytesRead
                    }
                } else {
                    var bytesRead: Int
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        fos.write(buffer, 0, bytesRead)
                    }
                }
                fos.flush()
            }

            onFileReceived?.invoke(destination)

            val json = """{"status":"ok","filename":"$filename","size":${destination.length()}}"""
            sendResponse(output, 200, "OK", "application/json", json)
        } catch (e: Exception) {
            sendResponse(output, 500, "Internal Server Error", "application/json", """{"error":"${e.localizedMessage}"}""")
        }
    }

    private fun serveUploadHtml(output: OutputStream) {
        val html = """
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>LinkPlay TV File Receiver</title>
              <style>
                body { background: #0b0f19; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
                .card { background: #131b2e; border-radius: 20px; padding: 32px 24px; max-width: 440px; width: 100%; box-shadow: 0 15px 35px rgba(0,0,0,0.6); text-align: center; border: 1px solid rgba(0,242,254,0.2); }
                h1 { color: #00f2fe; margin-top: 0; font-size: 22px; display: flex; align-items: center; justify-content: center; gap: 8px; }
                p { color: #94a3b8; font-size: 13px; line-height: 1.5; margin-bottom: 24px; }
                .upload-zone { border: 2px dashed #00f2fe; border-radius: 14px; padding: 32px 16px; background: rgba(0,242,254,0.04); cursor: pointer; transition: 0.2s; }
                .upload-zone:hover { background: rgba(0,242,254,0.1); border-color: #38bdf8; }
                input[type="file"] { display: none; }
                .btn { background: #00f2fe; color: #0b0f19; border: none; font-weight: 700; padding: 14px; border-radius: 10px; cursor: pointer; font-size: 15px; margin-top: 20px; width: 100%; transition: 0.2s; }
                .btn:hover { background: #38bdf8; }
                .btn:disabled { background: #334155; color: #64748b; cursor: not-allowed; }
                .progress { display: none; margin-top: 20px; width: 100%; background: #1e293b; height: 10px; border-radius: 5px; overflow: hidden; }
                .progress-bar { width: 0%; height: 100%; background: #10b981; transition: width 0.15s ease-out; }
                #status-text { margin-top: 14px; font-size: 13px; font-weight: 600; min-height: 18px; }
              </style>
            </head>
            <body>
              <div class="card">
                <h1>📺 LinkPlay TV Direct</h1>
                <p>Transfer videos or torrent files straight to your TV storage over local Wi-Fi</p>
                <div class="upload-zone" onclick="document.getElementById('fileInput').click()">
                  <div style="font-size: 44px; margin-bottom: 8px;">🎬</div>
                  <div id="file-label" style="font-weight: 600; color: #f8fafc; font-size: 15px;">Tap to Choose File</div>
                  <div style="font-size: 12px; color: #64748b; margin-top: 6px;">MP4, MKV, AVI, Torrent, WebM, etc.</div>
                </div>
                <input type="file" id="fileInput" onchange="handleFileSelected(this.files[0])">
                <button class="btn" id="uploadBtn" onclick="uploadSelectedFile()" style="display:none;">⚡ Send to TV Screen</button>
                <div class="progress" id="progressWrap">
                  <div class="progress-bar" id="progressBar"></div>
                </div>
                <div id="status-text"></div>
              </div>
              <script>
                let selectedFile = null;
                function handleFileSelected(file) {
                  if (!file) return;
                  selectedFile = file;
                  document.getElementById('file-label').innerText = file.name + ' (' + (file.size / 1024 / 1024).toFixed(1) + ' MB)';
                  document.getElementById('uploadBtn').style.display = 'block';
                  document.getElementById('status-text').innerText = '';
                }
                function uploadSelectedFile() {
                  if (!selectedFile) return;
                  const btn = document.getElementById('uploadBtn');
                  btn.disabled = true;
                  btn.innerText = 'Sending...';
                  const pWrap = document.getElementById('progressWrap');
                  const pBar = document.getElementById('progressBar');
                  const status = document.getElementById('status-text');
                  pWrap.style.display = 'block';
                  pBar.style.width = '0%';
                  status.style.color = '#38bdf8';
                  status.innerText = 'Transferring file to TV...';

                  const xhr = new XMLHttpRequest();
                  xhr.open('POST', '/upload?filename=' + encodeURIComponent(selectedFile.name), true);
                  xhr.upload.onprogress = function(e) {
                    if (e.lengthComputable) {
                      const percent = Math.round((e.loaded / e.total) * 100);
                      pBar.style.width = percent + '%';
                      status.innerText = 'Sending to TV: ' + percent + '%';
                    }
                  };
                  xhr.onload = function() {
                    if (xhr.status === 200) {
                      pBar.style.width = '100%';
                      status.style.color = '#10b981';
                      status.innerText = '✓ Successfully transferred to TV!';
                      btn.innerText = 'Send Another File';
                      btn.disabled = false;
                      selectedFile = null;
                    } else {
                      status.style.color = '#ef4444';
                      status.innerText = 'Transfer failed: ' + xhr.statusText;
                      btn.disabled = false;
                      btn.innerText = 'Retry Send';
                    }
                  };
                  xhr.onerror = function() {
                    status.style.color = '#ef4444';
                    status.innerText = 'Network connection lost during transfer';
                    btn.disabled = false;
                    btn.innerText = 'Retry Send';
                  };
                  xhr.send(selectedFile);
                }
              </script>
            </body>
            </html>
        """.trimIndent()

        sendResponse(output, 200, "OK", "text/html; charset=UTF-8", html)
    }

    private fun serveStatusJson(output: OutputStream) {
        val json = """{"service":"LinkPlay TV Receiver","status":"online","port":$activePort}"""
        sendResponse(output, 200, "OK", "application/json", json)
    }

    private fun sendCorsOk(output: OutputStream) {
        val resp = "HTTP/1.1 204 No Content\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
                "Access-Control-Allow-Headers: Content-Type, X-Filename\r\n" +
                "Content-Length: 0\r\n\r\n"
        output.write(resp.toByteArray())
        output.flush()
    }

    private fun sendResponse(output: OutputStream, code: Int, statusText: String, contentType: String, body: String) {
        val bytes = body.toByteArray(Charsets.UTF_8)
        val header = "HTTP/1.1 $code $statusText\r\n" +
                "Content-Type: $contentType\r\n" +
                "Content-Length: ${bytes.size}\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Connection: close\r\n\r\n"
        output.write(header.toByteArray())
        output.write(bytes)
        output.flush()
    }

    private fun readLine(input: InputStream): String? {
        val sb = StringBuilder()
        var b: Int
        while (input.read().also { b = it } != -1) {
            if (b == '\n'.code) {
                return sb.toString().trimEnd('\r')
            }
            sb.append(b.toChar())
        }
        return if (sb.isNotEmpty()) sb.toString().trimEnd('\r') else null
    }
}
