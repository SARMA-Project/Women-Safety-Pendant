# 🛡️ Smart Safety Pendant (ESP32-S3 Super Mini)

A complete A-to-Z safety ecosystem featuring an ESP32-S3 Super Mini pendant, Android companion application, Supabase cloud backend, and responsive live location & audio web tracker.

---

## 🌟 Unique Gesture Features

- **Double Click (`0x02`)**: **De-escalation / Fake Call**. Instantly launches a realistic full-screen incoming call UI showing "Dad Calling" with ringtone playback to allow the victim to excuse herself safely from uncomfortable situations.
- **Triple Click (`0x03`)**: **Stealth SOS**. Silent emergency alert (vibrates 2 times discreetly on pendant, no sound/light on phone). Captures 10-second ambient audio, streams location every 5 seconds, and dispatches SMS with live web map link.
- **Hold for 2 Seconds (`0x08`)**: **Full Emergency SOS**. High-priority alarm. Auto-dials emergency contacts via native PSTN call, streams location every 5s, uploads 10s audio snippet, and flashes LED/vibration motor.
- **6 Rapid Clicks (`0x06`)**: **Cancel SOS**. Grace period cancellation sequence within 10 seconds to abort false alarms.

---

## 📁 Repository Structure

- `esp32_firmware/pendant_firmware.ino` -> Arduino C++ code for ESP32-S3 Super Mini (BLE, Deep Sleep, Gestures, Haptic Motor).
- `mobile_app/` -> Complete Android Native Companion App source code (BLE Service, FakeCallActivity, AudioRecorder, LocationStreamer).
- `web_tracker/` -> Free Web Live Tracker (Leaflet.js + Supabase JS) hostable on Vercel or GitHub Pages.
- `supabase_setup/schema.sql` -> Database schema, Realtime policies, and Storage Bucket rules.
- `.github/workflows/build-apk.yml` -> Automated CI/CD workflow to compile `app-debug.apk` automatically on GitHub.

---

## 🚀 Setup Instructions (A to Z)

### Step 1: Set Up Free Supabase Backend
1. Create a free account at [Supabase.com](https://supabase.com).
2. Create a new project.
3. Open the **SQL Editor** tab and paste the contents of `supabase_setup/schema.sql`, then click **Run**.
4. Go to **Project Settings -> API** and copy your **Project URL** and **Anon Public Key**.

### Step 2: Configure Web Tracker (Free Hosting)
1. Edit `web_tracker/app.js` lines 6–7 and insert your `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
2. Deploy the `web_tracker/` folder to **Vercel** or **GitHub Pages** (100% Free).

### Step 3: Flash ESP32-S3 Firmware
1. Open `esp32_firmware/pendant_firmware.ino` in Arduino IDE.
2. Select Board: **ESP32S3 Dev Module**.
3. Wire hardware according to schematic:
   - Push Button: **GPIO 4**
   - Status LED: **GPIO 5**
   - Mini Vibrator Motor: **GPIO 6** (via 2N2222 Transistor)
4. Upload code to ESP32-S3 Super Mini.

### Step 4: Build / Install Mobile App APK
- **Option A (Automatic via GitHub)**: Push this repository to GitHub. Open the **Actions** tab, click **Build Android Safety Pendant APK**, and download the pre-compiled `app-debug.apk` artifact!
- **Option B (Local Build)**: Open `mobile_app/` in Android Studio, update `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `BleService.kt`, and click **Build -> Build APK**.
