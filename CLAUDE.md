# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Financial Monitor** — a personal React Native/Expo app for tracking account balance, scanning receipts with AI, and planning upcoming expenses. Targets Android (portrait-only, dark theme). The entire app lives in a single file: `App.js`.

## Commands

```bash
# Install dependencies
npm install

# Run with Expo Go (scan QR on phone)
npx expo start

# Build a standalone APK via EAS cloud build
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

There are no tests, no linter config, and no type-checking setup.

## Architecture

Everything is in `App.js` (~600 lines). The structure within that file:

1. **API key** — `ANTHROPIC_API_KEY` constant at the top; required only for the Scan tab.
2. **Hardcoded data** — `BALANCE` (number) and `PLANNED` (array of expense objects). These are the only values to edit when updating personal finances.
3. **Color tokens** — `C` object with all theme colors; `SERIF`/`MONO` font constants per platform.
4. **State** — managed in the root `App` component with `useState`. No context, no state library.
5. **Receipt scanning flow** — `pickImage` → `processImage` (calls `https://api.anthropic.com/v1/messages` with `claude-sonnet-4-20250514`, sends base64 image) → `setEditFields` (editable preview) → `confirmScan` (appends to `receipts` array).
6. **Tabs** — `overview`, `scan`, `receipts`, `planned` — rendered inline with `{tab==='...' && (…)}` conditionals inside a single `ScrollView`.
7. **Styles** — one `StyleSheet.create` object `s` at the bottom.

## Key Conventions

- All amounts are formatted with `fmt()` (German locale: `1.234,56`).
- Category values are one of: `Food | Transport | Health | Tech | Utilities | Shopping | Entertainment | Other`. The `CAT_ICONS` map and `editFields.category` must use these exact strings.
- The `PLANNED` array items use `urgent: true/false` to split them into two groups in the Planned tab; the hardcoded count labels ("URGENT (3)", "OPTIONAL (4)") must be updated manually if items are added/removed.
- Receipt objects added to `receipts` state use `nextId` ref (starts at 100) for keys.

## Build Configuration

- `app.json` — app name, Android package `com.personal.financialmonitor`, `versionCode` (increment for each new APK install).
- `eas.json` — both `preview` and `production` profiles build an APK (`buildType: "apk"`); no AAB.
- Expo SDK 51, React Native 0.74.
