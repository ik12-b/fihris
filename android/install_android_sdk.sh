#!/usr/bin/env bash

set -e

# --- 1. CONFIGURATION ---
ANDROID_HOME="$HOME/Android"
CMDLINE_TOOLS_DIR="$ANDROID_HOME/cmdline-tools/latest"

# URL Command-line Tools versi terbaru (Linux/macOS)
# Sesuaikan URL jika Anda menggunakan macOS (Ganti 'linux' dengan 'mac')
CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"

API_LEVEL="android-34"
BUILD_TOOLS_VERSION="34.0.0"

echo "=== Setup Android SDK via CLI ==="

# --- 2. CEK DEPENDENSI (Java & Unzip) ---
if ! command -v java &> /dev/null; then
    echo "Error: Java (JDK) tidak ditemukan. Silakan instal JDK 17 atau 21 terlebih dahulu."
    exit 1
fi

if ! command -v unzip &> /dev/null; then
    echo "Error: 'unzip' tidak ditemukan. Silakan instal unzip (misal: sudo apt install unzip)."
    exit 1
fi

# --- 3. DOWNLOAD & EXTRACTION ---
mkdir -p "$ANDROID_HOME/cmdline-tools"
TEMP_ZIP="/tmp/cmdline-tools.zip"

echo "Downloading Command-line Tools..."
curl -sL "$CMDLINE_TOOLS_URL" -o "$TEMP_ZIP"

echo "Extracting tools to $CMDLINE_TOOLS_DIR..."
mkdir -p "$CMDLINE_TOOLS_DIR"
unzip -q "$TEMP_ZIP" -d /tmp/cmdline-extracted

# Struktur zip dari Google memasukkan file di folder 'cmdline-tools'
mv /tmp/cmdline-extracted/cmdline-tools/* "$CMDLINE_TOOLS_DIR/"

# Cleanup file sementara
rm -rf "$TEMP_ZIP" /tmp/cmdline-extracted

# --- 4. EXPORT ENVIRONMENT VARIABLES ---
export ANDROID_HOME="$ANDROID_HOME"
export PATH="$PATH:$CMDLINE_TOOLS_DIR/bin:$ANDROID_HOME/platform-tools"

# Tambahkan otomatis ke file konfigurasi shell (~/.bashrc atau ~/.zshrc)
SHELL_CONFIG=""
if [ -n "$ZSH_VERSION" ] || [ -f "$HOME/.zshrc" ]; then
    SHELL_CONFIG="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_CONFIG="$HOME/.bashrc"
fi

if [ -n "$SHELL_CONFIG" ]; then
    if ! grep -q "ANDROID_HOME" "$SHELL_CONFIG"; then
        echo "" >> "$SHELL_CONFIG"
        echo '# Android SDK Environment Variables' >> "$SHELL_CONFIG"
        echo "export ANDROID_HOME=\"$ANDROID_HOME\"" >> "$SHELL_CONFIG"
        echo "export PATH=\"\$PATH:\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/platform-tools\"" >> "$SHELL_CONFIG"
        echo "--> Environment Variables ditambahkan ke $SHELL_CONFIG"
    fi
fi

# --- 5. INSTALL SDK PACKAGES & ACCEPT LICENSES ---
echo "Accepting licenses..."
yes | "$CMDLINE_TOOLS_DIR/bin/sdkmanager" --licenses > /dev/null 2>&1 || true

echo "Installing platform-tools, $API_LEVEL, and build-tools;$BUILD_TOOLS_VERSION..."
"$CMDLINE_TOOLS_DIR/bin/sdkmanager" "platform-tools" "platforms;$API_LEVEL" "build-tools;$BUILD_TOOLS_VERSION"

echo ""
echo "=== Instalasi Selesai! ==="
echo "Jalankan perintah berikut agar environment variable aktif di sesi terminal saat ini:"
if [ -n "$SHELL_CONFIG" ]; then
    echo "source $SHELL_CONFIG"
fi
