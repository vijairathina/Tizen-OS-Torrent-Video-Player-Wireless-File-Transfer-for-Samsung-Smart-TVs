package com.tvfilehub.core.models

enum class StorageSource(val label: String) {
    SERVER("Server"),
    LOCAL_STORAGE("Local"),
    USB_DRIVE("USB")
}

enum class OperatingMode(val label: String) {
    ONLINE_BRIDGE("Connected to Server"),
    OFFLINE_MANUAL("Offline Mode (Manual)"),
    OFFLINE_FALLBACK("Offline (Server Unreachable)")
}
