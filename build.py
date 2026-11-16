#!/usr/bin/env python3
"""
Samsung Tizen TV Package Builder
Packages the TV Web Application into a compliant .wgt (Widget Package)
ready for SDB installation onto Samsung Smart TV (CU7000 / CU7700).
"""

import os
import sys
import zipfile
import shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.join(BASE_DIR, 'app')
BUILD_DIR = os.path.join(BASE_DIR, 'build')
OUTPUT_WGT = os.path.join(BUILD_DIR, 'TVFileHub.wgt')

REQUIRED_FILES = [
    'config.xml',
    'index.html',
    'icon.png',
    os.path.join('css', 'style.css'),
    os.path.join('js', 'navigation.js'),
    os.path.join('js', 'filesystem.js'),
    os.path.join('js', 'player.js'),
    os.path.join('js', 'videoplayer.js'),
    os.path.join('js', 'filemanager.js'),
    os.path.join('js', 'receiver.js'),
    os.path.join('js', 'app.js'),
    os.path.join('js', 'qrcode.min.js')
]

def validate_project():
    print("[1/3] Validating Tizen TV Web application files...")
    missing = []
    for rel_path in REQUIRED_FILES:
        full_path = os.path.join(APP_DIR, rel_path)
        if not os.path.exists(full_path):
            missing.append(rel_path)

    if missing:
        print(f"Error: Missing required files:\n  " + "\n  ".join(missing), file=sys.stderr)
        return False

    print("  [OK] All required application files verified.")
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
                # Ensure ZIP uses forward slashes
                zip_path = rel_path.replace(os.sep, '/')
                zipf.write(abs_file, zip_path)
                print(f"  + Added: {zip_path}")

    wgt_size = os.path.getsize(OUTPUT_WGT)
    print(f"  [OK] Package built successfully: {OUTPUT_WGT}")
    print(f"  [OK] Package size: {wgt_size / 1024:.1f} KB ({wgt_size} bytes)")
    return True

def verify_package():
    print("[3/3] Inspecting package integrity...")
    with zipfile.ZipFile(OUTPUT_WGT, 'r') as zipf:
        namelist = zipf.namelist()
        if 'config.xml' not in namelist or 'index.html' not in namelist:
            print("Error: Missing root config.xml or index.html in package!", file=sys.stderr)
            return False
        print(f"  [OK] Validated {len(namelist)} package files inside '{os.path.basename(OUTPUT_WGT)}'")
    return True

def main():
    print("=" * 64)
    print(" Samsung Tizen TV Application Builder: TV File Hub & Amnis")
    print("=" * 64)

    if not validate_project():
        sys.exit(1)

    if not package_wgt():
        sys.exit(1)

    if not verify_package():
        sys.exit(1)

    print("=" * 64)
    print(f" BUILD SUCCESSFUL!")
    print(f" Output Package: {OUTPUT_WGT}")
    print("=" * 64)

if __name__ == '__main__':
    main()
