/*
 * Smart Safety Pendant Firmware - ESP32-S3 Super Mini
 * 
 * Pinout:
 * - Push Button: GPIO 4 (Internal Pull-Up to GND, Ext0 Deep Sleep Wakeup)
 * - Status LED: GPIO 5 (Connected via 330 ohm resistor)
 * - Mini Vibrator: GPIO 6 (Connected via NPN transistor base)
 * 
 * Gestures Supported:
 * - Double Click (0x02)  : De-escalation / Fake Call
 * - Triple Click (0x03)  : Stealth SOS (Discreet 2 vibes)
 * - Hold for 2s (0x08)   : Full Emergency SOS (Loud Alarm & Call)
 * - 6 Rapid Clicks (0x06): Cancel SOS (Grace period cancel)
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <esp_sleep.h>

#define BUTTON_PIN GPIO_NUM_4
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
    }

    void onDisconnect(BLEServer *pServer) {
        deviceConnected = false;
        // Restart advertising when disconnected
        pServer->getAdvertising()->start();
    }
};

void triggerHaptic(int count, int durationMs, int gapMs) {
    for (int i = 0; i < count; i++) {
        digitalWrite(VIBE_PIN, HIGH);
        digitalWrite(LED_PIN, HIGH);
        delay(durationMs);
        digitalWrite(VIBE_PIN, LOW);
        digitalWrite(LED_PIN, LOW);
        if (i < count - 1) delay(gapMs);
    }
}

void sendGesturePayload(uint8_t gestureCode) {
    if (pCharacteristic != NULL) {
        pCharacteristic->setValue(&gestureCode, 1);
        pCharacteristic->notify();
        Serial.printf("[BLE] Sent Gesture Code: 0x%02X\n", gestureCode);
    }
}

uint8_t detectGesture() {
    unsigned long pressStartTime = millis();
    bool isHolding = false;
    int clickCount = 0;
    unsigned long lastReleaseTime = millis();

    // Check initial press duration (detect 2-second hold)
    while (digitalRead(BUTTON_PIN) == LOW) {
        delay(50);
        if (millis() - pressStartTime >= 2000) {
            isHolding = true;
            break;
        }
    }

    if (isHolding) {
        // Hold for 2s detected
        triggerHaptic(1, 1500, 0); // 1 Long vibration
        return GESTURE_HOLD_2S;
    }

    // Otherwise, count rapid clicks within a 400ms inter-click window
    clickCount = 1;
    lastReleaseTime = millis();

    while (millis() - lastReleaseTime < 450) {
        if (digitalRead(BUTTON_PIN) == LOW) {
            clickCount++;
            delay(50); // Debounce
            while (digitalRead(BUTTON_PIN) == LOW) {
                delay(20);
            }
            lastReleaseTime = millis();
        }
    }

    Serial.printf("[GESTURE] Total clicks counted: %d\n", clickCount);

    if (clickCount >= 6) {
        triggerHaptic(3, 100, 100); // 3 rapid vibes for Cancel
        return GESTURE_CANCEL;
    } else if (clickCount == 3) {
        triggerHaptic(2, 200, 150); // 2 discreet vibes for Stealth
        return GESTURE_TRIPLE;
    } else if (clickCount == 2) {
        triggerHaptic(1, 200, 0);   // 1 vibe for Fake Call
        return GESTURE_DOUBLE;
    }

    return GESTURE_NONE;
}

void setup() {
    Serial.begin(115200);
    
    pinMode(BUTTON_PIN, INPUT_PULLUP);
    pinMode(LED_PIN, OUTPUT);
    pinMode(VIBE_PIN, OUTPUT);

    digitalWrite(LED_PIN, LOW);
    digitalWrite(VIBE_PIN, LOW);

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
    pAdvertising->setMinPreferred(0x06); // functions that help with iPhone connections
    pAdvertising->setMinPreferred(0x12);
    BLEDevice::startAdvertising();

    Serial.println("[SYSTEM] Safety Pendant BLE Ready & Advertising...");

    // Check wakeup cause
    esp_sleep_wakeup_cause_t wakeup_reason = esp_sleep_get_wakeup_cause();
    if (wakeup_reason == ESP_SLEEP_WAKEUP_EXT0) {
        Serial.println("[POWER] Woken up from Deep Sleep via Push Button!");
        
        // Wait briefly for BLE reconnect if paired
        unsigned long connWait = millis();
        while (!deviceConnected && (millis() - connWait < 3000)) {
            delay(100);
        }

        uint8_t gesture = detectGesture();
        if (gesture != GESTURE_NONE) {
            sendGesturePayload(gesture);
            delay(1500); // Allow BLE notification to complete transmission
        }
    } else {
        // First boot indication
        triggerHaptic(2, 100, 100);
    }

    // Configure wakeup for next sleep cycle
    esp_sleep_enable_ext0_wakeup(BUTTON_PIN, 0); // Wakeup when GPIO4 pulled LOW
    
    Serial.println("[POWER] Entering Deep Sleep mode (<15uA)...");
    delay(100);
    esp_deep_sleep_start();
}

void loop() {
    // Unreachable due to deep sleep architecture
}
