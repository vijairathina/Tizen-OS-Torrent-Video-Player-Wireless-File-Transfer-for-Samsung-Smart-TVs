//
//  ContentView.swift
//  LinkPlay iOS
//
//  Main bottom tab navigation container.
//

import SwiftUI

public struct ContentView: View {
    @State private var selectedTab: Int = 0
    
    public init() {}
    
    public var body: some View {
        TabView(selection: $selectedTab) {
            HomeScreen()
                .tabItem {
                    Label("Home", systemImage: "house.fill")
                }
                .tag(0)
            
            NavigationView {
                PlayerHubView()
            }
            .tabItem {
                Label("Player", systemImage: "play.tv.fill")
            }
            .tag(1)
            
            NavigationView {
                DownloadsView()
            }
            .tabItem {
                Label("Downloads", systemImage: "arrow.down.circle.fill")
            }
            .tag(2)
            
            NavigationView {
                TransferView()
            }
            .tabItem {
                Label("Transfer", systemImage: "arrow.up.and.down.circle.fill")
            }
            .tag(3)
            
            NavigationView {
                SettingsView()
            }
            .tabItem {
                Label("Settings", systemImage: "gearshape.fill")
            }
            .tag(4)
        }
        .accentColor(.cyan)
    }
}
