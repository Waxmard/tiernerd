#!/bin/bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
device="${1:-Gengar Phone}"
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://tiernerd-api-dev-1015723670625.us-east1.run.app}"
export EXPO_PUBLIC_GOOGLE_CLIENT_ID="${EXPO_PUBLIC_GOOGLE_CLIENT_ID:-1015723670625-c2nlt7fbkh28odv6557bvfhgrfjnd1k2.apps.googleusercontent.com}"
export EXPO_NO_DOTENV=1
export EXPO_PUBLIC_USE_MOCK_AUTH=false

node "$root/scripts/ios-config.mjs"
if ! command -v pod >/dev/null 2>&1; then
  echo 'CocoaPods is required. Install it with Homebrew (brew install cocoapods) and ensure pod is on PATH.' >&2
  exit 1
fi

cd "$root/frontend"
npx expo prebuild --platform ios --no-install
(cd ios && pod install)
xcrun xcodebuild -workspace ios/TierNerd.xcworkspace -scheme TierNerd -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath ios/DerivedData -allowProvisioningUpdates IPHONEOS_DEPLOYMENT_TARGET=15.1 build
xcrun devicectl list devices --timeout 10
xcrun devicectl device install app --device "$device" ios/DerivedData/Build/Products/Release-iphoneos/TierNerd.app
xcrun devicectl device process launch --device "$device" com.maxwellward.tiernerd
