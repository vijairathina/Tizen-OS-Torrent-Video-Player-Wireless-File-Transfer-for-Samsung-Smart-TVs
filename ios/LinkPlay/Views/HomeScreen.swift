//
//  HomeScreen.swift
//  LinkPlay iOS
//
//  Cinematic iOS home launcher dashboard with spotlight hero banner, quick actions, and server health.
//

import SwiftUI

public struct HomeScreen: View {
    @ObservedObject var api = ServerAPI.shared
    @State private var availableMovies: [MovieItem] = []
    @State private var currentlyDownloading: [TorrentDownloadItem] = []
    @State private var isLoading = false
    @State private var activePlaybackMovie: MovieItem? = null
    @State private var selectedTab: Int = 0
    
    public init() {}
    
    public var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    
                    // Server Network Status Header
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("LINKPLAY")
                                .font(.system(size: 24, weight: .black, design: .rounded))
                                .foregroundColor(.cyan)
                            Text("Connected to \(api.serverHost)")
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                        
                        Spacer()
                        
                        HStack(spacing: 6) {
                            Circle()
                                .fill(api.isConnected ? Color.green : Color.red)
                                .frame(width: 8, height: 8)
                            Text(api.isConnected ? "\(Int(api.serverLatencyMs)) ms" : "Offline")
                                .font(.caption.bold())
                                .foregroundColor(api.isConnected ? .green : .red)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Color(.systemGray6))
                        .cornerRadius(12)
                    }
                    .padding(.horizontal)
                    
                    // Hero Spotlight Banner
                    if let hero = availableMovies.first {
                        ZStack(alignment: .bottomLeading) {
                            RoundedRectangle(cornerRadius: 18)
                                .fill(
                                    LinearGradient(
                                        colors: [Color(red: 0.1, green: 0.08, blue: 0.22), Color(red: 0.05, green: 0.05, blue: 0.12)],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .frame(height: 220)
                            
                            VStack(alignment: .leading, spacing: 10) {
                                HStack {
                                    Text("FEATURED STREAM")
                                        .font(.caption.bold())
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(Color.cyan.opacity(0.3))
                                        .foregroundColor(.cyan)
                                        .cornerRadius(6)
                                    Spacer()
                                    Text(hero.sizeFormatted)
                                        .font(.caption)
                                        .foregroundColor(.gray)
                                }
                                
                                Text(hero.cleanTitle)
                                    .font(.title2.bold())
                                    .foregroundColor(.white)
                                    .lineLimit(2)
                                
                                Button(action: {
                                    activePlaybackMovie = hero
                                }) {
                                    HStack {
                                        Image(systemName: "play.fill")
                                        Text("Watch on iPhone")
                                    }
                                    .font(.headline)
                                    .foregroundColor(.black)
                                    .padding(.horizontal, 20)
                                    .padding(.vertical, 10)
                                    .background(Color.cyan)
                                    .cornerRadius(10)
                                }
                            }
                            .padding(18)
                        }
                        .padding(.horizontal)
                    }
                    
                    // Quick Action Tiles
                    Text("Quick Navigation")
                        .font(.headline)
                        .padding(.horizontal)
                    
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                        NavigationLink(destination: PlayerHubView()) {
                            QuickActionCard(
                                icon: "play.tv.fill",
                                title: "Video Player",
                                subtitle: "\(availableMovies.count) Available Movies",
                                color: .purple
                            )
                        }
                        
                        NavigationLink(destination: DownloadsView()) {
                            QuickActionCard(
                                icon: "arrow.down.circle.fill",
                                title: "Downloads",
                                subtitle: "\(currentlyDownloading.count) Active Torrents",
                                color: .blue
                            )
                        }
                        
                        NavigationLink(destination: TransferView()) {
                            QuickActionCard(
                                icon: "arrow.up.and.down.circle.fill",
                                title: "Wireless Transfer",
                                subtitle: "Send Files to TV",
                                color: .green
                            )
                        }
                        
                        NavigationLink(destination: SettingsView()) {
                            QuickActionCard(
                                icon: "gearshape.fill",
                                title: "Settings",
                                subtitle: "Companion Bridge",
                                color: .orange
                            )
                        }
                    }
                    .padding(.horizontal)
                    
                    // Recent Movies Horizontal Carousel
                    if !availableMovies.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Available Library")
                                .font(.headline)
                                .padding(.horizontal)
                            
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 14) {
                                    ForEach(availableMovies) { movie in
                                        Button(action: {
                                            activePlaybackMovie = movie
                                        }) {
                                            VStack(alignment: .leading, spacing: 6) {
                                                RoundedRectangle(cornerRadius: 12)
                                                    .fill(Color(.systemGray5))
                                                    .frame(width: 140, height: 95)
                                                    .overlay(
                                                        Image(systemName: "film.fill")
                                                            .font(.largeTitle)
                                                            .foregroundColor(.cyan)
                                                    )
                                                
                                                Text(movie.cleanTitle)
                                                    .font(.caption.bold())
                                                    .foregroundColor(.primary)
                                                    .lineLimit(1)
                                                    .frame(width: 140, alignment: .leading)
                                                
                                                Text(movie.sizeFormatted)
                                                    .font(.caption2)
                                                    .foregroundColor(.secondary)
                                            }
                                        }
                                    }
                                }
                                .padding(.horizontal)
                            }
                        }
                    }
                }
                .padding(.vertical)
            }
            .navigationBarHidden(true)
            .refreshable {
                await loadData()
            }
            .task {
                await loadData()
            }
            .sheet(item: $activePlaybackMovie) { movie in
                let streamUrl = movie.streamUrl ?? "\(api.baseUrl)/files/\(movie.name)"
                VideoPlayerView(streamUrl: streamUrl, title: movie.cleanTitle)
            }
        }
    }
    
    private func loadData() async {
        _ = await api.pingServer()
        do {
            let res = try await api.fetchDownloads()
            await MainActor.run {
                self.availableMovies = res.availableMovies
                self.currentlyDownloading = res.currentlyDownloading
            }
        } catch {
            print("[HomeScreen] fetch error: \(error)")
        }
    }
}

struct QuickActionCard: View {
    let icon: String
    let title: String
    let subtitle: String
    let color: Color
    
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(color)
                .frame(width: 36, height: 36)
                .background(color.opacity(0.15))
                .cornerRadius(10)
            
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.bold())
                    .foregroundColor(.primary)
                Text(subtitle)
                    .font(.caption2)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
            Spacer()
        }
        .padding(12)
        .background(Color(.systemGray6))
        .cornerRadius(14)
    }
}
