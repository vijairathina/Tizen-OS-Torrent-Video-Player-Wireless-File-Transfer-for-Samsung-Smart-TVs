//
//  DownloadsView.swift
//  LinkPlay iOS
//
//  Live BitTorrent downloads manager with episode selector, stream-first, and priority controls.
//

import SwiftUI

public struct DownloadsView: View {
    @ObservedObject var api = ServerAPI.shared
    @State private var downloads: [TorrentDownloadItem] = []
    @State private var selectedTorrentForEpisodes: TorrentDownloadItem? = nil
    @State private var episodes: [EpisodeItem] = []
    @State private var isFetchingEpisodes: Bool = false
    @State private var activeStreamUrl: String? = nil
    @State private var activeStreamTitle: String = ""
    @State private var timer: Timer? = nil
    
    public init() {}
    
    public var body: some View {
        VStack(spacing: 0) {
            if downloads.isEmpty {
                Spacer()
                VStack(spacing: 12) {
                    Image(systemName: "arrow.down.circle")
                        .font(.system(size: 48))
                        .foregroundColor(.gray)
                    Text("No Active Downloads")
                        .font(.headline)
                        .foregroundColor(.secondary)
                    Text("Upload a .torrent file from the Transfer tab to start sequential streaming.")
                        .font(.caption)
                        .foregroundColor(.gray)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                Spacer()
            } else {
                List {
                    ForEach(downloads) { item in
                        VStack(alignment: .leading, spacing: 10) {
                            // Title & Priority Badge
                            HStack {
                                Text(item.cleanTitle)
                                    .font(.headline)
                                    .lineLimit(2)
                                Spacer()
                                Text(item.priorityBadge)
                                    .font(.caption2.bold())
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(item.isActiveStream ? Color.cyan.opacity(0.2) : Color.blue.opacity(0.2))
                                    .foregroundColor(item.isActiveStream ? .cyan : .blue)
                                    .cornerRadius(6)
                            }
                            
                            // Progress bar
                            ProgressView(value: item.progress, total: 100.0)
                                .accentColor(item.isActiveStream ? .cyan : .blue)
                            
                            // Metrics Row
                            HStack {
                                Text("\(String(format: "%.1f", item.progress))%")
                                    .font(.caption.bold())
                                Spacer()
                                Text("\(item.downloaded) / \(item.total)")
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                                Spacer()
                                Text("⚡ \(item.speed)")
                                    .font(.caption2.bold())
                                    .foregroundColor(.green)
                                Spacer()
                                Text("👥 \(item.peers) peers")
                                    .font(.caption2)
                                    .foregroundColor(.secondary)
                            }
                            
                            // Action Buttons Row
                            HStack(spacing: 8) {
                                // Stream First Button
                                Button(action: {
                                    activeStreamTitle = item.cleanTitle
                                    activeStreamUrl = item.streamUrl ?? "\(api.baseUrl)/files/\(item.name)"
                                }) {
                                    HStack(spacing: 4) {
                                        Image(systemName: "play.fill")
                                        Text("Stream First")
                                    }
                                    .font(.caption.bold())
                                    .foregroundColor(.black)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(Color.cyan)
                                    .cornerRadius(8)
                                }
                                
                                // Episode Selector Button (for series)
                                Button(action: {
                                    loadEpisodes(for: item)
                                }) {
                                    HStack(spacing: 4) {
                                        Image(systemName: "list.number")
                                        Text("Episodes")
                                    }
                                    .font(.caption.bold())
                                    .foregroundColor(.purple)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(Color.purple.opacity(0.15))
                                    .cornerRadius(8)
                                }
                                
                                Spacer()
                                
                                // Pause / Resume
                                Button(action: {
                                    Task {
                                        if item.isPaused == true {
                                            try? await api.resumeDownload(filename: item.name)
                                        } else {
                                            try? await api.pauseDownload(filename: item.name)
                                        }
                                        await loadDownloads()
                                    }
                                }) {
                                    Image(systemName: (item.isPaused == true) ? "play.circle" : "pause.circle")
                                        .font(.title3)
                                        .foregroundColor(.orange)
                                }
                                
                                // Delete
                                Button(action: {
                                    Task {
                                        try? await api.deleteFile(filename: item.name)
                                        await loadDownloads()
                                    }
                                }) {
                                    Image(systemName: "trash")
                                        .font(.subheadline)
                                        .foregroundColor(.red)
                                }
                            }
                            .padding(.top, 4)
                        }
                        .padding(.vertical, 6)
                    }
                }
                .listStyle(PlainListStyle())
            }
        }
        .navigationTitle("Active Downloads")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            startPolling()
        }
        .onDisappear {
            stopPolling()
        }
        .sheet(item: $selectedTorrentForEpisodes) { torrent in
            EpisodesSheetView(torrent: torrent, episodes: episodes, isLoading: isFetchingEpisodes) { ep in
                selectedTorrentForEpisodes = nil
                activeStreamTitle = ep.cleanName
                activeStreamUrl = ep.streamUrl
            }
        }
        .sheet(isPresented: Binding(
            get: { activeStreamUrl != nil },
            set: { if !$0 { activeStreamUrl = nil } }
        )) {
            if let url = activeStreamUrl {
                VideoPlayerView(streamUrl: url, title: activeStreamTitle)
            }
        }
    }
    
    private func startPolling() {
        Task { await loadDownloads() }
        timer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { _ in
            Task { await loadDownloads() }
        }
    }
    
    private func stopPolling() {
        timer?.invalidate()
        timer = nil
    }
    
    private func loadDownloads() async {
        do {
            let res = try await api.fetchDownloads()
            await MainActor.run {
                self.downloads = res.currentlyDownloading
            }
        } catch {
            print("[DownloadsView] poll error: \(error)")
        }
    }
    
    private func loadEpisodes(for item: TorrentDownloadItem) {
        selectedTorrentForEpisodes = item
        isFetchingEpisodes = true
        episodes = []
        Task {
            do {
                let fetched = try await api.fetchEpisodes(for: item.name)
                await MainActor.run {
                    self.episodes = fetched
                    self.isFetchingEpisodes = false
                }
            } catch {
                print("[DownloadsView] episodes error: \(error)")
                await MainActor.run {
                    self.isFetchingEpisodes = false
                }
            }
        }
    }
}

struct EpisodesSheetView: View {
    let torrent: TorrentDownloadItem
    let episodes: [EpisodeItem]
    let isLoading: Bool
    let onSelectEpisode: (EpisodeItem) -> Void
    @Environment(\.dismiss) var dismiss
    
    var body: some View {
        NavigationView {
            VStack {
                if isLoading {
                    Spacer()
                    ProgressView("Analyzing Series Episodes...")
                    Spacer()
                } else if episodes.isEmpty {
                    Spacer()
                    Text("No individual episodes found in this torrent.")
                        .foregroundColor(.secondary)
                    Spacer()
                } else {
                    List(episodes) { ep in
                        Button(action: {
                            onSelectEpisode(ep)
                        }) {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(ep.cleanName)
                                        .font(.subheadline.bold())
                                        .foregroundColor(.primary)
                                    Text(ep.sizeFormatted)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                Spacer()
                                Image(systemName: "play.circle.fill")
                                    .font(.title2)
                                    .foregroundColor(.cyan)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
            .navigationTitle("Select Episode to Stream")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }
}
