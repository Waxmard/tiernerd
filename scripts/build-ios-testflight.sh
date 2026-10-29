#!/bin/bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

APPLE_TEAM_ID="${APPLE_TEAM_ID:-48TY2FP59S}"
IOS_BUNDLE_ID="${IOS_BUNDLE_ID:-com.maxwellward.tiernerd}"
MARKETING_VERSION="${MARKETING_VERSION:-$(node -p "require('$root/frontend/package.json').version")}"
IOS_BUILD_NUMBER="${IOS_BUILD_NUMBER:-1}"
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://tiernerd-api-dev-1015723670625.us-east1.run.app}"
export EXPO_PUBLIC_GOOGLE_CLIENT_ID="${EXPO_PUBLIC_GOOGLE_CLIENT_ID:-1015723670625-c2nlt7fbkh28odv6557bvfhgrfjnd1k2.apps.googleusercontent.com}"
export EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID="${EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID:-1015723670625-v0h15l5cj1eotf9h4u539q878e2mclm6.apps.googleusercontent.com}"
export EXPO_NO_DOTENV=1

if [[ ! "$IOS_BUILD_NUMBER" =~ ^[0-9]+(\.[0-9]+){0,2}$ ]]; then
  printf 'Invalid IOS_BUILD_NUMBER: %s\n' "$IOS_BUILD_NUMBER" >&2
  exit 1
fi

if [[ ! "$MARKETING_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  printf 'Invalid MARKETING_VERSION: %s\n' "$MARKETING_VERSION" >&2
  exit 1
fi

node "$root/scripts/ios-config.mjs"

if ! command -v pod >/dev/null 2>&1; then
  echo 'CocoaPods is required. Install it with Homebrew (brew install cocoapods) and ensure pod is on PATH.' >&2
  exit 1
fi

(
  cd "$root/frontend"
  npx expo prebuild --platform ios --no-install
  (cd ios && (pod install || { echo 'pod install failed; rebuilding generated ios/Pods' >&2; rm -rf Pods && pod install; }))
)

if [[ "${SIMULATOR_SMOKE_ONLY:-0}" == "1" ]]; then
  xcodebuild \
    -workspace "$root/frontend/ios/TierNerd.xcworkspace" \
    -scheme TierNerd \
    -configuration Release \
    -destination 'generic/platform=iOS Simulator' \
    DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
    PRODUCT_BUNDLE_IDENTIFIER="$IOS_BUNDLE_ID" \
    MARKETING_VERSION="$MARKETING_VERSION" \
    CURRENT_PROJECT_VERSION="$IOS_BUILD_NUMBER" \
    IPHONEOS_DEPLOYMENT_TARGET=15.1 \
    CODE_SIGNING_ALLOWED=NO \
    build
  exit 0
fi

missing=()
for var in ASC_KEY_ID ASC_ISSUER_ID ASC_PRIVATE_KEY APPLE_CERTIFICATE_P12_BASE64 APPLE_CERTIFICATE_PASSWORD; do
  if [[ -z "${!var:-}" ]]; then
    missing+=("$var")
  fi
done
if ((${#missing[@]} > 0)); then
  printf 'Missing required environment variable(s): %s\n' "${missing[*]}" >&2
  exit 1
fi

WORK_DIR="$(mktemp -d "${RUNNER_TEMP:-/tmp}/tiernerd-ios.XXXXXX")"
KEYCHAIN_PATH="$WORK_DIR/build.keychain-db"
KEYCHAIN_PASSWORD="$(openssl rand -hex 24)"
trap 'security delete-keychain "$KEYCHAIN_PATH" >/dev/null 2>&1 || true; rm -rf "$WORK_DIR"' EXIT

printf '%s' "$APPLE_CERTIFICATE_P12_BASE64" | base64 --decode >"$WORK_DIR/dist.p12"

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

existing_keychains=()
while IFS= read -r line; do
  trimmed="${line#"${line%%[![:space:]]*}"}"
  trimmed="${trimmed%\"}"
  trimmed="${trimmed#\"}"
  [[ -n "$trimmed" ]] && existing_keychains+=("$trimmed")
done < <(security list-keychains -d user)
security list-keychains -d user -s "$KEYCHAIN_PATH" ${existing_keychains[@]+"${existing_keychains[@]}"}

security import "$WORK_DIR/dist.p12" -k "$KEYCHAIN_PATH" -P "$APPLE_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

AUTH_KEY_PATH="$WORK_DIR/AuthKey_${ASC_KEY_ID}.p8"
printf '%s\n' "$ASC_PRIVATE_KEY" >"$AUTH_KEY_PATH"
chmod 600 "$AUTH_KEY_PATH"

EXPORT_OPTIONS_PLIST="$WORK_DIR/ExportOptions.plist"
cat >"$EXPORT_OPTIONS_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>destination</key>
	<string>export</string>
	<key>manageAppVersionAndBuildNumber</key>
	<false/>
	<key>method</key>
	<string>app-store-connect</string>
	<key>signingStyle</key>
	<string>automatic</string>
	<key>teamID</key>
	<string>${APPLE_TEAM_ID}</string>
</dict>
</plist>
EOF

ARCHIVE_PATH="$WORK_DIR/TierNerd.xcarchive"
EXPORT_PATH="$WORK_DIR/export"

xcodebuild \
  -workspace "$root/frontend/ios/TierNerd.xcworkspace" \
  -scheme TierNerd \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  PRODUCT_BUNDLE_IDENTIFIER="$IOS_BUNDLE_ID" \
  MARKETING_VERSION="$MARKETING_VERSION" \
  CURRENT_PROJECT_VERSION="$IOS_BUILD_NUMBER" \
  IPHONEOS_DEPLOYMENT_TARGET=15.1 \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$AUTH_KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID" \
  archive

xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS_PLIST" \
  -exportPath "$EXPORT_PATH" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$AUTH_KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"

IPA_PATH="$EXPORT_PATH/TierNerd.ipa"
if [[ ! -f "$IPA_PATH" ]]; then
  ipas=("$EXPORT_PATH"/*.ipa)
  if ((${#ipas[@]} == 1)) && [[ -f "${ipas[0]}" ]]; then
    IPA_PATH="${ipas[0]}"
  else
    printf 'Expected exported IPA in %s\n' "$EXPORT_PATH" >&2
    exit 1
  fi
fi

API_PRIVATE_KEYS_DIR="$WORK_DIR" xcrun altool \
  --upload-app \
  -f "$IPA_PATH" \
  --type ios \
  --apiKey "$ASC_KEY_ID" \
  --apiIssuer "$ASC_ISSUER_ID"
