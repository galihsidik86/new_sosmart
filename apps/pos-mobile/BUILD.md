# Build APK Lentera POS

## Prasyarat

1. **JDK 17 atau 21** — bundled JBR di Android Studio cocok.
2. **Android Studio** dengan SDK 36 + build-tools 36.
3. **NDK 27.1.12297006** + **CMake 3.22.1** — install via Android Studio:
   - Tools → SDK Manager → SDK Tools tab
   - Centang **NDK (Side by side)** → klik *Show Package Details*
   - Pilih `27.1.12297006`
   - Centang **CMake** → pilih `3.22.1`
   - Apply
4. **Path tanpa spasi** — Android Gradle Plugin tidak suka path yang
   mengandung spasi. Kalau profile user Windows pakai spasi (mis. `Galih
   Sidik`), bikin junction symlink ke path tanpa spasi:
   ```powershell
   New-Item -ItemType Junction -Path C:\android_sdk `
     -Target "C:\Users\<You>\AppData\Local\Android\Sdk"
   ```

## Setup environment (Git Bash)

```bash
export ANDROID_HOME="C:\android_sdk"            # junction tanpa spasi
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
```

Buat `android/local.properties`:

```properties
sdk.dir=C\:\\android_sdk
```

## Build

```bash
cd apps/pos-mobile

# Generate native android/ project (sekali atau setelah ubah app.json / plugin)
pnpm prebuild

# Pin Gradle ke 8.13 (AGP 8.12 belum kompatibel Gradle 9.x).
# Ini opsional kalau prebuild sudah benar pin-nya.
sed -i 's|gradle-9.3.1-bin.zip|gradle-8.13-bin.zip|' \
  android/gradle/wrapper/gradle-wrapper.properties

# Build APK debug (auto-sign pakai debug keystore).
cd android && ./gradlew assembleDebug
```

APK akan tersimpan di `android/app/build/outputs/apk/debug/app-debug.apk`.
Salin ke ponsel Android, izinkan *install from unknown sources*, lalu install.

## Jalankan di device USB

```bash
adb devices                                # pastikan ponsel terdeteksi
pnpm android                               # alias `expo run:android`
```

## Konfigurasi API URL

Defaultnya `10.0.2.2:4000` (Android emulator ke host). Untuk device fisik
yang LAN dengan laptop yang menjalankan API, set:

```bash
export EXPO_PUBLIC_API_URL=http://192.168.1.123:4000   # IP laptop
```

Atau update di Setelan → Server kalau sudah ada UI editor (fase
berikutnya).
