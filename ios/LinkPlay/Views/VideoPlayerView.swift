//
//  VideoPlayerView.swift
//  LinkPlay iOS
//
//  Hardware-accelerated native AVPlayer for streaming and offline playback on iPhone.
//

import SwiftUI
import AVKit

public struct VideoPlayerView: UIViewControllerRepresentable {
    public let streamUrl: String
    public let title: String
    
    public init(streamUrl: String, title: String) {
        self.streamUrl = streamUrl
        self.title = title
    }
    
    public func makeUIViewController(context: Context) -> AVPlayerViewController {
        let controller = AVPlayerViewController()
        
        // Configure Audio Session for movie playback & car Bluetooth
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("[VideoPlayerView] Audio session error: \(error)")
        }
        
        if let url = URL(string: streamUrl) {
            let player = AVPlayer(url: url)
            controller.player = player
            controller.showsPlaybackControls = true
            controller.allowsPictureInPicturePlayback = true
            player.play()
        }
        
        return controller
    }
    
    public func updateUIViewController(_ uiViewController: AVPlayerViewController, context: Context) {
        // Player lifecycle managed by AVPlayerViewController
    }
}
