# SwiftPay Native 2.0

This branch is a real Android Native UI implementation using Java + XML. The active application does **not** use WebView or Capacitor to render the interface.

## Preserved reference
The original `www/` directory is intentionally retained as the reference for the old SwiftPay design and feature behavior. It is not loaded by `MainActivity`.

## Main native features
- Arabic RTL native UI
- Home dashboard
- Jawwal Pay / PalPay transfer wizard
- Native USSD via TelephonyManager on Android 8+
- SIM selection on Dual-SIM devices
- Jawwal balance card with balance extraction and last-update time
- Local transaction history
- Favorites
- PIN setting entry point
- Dark visual system matching the old app
- No WebView dependency

## Build
Use GitHub Actions workflow `.github/workflows/build-apk.yml` to build `app-debug.apk`.
