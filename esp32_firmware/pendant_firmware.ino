/*
 * Smart Safety Pendant Firmware - ESP32-S3 Super Mini (VERIFIED & DEBUGGED)
 * 
 * Hardware Connections:
 * - Push Button : GPIO 4 (Internal Pull-Up to GND, Ext0 Deep Sleep Wakeup)
 * - Status LED  : GPIO 5 (via 330 ohm resistor to GND)
 * - Mini Vibe   : GPIO 6 (via 2N2222 transistor base to GND)
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <esp_sleep.h>

#define BUTTON_PIN 4
#define LED_PIN 5
#define VIBE_PIN 6

// Custom BLE UUIDs
#define SERVICE_UUID        "4fa8c001-1402-4ca2-8979-45d4d9807601"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// Gesture Codes
#define GESTURE_NONE        0x00
#define GESTURE_DOUBLE      0x02
#define GESTURE_TRIPLE      0x03
#define GESTURE_CANCEL      0x06
#define GESTURE_HOLD_2S     0x08

BLEServer *pServer = NULL;
BLECharacteristic *pCharacteristic = NULL;
bool deviceConnected = false;
unsigned long lastActivityTime = 0;

class MyServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer *pServer) {
        deviceConnected = true;
        Serial.println("[BLE] Phone / App Connected!");
        // 2 Quick vibrations on connection
        digitalWrite(VIBE_PIN, HIGH); delay(100); digitalWrite(VIBE_PIN, LOW); delay(100);
        digitalWrite(VIBE_PIN, HIGH); delay(100); digitalWrite(VIBE_PIN, LOW);
    }

    void onDisconnect(BLEServer *pServer) {
        deviceConnected = false;
        Serial.println("[BLE] Disconnected. Restarting Advertising...");
        pServer->getAdvertising()->start();
    }
};

void triggerHapticFeedback(int count, int durationMs, int gapMs) {
    for (int i = 0; i < count; i++) {
        digitalWrite(VIBE_PIN, HIGH);
        digitalWrite(LED_PIN, HIGH);
        delay(durationMs);
        digitalWrite(VIBE_PIN, LOW);
        digitalWrite(LED_PIN, LOW);
        if (i < count - 1) delay(gapMs);
    }
}

uint8_t processButtonPresses() {
    unsigned long pressStartTime = millis();
    bool isHold = false;

    Serial.println("[BUTTON] Press detected! Measuring duration...");

    // 1. Check if user is holding button for 2 seconds
    while (digitalRead(BUTTON_PIN) == LOW) {
        delay(20);
        if (millis() - pressStartTime >= 2000) {
            isHold = true;
            break;
        }
    }

    if (isHold) {
        Serial.println("[GESTURE DETECTED] -> Hold for 2 Seconds (Full SOS)");
        triggerHapticFeedback(1, 1500, 0); // 1 Long vibration
        return GESTURE_HOLD_2S;
    }

    // 2. Count multi-clicks (Double, Triple, 6 Clicks)
    int clickCount = 1;
    unsigned long lastReleaseTime = millis();

    while (millis() - lastReleaseTime < 400) {
        if (digitalRead(BUTTON_PIN) == LOW) {
            clickCount++;
            Serial.printf("[BUTTON] Click #%d\n", clickCount);
            delay(40); // Debounce
            while (digitalRead(BUTTON_PIN) == LOW) {
                delay(10);
            }
            lastReleaseTime = millis();
        }
    }

    Serial.printf("[GESTURE RESULT] Total clicks: %d\n", clickCount);

    if (clickCount >= 6) {
        Serial.println("[GESTURE DETECTED] -> 6 Rapid Clicks (CANCEL SOS)");
        triggerHapticFeedback(3, 100, 100);
        return GESTURE_CANCEL;
    } else if (clickCount == 3) {
        Serial.println("[GESTURE DETECTED] -> Triple Click (Stealth SOS)");
        triggerHapticFeedback(2, 200, 150);
        return GESTURE_TRIPLE;
    } else if (clickCount == 2) {
        Serial.println("[GESTURE DETECTED] -> Double Click (Fake Call)");
        triggerHapticFeedback(1, 200, 0);
        return GESTURE_DOUBLE;
    }

    // Single click test feedback
    Serial.println("[GESTURE DETECTED] -> Single Click Test");
    triggerHapticFeedback(1, 80, 0);
    return GESTURE_NONE;
}

void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println("\n=============================================");
    Serial.println("  ESP32-S3 SMART SAFETY PENDANT INITIALIZING  ");
    Serial.println("=============================================");

    pinMode(BUTTON_PIN, INPUT_PULLUP);
    pinMode(LED_PIN, OUTPUT);
    pinMode(VIBE_PIN, OUTPUT);

    digitalWrite(LED_PIN, LOW);
    digitalWrite(VIBE_PIN, LOW);

    // Initial hardware test vibration (Vibrates once on power up)
    triggerHapticFeedback(1, 200, 0);

    // Initialize BLE
    BLEDevice::init("Safety_Pendant_S3");
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new MyServerCallbacks());

    BLEService *pService = pServer->createService(SERVICE_UUID);
    pCharacteristic = pService->createCharacteristic(
        CHARACTERISTIC_UUID,
        BLECharacteristic::PROPERTY_READ |
        BLECharacteristic::PROPERTY_NOTIFY
    );

    pService->start();

    BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    BLEDevice::startAdvertising();

    Serial.println("[BLE] Advertising 'Safety_Pendant_S3'... Ready to pair!");
    lastActivityTime = millis();
}

void loop() {
    // 1. Check Button Press
    if (digitalRead(BUTTON_PIN) == LOW) {
        lastActivityTime = millis();
        uint8_t gesture = processButtonPresses();

        if (gesture != GESTURE_NONE && pCharacteristic != NULL && deviceConnected) {
            pCharacteristic->setValue(&gesture, 1);
            pCharacteristic->notify();
            Serial.printf("[BLE SENT] Gesture Code 0x%02X transmitted to Phone!\n", gesture);
        } else if (gesture != GESTURE_NONE && !deviceConnected) {
            Serial.println("[BLE WARNING] Gesture detected but Phone not connected over BLE!");
        }
    }

    // 2. Deep Sleep Auto-Timeout (Enters sleep after 60 seconds of inactivity)
    if (millis() - lastActivityTime > 60000 && !deviceConnected) {
        Serial.println("[POWER] 60s inactivity. Entering Deep Sleep mode...");
        esp_sleep_enable_ext0_wakeup((gpio_num_t)BUTTON_PIN, 0);
        delay(100);
        esp_deep_sleep_start();
    }

    delay(20);
}
