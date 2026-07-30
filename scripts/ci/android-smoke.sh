#!/usr/bin/env bash
# Installs the release APK on the emulator native.yml just booted, launches
# it, and fails if it is not still running ten seconds later.
#
# This lives in a file rather than inline in the workflow because
# reactivecircus/android-emulator-runner executes its `script:` input one
# line per shell: variables do not survive between lines, and any multi-line
# construct (if, brace group, loop) is split into fragments that fail as
# syntax errors with exit code 2. The log for that failure shows a healthy
# emulator and no explanation, which is a genuinely hard read. A single
# `bash <this file>` line is one shell with normal semantics.
set -euo pipefail

APK=android/app/build/outputs/apk/release/app-release.apk
PACKAGE=fs.sovereign.edge

if [ ! -f "$APK" ]; then
  echo "::error::No APK at $APK"
  find android/app/build/outputs -name '*.apk' || true
  exit 1
fi

adb install -r "$APK"
adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1

# Both `monkey` and `am start` report success for a process that died on
# startup, so the launch call itself proves nothing. Outliving a short wait
# is the actual signal.
sleep 10

if adb shell pidof "$PACKAGE" > /dev/null; then
  echo "App is running."
else
  echo "::error::App launched but was not running 10s later — likely crashed on startup."
  adb logcat -d -s ReactNativeJS AndroidRuntime || true
  exit 1
fi
