//
//  TransferView.swift
//  LinkPlay iOS
//
//  Wireless LAN File & Torrent uploader to TV and Companion Server.
//

import SwiftUI
import UniformTypeIdentifiers

public struct TransferView: View {
    @ObservedObject var api = ServerAPI.shared
    @State private var isShowingPicker = false
    @State private var isUploading = false
    @State private var uploadProgress: Double = 0.0
    @State private var statusMessage: String = ""
    @State private var isSuccess = false
    
    public init() {}
    
    public var body: some View {
        VStack(spacing: 24) {
            Spacer()
            
            ZStack {
                Circle()
                    .fill(Color.green.opacity(0.15))
                    .frame(width: 120, height: 120)
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 60))
                    .foregroundColor(.green)
            }
            
            VStack(spacing: 8) {
                Text("Wireless File Transfer")
                    .font(.title2.bold())
                Text("Send Videos, .torrent files, and subtitles directly to your Samsung TV and Server.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 30)
            }
            
            if isUploading {
                VStack(spacing: 12) {
                    ProgressView(value: uploadProgress, total: 1.0)
                        .accentColor(.green)
                        .padding(.horizontal, 40)
                    Text("Uploading to \(api.serverHost)... \(Int(uploadProgress * 100))%")
                        .font(.caption.bold())
                        .foregroundColor(.green)
                }
            } else if !statusMessage.isEmpty {
                Text(statusMessage)
                    .font(.subheadline.bold())
                    .foregroundColor(isSuccess ? .green : .red)
                    .padding(.horizontal)
            }
            
            Spacer()
            
            Button(action: {
                isShowingPicker = true
            }) {
                HStack(spacing: 8) {
                    Image(systemName: "plus.circle.fill")
                    Text("Select Files to Send")
                }
                .font(.headline)
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.green)
                .cornerRadius(14)
                .padding(.horizontal, 24)
            }
            .disabled(isUploading)
            
            Text("Target Server: \(api.baseUrl)")
                .font(.caption2)
                .foregroundColor(.gray)
                .padding(.bottom, 10)
        }
        .navigationTitle("Wireless Transfer")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $isShowingPicker) {
            DocumentPicker { url in
                uploadSelectedFile(url: url)
            }
        }
    }
    
    private func uploadSelectedFile(url: URL) {
        guard url.startAccessingSecurityScopedResource() else { return }
        defer { url.stopAccessingSecurityScopedResource() }
        
        isUploading = true
        uploadProgress = 0.0
        statusMessage = "Uploading \(url.lastPathComponent)..."
        
        Task {
            do {
                try await api.uploadFile(fileURL: url) { prog in
                    DispatchQueue.main.async {
                        self.uploadProgress = prog
                    }
                }
                await MainActor.run {
                    self.isUploading = false
                    self.isSuccess = true
                    self.statusMessage = "✓ Successfully sent \(url.lastPathComponent) to TV / Server!"
                }
            } catch {
                await MainActor.run {
                    self.isUploading = false
                    self.isSuccess = false
                    self.statusMessage = "Upload failed: \(error.localizedDescription)"
                }
            }
        }
    }
}

struct DocumentPicker: UIViewControllerRepresentable {
    let onPick: (URL) -> Void
    
    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.item], asCopy: true)
        picker.delegate = context.coordinator
        picker.allowsMultipleSelection = false
        return picker
    }
    
    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}
    
    func makeCoordinator() -> Coordinator {
        Coordinator(onPick: onPick)
    }
    
    class Coordinator: NSObject, UIDocumentPickerDelegate {
        let onPick: (URL) -> Void
        init(onPick: @escaping (URL) -> Void) { self.onPick = onPick }
        
        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            if let first = urls.first {
                onPick(first)
            }
        }
    }
}
