# 🛡️ Aura Safety – Smart Women's Safety Wearable Pendant (ESP32-S3)

<div align="center">
  <img src="assets/logo.png" width="160" alt="Aura Safety Logo">
  <h3>BE SAFE. BE STRONG. BE YOU.</h3>
  <p>An Always-ON Wearable IoT Safety Pendant with Real-Time Web Bluetooth, Live GPS Tracking, Fake De-escalation Calling, and Immediate Emergency Dispatch.</p>

  [![Live Web App](https://img.shields.io/badge/Live%20App-GitHub%20Pages-E91E8C?style=for-the-badge&logo=github)](https://sarma-project.github.io/Women-Safety-Pendant/)
  [![Firmware](https://img.shields.io/badge/Firmware-ESP32--S3-7C3AED?style=for-the-badge&logo=arduino)](esp32_firmware/pendant_firmware.ino)
  [![Status](https://img.shields.io/badge/Status-Production%20Ready-10B981?style=for-the-badge)](#)
</div>

---

## 🌐 Live Production Application
Access the unified web application directly on any modern browser (Google Chrome on Android/Desktop recommended for Web Bluetooth):

👉 **[https://sarma-project.github.io/Women-Safety-Pendant/](https://sarma-project.github.io/Women-Safety-Pendant/)**

---

## 🌟 Key Features & Gestures

### 1. 📳 Double Click (`0x02`) — Fake "Dad Calling" De-escalation
* **Pendant Feedback**: 1 short 200ms haptic vibration ONLY (No LED flash for discretion).
* **Phone Screen Action**: Instantly launches an **authentic Android Google Phone (Google Dialer) UI** showing an incoming call from *"Dad"* with realistic ringtone, ripple animations, and an interactive 3×3 in-call controls grid (Record, Hold, Mute, Speaker, Video, and Google Gemini AI *"Summarise"* halo).
* **Purpose**: Allows a woman to smoothly excuse herself from uncomfortable or unsafe situations without raising suspicion.

### 2. 🚨 2-Second Button Hold (`0x08`) — Instant Full Emergency SOS
* **Pendant Feedback**: Status LED illuminates + Strong 1.5-second haptic vibration.
* **Immediate Action (0.0s Delay)**:
  - Fetches high-accuracy GPS coordinates (`latitude`, `longitude`, `accuracy`, `speed`).
  - Auto-triggers emergency phone call & SMS alert with live Google Maps navigation link.
  - Streams real-time telemetry to the **Parent Tracking Dashboard**.
  - Sounds a continuous loud **Emergency Siren Alarm** on the Parent Dashboard.
* **Parallel Background Audio (11s)**:
  - Simultaneously captures an 11-second ambient microphone recording in the background without delaying the primary alert, and delivers the audio snippet directly to the Parent Dashboard.

### 3. 👨‍👩‍👧 Zero-Disconnect Unified Architecture
* Seamlessly switch between the **Woman User Dashboard** and **Parent Tracking Dashboard** using the in-app header tabs without the Web Bluetooth connection ever disconnecting.
* **Parent Dashboard Controls**:
  - Live Carto Voyager Light Map with pulsing SOS pin and accuracy radius.
  - **`🔕 MUTE ALARM`**: Instantly silences the emergency siren alarm.
  - **`Call Police (100)`**: Direct speed-dial for Indian Emergency Police Helpline (`100`).
  - **`Open Maps`**: Opens exact Google Maps navigation pin in a single tap.
  - **10-Second Ambient Recording Player**: Instant playback of audio captured during the SOS trigger.

---

## 🔌 Hardware Pinout & Wiring

| Component | ESP32-S3 Pin | Wiring Details |
|---|---|---|
| **Push Button** | **GPIO 3** | Connected between `GPIO 3` and `GND` (Internal Pull-Up enabled). |
| **Status LED** | **GPIO 5** | Connected via `330Ω` current-limiting resistor to `GND`. |
| **Haptic Vibration Motor** | **GPIO 6** | Driven via `2N2222` NPN Transistor (Base to `GPIO 6` via `1kΩ` resistor, Flyback diode across motor). |
| **Buzzer** | ❌ **NONE** | Completely removed for silent, discreet wearable operation. |
| **Power Supply** | **3.7V LiPo** | Powered continuously via 3.7V Lithium-Polymer battery + TP4056 USB-C charging module (Always-ON). |

---

## 🛠️ Arduino IDE Setup & Flashing Instructions

1. Open **Arduino IDE** (v2.x recommended).
2. Install the **ESP32 by Espressif Systems** board package (`Tools` -> `Board` -> `Boards Manager` -> search for `esp32`).
3. Open [`esp32_firmware/pendant_firmware.ino`](esp32_firmware/pendant_firmware.ino).
4. Configure the following IDE settings:
   - **Board**: `ESP32S3 Dev Module`
   - **USB CDC On Boot**: `Enabled` ⚠️ *(CRITICAL for native USB Serial Monitor output over USB-C)*
   - **Flash Size**: `4MB` (or `8MB`)
   - **CPU Frequency**: `240MHz`
   - **Upload Speed**: `921600`
   - **Port**: Select the active COM port of your ESP32-S3.
5. Click **Upload** (➔).

---

## 📁 Repository Structure

```
├── assets/
│   └── logo.png                       # Official Aura Safety Logo
├── esp32_firmware/
│   └── pendant_firmware.ino           # ESP32-S3 Arduino C++ Always-ON BLE Firmware
├── .github/
│   └── workflows/
│       └── deploy-pages.yml           # Automated CI/CD GitHub Pages deployment
├── index.html                         # Unified Web App & PWA entry point
├── style.css                          # Master Light Theme stylesheet (Pink/Purple)
├── app.js                             # Unified Web Bluetooth, Map & Audio Engine
├── user.html                          # Standalone Woman User Dashboard
├── user.css                           # User Dashboard & Google Phone Dialer Styles
├── user.js                            # User Dashboard JavaScript Controller
├── parent.html                        # Standalone Parent Tracking Dashboard
├── parent.css                         # Parent Dashboard & Leaflet Map Styles
├── parent.js                          # Parent Dashboard JavaScript Controller
└── README.md                          # Project Documentation
```

---

## 📱 How to Use

1. **Power on the Pendant**: The vibration motor will give 1 short confirmation buzz on boot.
2. **Open the Web App**: Navigate to `https://sarma-project.github.io/Women-Safety-Pendant/` on Chrome (Android or PC).
3. **Pair Bluetooth**: Click **`PAIR ESP32-S3 PENDANT`** and select **`Safety_Pendant_S3`**. The pendant will buzz twice to confirm connection.
4. **Save Contact**: Enter your emergency contact number (e.g. `+91 98765 43210`) and click **Save Contact**.
5. **Testing Gestures**:
   - **Double Click Button**: Tests the incoming fake call screen with ringtone.
   - **Hold Button for 2 Seconds**: Dispatches instant Emergency SOS, opens SMS/Dialer, updates Parent map pin, sounds parent siren, and transfers background ambient audio.

---

<div align="center">
  <b>Developed with ❤️ for Women's Safety by SARMA Project</b>
</div>
