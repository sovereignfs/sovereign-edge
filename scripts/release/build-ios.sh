#!/usr/bin/env bash
# Task 0.3: produces a signed, installable iOS build from source.
#
# Team ID comes from app.json's expo.ios.appleTeamId, which `expo prebuild`
# writes into the generated Xcode project's DEVELOPMENT_TEAM on every run —
# see docs/epics/infrastructure.md's task 0.3. Everything else about signing
# is left to Xcode's default (Automatic), which is what makes this same
# script work two different ways:
#
#   - Locally: no CODE_SIGN_STYLE/CODE_SIGN_IDENTITY/PROVISIONING_PROFILE_SPECIFIER
#     set, so Xcode signs automatically using whichever Apple ID is signed
#     into this Mac's Xcode.
#   - In CI (.github/workflows/release.yml): those three env vars are set,
#     because a CI runner has no live Apple ID session — only an imported
#     certificate and provisioning profile. The values become xcodebuild
#     command-line build-setting overrides, which win over the project's
#     default Automatic signing without editing any generated file.
set -euo pipefail

# CocoaPods/Ruby's Unicode normalization crashes under the "C" locale, which
# is what a bare shell (this script's own CI runner, or a Mac never
# configured for a specific locale) has by default.
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

cd "$(dirname "$0")/../.."

EXPORT_METHOD="${EXPORT_METHOD:-development}"
DIST_DIR="dist/ios"
ARCHIVE_PATH="$DIST_DIR/SovereignEdge.xcarchive"
EXPORT_OPTIONS="$DIST_DIR/exportOptions.plist"

TEAM_ID=$(node -e "console.log(require('./app.json').expo.ios.appleTeamId || '')")
BUNDLE_ID=$(node -e "console.log(require('./app.json').expo.ios.bundleIdentifier || '')")

if [ -z "$TEAM_ID" ]; then
  echo "::error::app.json expo.ios.appleTeamId is not set" >&2
  exit 1
fi

echo "==> Generating native iOS project (expo prebuild)"
npx expo prebuild --platform ios --clean

echo "==> Installing CocoaPods dependencies"
(cd ios && pod install)

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo "==> Archiving (team $TEAM_ID, export method $EXPORT_METHOD)"
archive_args=(
  -workspace ios/SovereignEdge.xcworkspace
  -scheme SovereignEdge
  -configuration Release
  -destination 'generic/platform=iOS'
  -archivePath "$ARCHIVE_PATH"
  -allowProvisioningUpdates
)

signing_style_lower="automatic"
if [ -n "${CODE_SIGN_STYLE:-}" ]; then
  archive_args+=("CODE_SIGN_STYLE=${CODE_SIGN_STYLE}")
  signing_style_lower=$(echo "$CODE_SIGN_STYLE" | tr '[:upper:]' '[:lower:]')
fi
if [ -n "${CODE_SIGN_IDENTITY:-}" ]; then
  archive_args+=("CODE_SIGN_IDENTITY=${CODE_SIGN_IDENTITY}")
fi
if [ -n "${PROVISIONING_PROFILE_SPECIFIER:-}" ]; then
  archive_args+=("PROVISIONING_PROFILE_SPECIFIER=${PROVISIONING_PROFILE_SPECIFIER}")
fi

xcodebuild archive "${archive_args[@]}"

echo "==> Writing exportOptions.plist"
extra_signing_keys=""
if [ "$signing_style_lower" = "manual" ]; then
  extra_signing_keys="
	<key>provisioningProfiles</key>
	<dict>
		<key>${BUNDLE_ID}</key>
		<string>${PROVISIONING_PROFILE_SPECIFIER:-}</string>
	</dict>
	<key>signingCertificate</key>
	<string>${CODE_SIGN_IDENTITY:-}</string>"
fi

cat > "$EXPORT_OPTIONS" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>${EXPORT_METHOD}</string>
	<key>teamID</key>
	<string>${TEAM_ID}</string>
	<key>signingStyle</key>
	<string>${signing_style_lower}</string>
	<key>compileBitcode</key>
	<false/>${extra_signing_keys}
</dict>
</plist>
PLIST

echo "==> Exporting IPA"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$DIST_DIR" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates

echo "==> Done: $DIST_DIR/SovereignEdge.ipa"
