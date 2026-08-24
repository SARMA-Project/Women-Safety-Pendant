/*
 * Smart Safety Pendant Firmware - ESP32-S3 Super Mini
 * Bluetooth ALWAYS ON (No Deep Sleep Mode)
 * 
 * Hardware Connections:
 * - Push Button : GPIO 4 (Internal Pull-Up to GND)
 * - Status LED  : GPIO 5 (via 330 ohm resistor)
 * - Mini Vibe   : GPIO 6 (via 2N2222 transistor)
 * 
 * Gestures Supported:
 * - Double Click (0x02)  : Fake Call ("Dad Calling")
 * - Triple Click (0x03)  : Stealth SOS
 * - Hold for 2s (0x08)   : Full Emergency SOS
 * - 6 Rapid Clicks (0x06): Cancel SOS
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>

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

class MyServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer *pServer) {
        deviceConnected = true;
        Serial.println("[BLE] Phone Connected! Bluetooth Active & Paired.");
        // Double vibrate on connection
        digitalWrite(VIBE_PIN, HIGH); digitalWrite(LED_PIN, HIGH); delay(120);
        digitalWrite(VIBE_PIN, LOW); digitalWrite(LED_PIN, LOW); delay(120);
        digitalWrite(VIBE_PIN, HIGH); digitalWrite(LED_PIN, HIGH); delay(120);
        digitalWrite(VIBE_PIN, LOW); digitalWrite(LED_PIN, LOW);
    }

    void onDisconnect(BLEServer *pServer) {
        deviceConnected = false;
        Serial.println("[BLE] Disconnected! Re-advertising Bluetooth immediately...");
        BLEDevice::startAdvertising();
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

    Serial.println("[BUTTON] Press detected...");

    // 1. Check 2-second hold
    while (digitalRead(BUTTON_PIN) == LOW) {
        delay(20);
        if (millis() - pressStartTime >= 2000) {
            isHold = true;
            break;
        }
    }

    if (isHold) {
        Serial.println("[GESTURE] -> Hold 2s (Full SOS)");
        triggerHapticFeedback(1, 1500, 0); // 1 Long vibration
        return GESTURE_HOLD_2S;
    }

    // 2. Count clicks
    int clickCount = 1;
    unsigned long lastReleaseTime = millis();

    while (millis() - lastReleaseTime < 400) {
        if (digitalRead(BUTTON_PIN) == LOW) {
            clickCount++;
            delay(40); // Debounce
            while (digitalRead(BUTTON_PIN) == LOW) {
                delay(10);
            }
            lastReleaseTime = millis();
        }
    }

    Serial.printf("[GESTURE] Total clicks: %d\n", clickCount);

    if (clickCount >= 6) {
        Serial.println("[GESTURE] -> 6 Rapid Clicks (CANCEL SOS)");
        triggerHapticFeedback(3, 100, 100);
        return GESTURE_CANCEL;
    } else if (clickCount == 3) {
        Serial.println("[GESTURE] -> Triple Click (Stealth SOS)");
        triggerHapticFeedback(2, 200, 150);
        return GESTURE_TRIPLE;
    } else if (clickCount == 2) {
        Serial.println("[GESTURE] -> Double Click (Fake Call)");
        triggerHapticFeedback(1, 200, 0);
        return GESTURE_DOUBLE;
    }

    // Single click feedback
    triggerHapticFeedback(1, 80, 0);
    return GESTURE_NONE;
}

void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println("\n=============================================");
    Serial.println("  ESP32-S3 SAFETY PENDANT - BLUETOOTH ALWAYS ON ");
    Serial.println("=============================================");

    pinMode(BUTTON_PIN, INPUT_PULLUP);
    pinMode(LED_PIN, OUTPUT);
    pinMode(VIBE_PIN, OUTPUT);

    digitalWrite(LED_PIN, LOW);
    digitalWrite(VIBE_PIN, LOW);

    // Initial power-on vibration test
    triggerHapticFeedback(1, 200, 0);

    // Initialize BLE Server (ALWAYS ON)
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

    Serial.println("[BLE] Bluetooth ALWAYS ON & Advertising 'Safety_Pendant_S3'...");
}

void loop() {
    // Check Button Input continuously (Always Active)
    if (digitalRead(BUTTON_PIN) == LOW) {
        uint8_t gesture = processButtonPresses();

        if (gesture != GESTURE_NONE && pCharacteristic != NULL && deviceConnected) {
            pCharacteristic->setValue(&gesture, 1);
            pCharacteristic->notify();
            Serial.printf("[BLE SENT] Gesture Code 0x%02X sent to Phone!\n", gesture);
        } else if (gesture != GESTURE_NONE && !deviceConnected) {
            Serial.println("[BLE WARNING] Gesture detected but phone not connected over Bluetooth!");
        }
    }

    delay(20); // Small loop delay
}
