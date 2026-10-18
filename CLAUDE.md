# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**VoiceGuard** — a personal React Native/Expo app for real-time voice behavior monitoring. Uses the microphone to detect when the user is speaking too loudly (e.g. while drinking) or too fast (ADHD/stimulant use), then alerts via vibration and/or TTS. Targets Android (portrait-only, dark theme). The entire app lives in a single file: `App.js`.

## Commands

```bash
# Install dependencies (includes expo-av, expo-speech, expo-haptics, expo-keep-awake, async-storage)
npm install

# Run with Expo Go (scan QR on phone) — grant microphone permission when prompted
npx expo start

# Build a standalone APK via EAS cloud build
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

There are no tests, no linter config, and no type-checking setup.

## Architecture

Everything is in `App.js` (~550 lines). Structure within that file:

1. **Constants** — `DEFAULT_SETTINGS` and `DEFAULT_BASELINE` objects define all user-configurable defaults. `STORAGE` holds AsyncStorage key names.
2. **Color tokens** — `C` object with all theme colors; `SERIF`/`MONO` font constants per platform.
3. **State** — root `App` component. Critical: `settingsRef` and `baselineRef` mirror their state counterparts so `setInterval` closures (which capture stale values) always see current settings.
4. **Audio engine** — `startMonitoring` creates an `Audio.Recording` with `isMeteringEnabled: true`, polls `getStatusAsync()` every 150 ms via `setInterval`. `smoothDb` is a 10-sample rolling average of `st.metering`.
5. **Alert logic** in `pollMonitor`:
   - **Volume alert**: if `smoothDb > baseline.avgDb + settings.volumeThresholdDb` sustained for `settings.durationMs` → `triggerAlert('volume')`
   - **Speed alert**: VAD counts speech segment starts per minute; if rate exceeds `baseline.speechRate × settings.speedMultiplier` → `triggerAlert('speed')`
   - 15-second (configurable) cooldown prevents alert spam via `cooldownRef`.
6. **Calibration** — 30-second recording computes `avgDb` and `speechRate` (VAD segments/min), persisted to AsyncStorage.
7. **Tabs** — `monitor`, `calibrate`, `history`, `settings` — rendered inline with `{tab==='...' && …}` inside a single `ScrollView`.
8. **Styles** — one `StyleSheet.create` object `s` at the bottom; `StepRow` is a separate stepper component.

## Key Conventions

- `settingsRef.current` and `baselineRef.current` must be updated whenever their state counterparts change (done in `saveSettings`/`saveBaseline`). Never read `settings` or `baseline` directly inside `setInterval` callbacks — use the refs.
- `triggerAlert` checks `cooldownRef.current` as a guard; always set `cooldownRef.current = true` at entry.
- The VAD voice floor is `baseline.avgDb - 22` dBFS (fixed offset). Do not use `DEFAULT_BASELINE.avgDb` for this — use `baselineRef.current.avgDb` so it reflects calibration.
- `cleanupAudio()` must be safe to call multiple times (guards with null checks).

## Build Configuration

- `app.json` — app name `VoiceGuard`, Android package `com.personal.voiceguard`, `versionCode` (increment for each new APK install). Android `RECORD_AUDIO` permission declared here; iOS `NSMicrophoneUsageDescription` also set.
- `eas.json` — both `preview` and `production` profiles build an APK (`buildType: "apk"`); no AAB.
- Expo SDK 51, React Native 0.74.
- New packages vs original repo: `expo-av ~14.0.7`, `expo-speech ~12.0.2`, `expo-haptics ~13.0.1`, `expo-keep-awake ~13.0.2`, `@react-native-async-storage/async-storage 1.23.1`.
