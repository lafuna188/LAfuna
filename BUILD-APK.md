# 📦 Build the APK — Step by Step

This builds a real `.apk` file you can install on any Android phone.
The build runs on Expo's **free cloud servers** — your PC just sends the code.

---

## ✅ Before you start

1. Create a FREE account at **https://expo.dev** (just email + password)
2. Make sure Node.js is installed (you already did this)

---

## 🔑 Step 0 — Enable receipt scanning (optional)

If you want the Scan tab to work:

1. Get an API key at **https://console.anthropic.com** → API Keys
2. Open `App.js` in Notepad
3. Find this line near the top:
   ```js
   const ANTHROPIC_API_KEY = '';
   ```
4. Paste your key between the quotes:
   ```js
   const ANTHROPIC_API_KEY = 'sk-ant-xxxxxxxxxxxx';
   ```
5. Save the file

*(Skip this if you only want the balance + planning tabs — they work without a key.)*

---

## 🛠️ Build the APK

Open PowerShell in the `financial-monitor` folder and run these one at a time:

```powershell
npm install -g eas-cli
```

```powershell
eas login
```
*(enter your expo.dev email + password)*

```powershell
npm install
```

```powershell
eas build -p android --profile preview
```

---

## ⏳ What happens next

- EAS uploads your project and builds it in the cloud (takes ~10–20 min)
- When done, the terminal shows a **download link**
- Open that link → download the `.apk`
- Transfer it to your phone (or open the link on your phone directly)
- Tap the APK to install — allow "Install from unknown sources" if asked ✅

You can also see all your builds at: **https://expo.dev** → your project → Builds

---

## 🔄 Updating the app later

Change anything in `App.js`, then just run again:
```powershell
eas build -p android --profile preview
```
A fresh APK is built. Install it over the old one.

---

## ⚠️ Notes

- First build is slowest; later ones are faster
- The free tier allows a limited number of builds per month — plenty for personal use
- The APK is for **your personal use** — if you put your API key in it, don't share the APK with others (they could read your key)
