# 💰 Financial Monitor — Android App

Built with **React Native + Expo**. Runs on any Android phone in minutes.

---

## ⚡ Quick Start (5 minutes)

### Step 1 — Install tools (once)
```bash
# Install Node.js from https://nodejs.org  (LTS version)
# Then in terminal:
npm install -g expo-cli
```

### Step 2 — Set up the project
```bash
cd financial-monitor
npm install
```

### Step 3 — Run on your Android phone
```bash
npm run android
# or
npx expo start
```

1. Install **Expo Go** from Google Play Store on your phone
2. Open Expo Go → scan the QR code shown in terminal
3. The app loads instantly on your phone ✅

---

## 📱 Build a standalone APK (no Expo Go needed)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login / create free Expo account
eas login

# Build APK for Android
eas build -p android --profile preview
```

EAS will build the APK in the cloud and give you a download link.  
Install it on any Android phone directly.

---

## 📁 Project Structure

```
financial-monitor/
├── App.js          ← All app logic & UI (edit data here)
├── app.json        ← App name, version, Android package ID
├── package.json    ← Dependencies
└── babel.config.js ← Build config
```

## ✏️ Updating your data

Open `App.js` and find these two constants near the top:

```js
const BALANCE = 3824.60;   // ← your current account balance

const planned = [          // ← your planned expenses
  { name: 'Штраф', label: 'Fine', amount: 500, icon: '⚠️', urgent: true },
  ...
];
```

Change any values and save — the app hot-reloads instantly.

---

## 🔧 Requirements
- Node.js 18+
- Android phone with Expo Go (for development)
- Or EAS free account (for standalone APK)
