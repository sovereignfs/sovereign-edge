#!/usr/bin/env bash
# Task 0.3: produces signed, installable Android release artifacts (AAB for
# a future Play upload, APK for direct/ad-hoc install) from source.
#
# Real release signing is entirely declarative — see
# plugins/withAndroidReleaseSigning.js and docs/epics/infrastructure.md's
# task 0.3. This script does not touch signing itself: `expo prebuild`
# regenerates android/app/build.gradle with the plugin's injected signing
# config every time, and Gradle decides at build time whether
# release.keystore.properties (repo root, gitignored) exists. If it does,
# the release build type is signed with release.jks; if not (e.g. a fresh
# checkout with no keystore yet), it falls back to the debug keystore, same
# as before this task.
set -euo pipefail

cd "$(dirname "$0")/../.."

DIST_DIR="dist/android"

# Fall back to this Mac's known-good local toolchain only if the caller
# hasn't already set these — CI's setup-java/setup-android actions export
# their own and should win.
: "${JAVA_HOME:=$HOME/Library/Java/JavaVirtualMachines/jdk-17.0.20+8/Contents/Home}"
: "${ANDROID_HOME:=$HOME/Library/Android/sdk}"
export JAVA_HOME ANDROID_HOME
export PATH="$JAVA_HOME/bin:$PATH"

echo "==> Generating native Android project (expo prebuild)"
npx expo prebuild --platform android --clean

echo "==> Building release AAB + APK"
(cd android && ./gradlew bundleRelease assembleRelease --no-daemon)

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

AAB="android/app/build/outputs/bundle/release/app-release.aab"
APK="android/app/build/outputs/apk/release/app-release.apk"

test -f "$AAB" || { echo "::error::No AAB produced at $AAB" >&2; exit 1; }
test -f "$APK" || { echo "::error::No APK produced at $APK" >&2; exit 1; }

cp "$AAB" "$DIST_DIR/SovereignEdge.aab"
cp "$APK" "$DIST_DIR/SovereignEdge.apk"

echo "==> Done: $DIST_DIR/SovereignEdge.aab, $DIST_DIR/SovereignEdge.apk"
