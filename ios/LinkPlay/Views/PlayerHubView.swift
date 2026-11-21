//
//  PlayerHubView.swift
//  LinkPlay iOS
//
//  Available movies library with instant 0-buffer streaming on iPhone.
//

import SwiftUI

public struct PlayerHubView: View {
    @ObservedObject var api = ServerAPI.shared
    @State private var movies: [MovieItem] = []
    @State private var searchText: String = ""
    @State private var selectedMovie: MovieItem? = nil
    @State private var isLoading: Bool = false
    
    public init() {}
    
    private var filteredMovies: [MovieItem] {
        if searchText.isEmpty {
            return movies
        }
        return movies.filter { $0.cleanTitle.localizedCaseInsensitiveContains(searchText) }
    }
    
    public var body: some View {
        VStack(spacing: 0) {
            // Search Bar
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundColor(.gray)
                TextField("Search movies & videos...", text: $searchText)
                    .textFieldStyle(PlainTextFieldStyle())
                if !searchText.isEmpty {
                    Button(action: { searchText = "" }) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.gray)
                    }
                }
            }
            .padding(10)
            .background(Color(.systemGray6))
            .cornerRadius(12)
            .padding(.horizontal)
            .padding(.vertical, 8)
            
            if movies.isEmpty && isLoading {
                Spacer()
                ProgressView("Connecting to Server Library...")
                Spacer()
            } else if filteredMovies.isEmpty {
                Spacer()
                VStack(spacing: 12) {
                    Image(systemName: "film")
                        .font(.system(size: 48))
                        .foregroundColor(.gray)
                    Text("No Movies Available")
                        .font(.headline)
                        .foregroundColor(.secondary)
                    Text("Transfer videos or download torrents to see them here.")
                        .font(.caption)
                        .foregroundColor(.gray)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
                Spacer()
            } else {
                List(filteredMovies) { movie in
                    Button(action: {
                        selectedMovie = movie
                    }) {
                        HStack(spacing: 14) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(Color.purple.opacity(0.15))
                                    .frame(width: 50, height: 50)
                                Image(systemName: "play.circle.fill")
                                    .font(.title)
                                    .foregroundColor(.purple)
                            }
                            
                            VStack(alignment: .leading, spacing: 4) {
                                Text(movie.cleanTitle)
                                    .font(.headline)
                                    .foregroundColor(.primary)
                                    .lineLimit(2)
                                
                                HStack(spacing: 8) {
                                    Text(movie.sizeFormatted)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                    
                                    if movie.name.hasSuffix(".mkv") {
                                        Text("MKV")
                                            .font(.caption2.bold())
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(Color.cyan.opacity(0.2))
                                            .foregroundColor(.cyan)
                                            .cornerRadius(4)
                                    } else {
                                        Text("MP4")
                                            .font(.caption2.bold())
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(Color.green.opacity(0.2))
                                            .foregroundColor(.green)
                                            .cornerRadius(4)
                                    }
                                }
                            }
                            
                            Spacer()
                            
                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                        .padding(.vertical, 4)
                    }
                }
                .listStyle(PlainListStyle())
            }
        }
        .navigationTitle("Video Player")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await loadMovies()
        }
        .refreshable {
            await loadMovies()
        }
        .sheet(item: $selectedMovie) { movie in
            let streamUrl = movie.streamUrl ?? "\(api.baseUrl)/files/\(movie.name)"
            VideoPlayerView(streamUrl: streamUrl, title: movie.cleanTitle)
        }
    }
    
    private func loadMovies() async {
        isLoading = true
        do {
            let res = try await api.fetchDownloads()
            await MainActor.run {
                self.movies = res.availableMovies
                self.isLoading = false
            }
        } catch {
            print("[PlayerHubView] load error: \(error)")
            await MainActor.run {
                self.isLoading = false
            }
        }
    }
}
