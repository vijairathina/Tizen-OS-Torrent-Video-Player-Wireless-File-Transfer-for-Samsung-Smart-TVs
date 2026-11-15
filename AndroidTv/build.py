#!/usr/bin/env python3
"""
Android TV on Samsung Tizen TV - Package Builder
Packages the standalone Android Tizen Web Application into a compliant .wgt (Widget Package)
ready for SDB installation onto Samsung Smart TV (Model: UA43UE84AFULXL).
"""

import os
import sys
import zipfile
import shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(BASE_DIR, 'tizen-app')
BUILD_DIR = os.path.join(BASE_DIR, 'build')
OUTPUT_WGT = os.path.join(BUILD_DIR, 'Android.wgt')

REQUIRED_FILES = [
    'config.xml',
    'index.html',
    'icon.png',
    os.path.join('css', 'style.css'),
    os.path.join('js', 'tv-keys.js'),
    os.path.join('js', 'navigation.js'),
    os.path.join('js', 'apk-parser.js'),
    os.path.join('js', 'usb-manager.js'),
    os.path.join('js', 'apk-installer.js'),
    os.path.join('js', 'runtime-manager.js'),
    os.path.join('js', 'app-store.js'),
    os.path.join('js', 'activity-runner.js'),
    os.path.join('js', 'app.js')
]

def validate_project():
    print("[1/3] Validating Android Tizen TV Application structure...")
    missing = []
    for rel_path in REQUIRED_FILES:
        full_path = os.path.join(APP_DIR, rel_path)
        if not os.path.exists(full_path):
            missing.append(rel_path)

    if missing:
        print(f"Error: Missing required files in tizen-app:\n  " + "\n  ".join(missing), file=sys.stderr)
        return False

    print("  [OK] All core application files verified.")
    return True

def package_wgt():
    print("[2/3] Building Tizen '.wgt' package archive...")
    os.makedirs(BUILD_DIR, exist_ok=True)

    if os.path.exists(OUTPUT_WGT):
        os.remove(OUTPUT_WGT)

    with zipfile.ZipFile(OUTPUT_WGT, 'w', compression=zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(APP_DIR):
            for file in files:
                abs_file = os.path.join(root, file)
                rel_path = os.path.relpath(abs_file, APP_DIR)
                # Standardize forward slashes for Tizen OS
                zip_path = rel_path.replace('\\', '/')
                zipf.write(abs_file, zip_path)

    size_kb = os.path.getsize(OUTPUT_WGT) / 1024
    print(f"  [OK] Built: {OUTPUT_WGT} ({size_kb:.1f} KB)")
    return True

def verify_package():
    print("[3/3] Inspecting package integrity...")
    try:
        with zipfile.ZipFile(OUTPUT_WGT, 'r') as zipf:
            file_list = zipf.namelist()
            if 'config.xml' not in file_list or 'index.html' not in file_list:
                print("Error: Missing config.xml or index.html in output root!", file=sys.stderr)
                return False
            print(f"  [OK] Verified {len(file_list)} files packaged successfully.")
        return True
    except Exception as e:
        print(f"Error reading package: {e}", file=sys.stderr)
        return False

if __name__ == '__main__':
    print("=" * 60)
    print(" Android TV on Samsung Tizen - WGT Packaging Engine")
    print("=" * 60)
    if validate_project() and package_wgt() and verify_package():
        print("Build Complete! Ready for deployment via deploy.ps1.")
        sys.exit(0)
    else:
        print("Build Failed!", file=sys.stderr)
        sys.exit(1)
