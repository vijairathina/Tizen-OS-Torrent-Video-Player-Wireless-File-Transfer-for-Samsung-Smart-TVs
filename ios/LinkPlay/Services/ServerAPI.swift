//
//  ServerAPI.swift
//  LinkPlay iOS
//
//  High-performance async/await network client for LinkPlay Companion Server.
//

import Foundation

public final class ServerAPI: ObservableObject {
    public static let shared = ServerAPI()
    
    @Published public var serverHost: String {
        didSet {
            UserDefaults.standard.set(serverHost, forKey: "linkplay_server_host")
        }
    }
    
    @Published public var isConnected: Bool = false
    @Published public var serverLatencyMs: Double = 0.0
    
    public var baseUrl: String {
        return "http://\(serverHost):8080"
    }
    
    public init() {
        let saved = UserDefaults.standard.string(forKey: "linkplay_server_host")
        self.serverHost = (saved?.isEmpty == false) ? saved! : "192.168.0.14"
    }
    
    public func pingServer() async -> Bool {
        guard let url = URL(string: "\(baseUrl)/api/downloads") else { return false }
        let start = Date()
        do {
            var request = URLRequest(url: url)
            request.timeoutInterval = 3.0
            let (_, response) = try await URLSession.shared.data(for: request)
            if let httpRes = response as? HTTPURLResponse, httpRes.statusCode == 200 {
                let latency = Date().timeIntervalSince(start) * 1000.0
                await MainActor.run {
                    self.serverLatencyMs = latency
                    self.isConnected = true
                }
                return true
            }
        } catch {
            await MainActor.run {
                self.isConnected = false
            }
        }
        return false
    }
    
    public func fetchDownloads() async throws -> ServerDownloadsResponse {
        guard let url = URL(string: "\(baseUrl)/api/downloads") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 8.0
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpRes = response as? HTTPURLResponse, httpRes.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        let decoder = JSONDecoder()
        let result = try decoder.decode(ServerDownloadsResponse.self, from: data)
        await MainActor.run {
            self.isConnected = true
        }
        return result
    }
    
    public func fetchEpisodes(for filename: String) async throws -> [EpisodeItem] {
        guard let encoded = filename.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "\(baseUrl)/torrent_files?file=\(encoded)") else {
            throw URLError(.badURL)
        }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let httpRes = response as? HTTPURLResponse, httpRes.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        let decoded = try JSONDecoder().decode(EpisodesResponse.self, from: data)
        return decoded.files
    }
    
    public func playTorrent(filename: String) async throws {
        guard let encoded = filename.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "\(baseUrl)/play_torrent?file=\(encoded)") else {
            throw URLError(.badURL)
        }
        let (_, response) = try await URLSession.shared.data(from: url)
        guard let httpRes = response as? HTTPURLResponse, (200...299).contains(httpRes.statusCode) else {
            throw URLError(.badServerResponse)
        }
    }
    
    public func pauseDownload(filename: String) async throws {
        guard let encoded = filename.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "\(baseUrl)/pause_download?file=\(encoded)") else {
            throw URLError(.badURL)
        }
        _ = try await URLSession.shared.data(from: url)
    }
    
    public func resumeDownload(filename: String) async throws {
        guard let encoded = filename.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "\(baseUrl)/resume_download?file=\(encoded)") else {
            throw URLError(.badURL)
        }
        _ = try await URLSession.shared.data(from: url)
    }
    
    public func deleteFile(filename: String) async throws {
        guard let encoded = filename.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "\(baseUrl)/delete_file?file=\(encoded)") else {
            throw URLError(.badURL)
        }
        _ = try await URLSession.shared.data(from: url)
    }
    
    public func setPriority(filename: String, priority: String) async throws {
        guard let encodedFile = filename.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let encodedPri = priority.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "\(baseUrl)/set_torrent_priority?file=\(encodedFile)&priority=\(encodedPri)") else {
            throw URLError(.badURL)
        }
        _ = try await URLSession.shared.data(from: url)
    }
    
    public func uploadFile(fileURL: URL, progressHandler: @escaping (Double) -> Void) async throws {
        guard let uploadEndpoint = URL(string: "\(baseUrl)/upload") else {
            throw URLError(.badURL)
        }
        
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: uploadEndpoint)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        let filename = fileURL.lastPathComponent
        let fileData = try Data(contentsOf: fileURL)
        
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: application/octet-stream\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        
        let (data, response) = try await URLSession.shared.upload(for: request, from: body)
        guard let httpRes = response as? HTTPURLResponse, (200...299).contains(httpRes.statusCode) else {
            let errorMsg = String(data: data, encoding: .utf8) ?? "Upload failed"
            throw NSError(domain: "ServerAPI", code: 500, userInfo: [NSLocalizedDescriptionKey: errorMsg])
        }
        progressHandler(1.0)
    }
}
