//
//  SettingsView.swift
//  LinkPlay iOS
//
//  Companion Server network configuration and diagnostics.
//

import SwiftUI

public struct SettingsView: View {
    @ObservedObject var api = ServerAPI.shared
    @State private var serverIpInput: String = ""
    @State private var testResult: String = ""
    @State private var isTesting = false
    
    public init() {}
    
    public var body: some View {
        Form {
            Section(header: Text("Companion Server Connection")) {
                HStack {
                    Text("Server IP:")
                    TextField("192.168.0.14", text: $serverIpInput)
                        .keyboardType(.numbersAndPunctuation)
                        .autocapitalization(.none)
                        .disableAutocorrection(true)
                }
                
                HStack {
                    Text("HTTP Port:")
                    Spacer()
                    Text("8080")
                        .foregroundColor(.secondary)
                }
                
                HStack {
                    Text("Streaming Port:")
                    Spacer()
                    Text("8889")
                        .foregroundColor(.secondary)
                }
                
                Button(action: {
                    api.serverHost = serverIpInput.trimmingCharacters(in: .whitespacesAndNewlines)
                    testConnection()
                }) {
                    HStack {
                        if isTesting {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle())
                        } else {
                            Image(systemName: "antenna.radiowaves.left.and.right")
                        }
                        Text("Save & Test Connection")
                    }
                }
                .disabled(isTesting)
                
                if !testResult.isEmpty {
                    Text(testResult)
                        .font(.caption.bold())
                        .foregroundColor(api.isConnected ? .green : .red)
                }
            }
            
            Section(header: Text("Quick Server Presets")) {
                Button("Set to Default Server (192.168.0.14)") {
                    serverIpInput = "192.168.0.14"
                    api.serverHost = "192.168.0.14"
                    testConnection()
                }
                
                Button("Set to Localhost (127.0.0.1)") {
                    serverIpInput = "127.0.0.1"
                    api.serverHost = "127.0.0.1"
                    testConnection()
                }
            }
            
            Section(header: Text("About LinkPlay")) {
                HStack {
                    Text("Version")
                    Spacer()
                    Text("1.1.8 (Universal iOS)")
                        .foregroundColor(.secondary)
                }
                HStack {
                    Text("Ecosystem")
                    Spacer()
                    Text("Samsung TV • Android • iPhone • Auto")
                        .foregroundColor(.secondary)
                }
                HStack {
                    Text("Privacy")
                    Spacer()
                    Text("100% Local LAN (Zero Cloud)")
                        .foregroundColor(.secondary)
                }
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            serverIpInput = api.serverHost
        }
    }
    
    private func testConnection() {
        isTesting = true
        testResult = "Connecting to \(api.baseUrl)..."
        Task {
            let success = await api.pingServer()
            await MainActor.run {
                isTesting = false
                if success {
                    testResult = "✓ Connected! Ping: \(Int(api.serverLatencyMs)) ms"
                } else {
                    testResult = "✗ Cannot reach server at \(api.serverHost):8080. Check Wi-Fi connection."
                }
            }
        }
    }
}
