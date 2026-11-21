//
//  LinkPlayApp.swift
//  LinkPlay iOS
//
//  SwiftUI application lifecycle and entry point.
//

import SwiftUI
import AVFoundation

@main
struct LinkPlayApp: App {
    
    init() {
        // Setup background audio capability & network permissions
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("[LinkPlayApp] AVAudioSession configuration warning: \(error)")
        }
    }
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.dark)
        }
    }
}
