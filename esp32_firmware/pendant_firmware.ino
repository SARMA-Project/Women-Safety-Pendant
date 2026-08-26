/*
 * ===================================================================
 *  AURA ALWAYS-ON SAFETY PENDANT FIRMWARE (NO BUZZER / ALWAYS ON)
 * ===================================================================
 *  Board          : ESP32-S3 Super Mini
 *  Power          : Always-ON (3.7V LiPo Battery + TP4056 Charger)
 *  Push Button    : GPIO 3 (Internal Pullup to GND)
 *  Status LED     : GPIO 5 (via 330 ohm resistor)
 *  Vibration Motor: GPIO 6 (via 2N2222 NPN transistor & 1k resistor)
 *  Bluetooth Name : Safety_Pendant_S3 (ALWAYS ON 24/7)
 * ===================================================================
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>

#define BUTTON_PIN 3  // Verified Push Button Pin
#define LED_PIN    5  // Status LED Pin (No buzzer!)
#define VIBE_PIN   6  // Haptic Vibration Motor Pin

// Custom BLE UUIDs
#define SERVICE_UUID        "4fa8c001-1402-4ca2-8979-45d4d9807601"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// Gesture Payload Codes
#define GESTURE_NONE    0x00
#define GESTURE_DOUBLE  0x02  // 2 Presses -> Fake Call ("Dad Calling")
#define GESTURE_HOLD_2S 0x08  // 2 Sec Hold -> Full Emergency SOS

BLEServer *pServer = NULL;
BLECharacteristic *pCharacteristic = NULL;
bool deviceConnected = false;

class MyServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer *pServer) {
        deviceConnected = true;
        Serial.println("\n[BLE] Phone Connected over Bluetooth!");
        
        // Double Haptic Buzz + LED Flash on Bluetooth Connection
        for (int i = 0; i < 2; i++) {
            digitalWrite(VIBE_PIN, HIGH);
            digitalWrite(LED_PIN, HIGH);
            delay(120);
            digitalWrite(VIBE_PIN, LOW);
            digitalWrite(LED_PIN, LOW);
            delay(120);
        }
    }

    void onDisconnect(BLEServer *pServer) {
        deviceConnected = false;
        Serial.println("\n[BLE] Phone Disconnected. Re-advertising Bluetooth 24/7...");
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

    // 1. Check 2-Second Hold
    while (digitalRead(BUTTON_PIN) == LOW) {
        yield();
        if (millis() - pressStartTime >= 2000) {
            isHold = true;
            break;
        }
        delay(10);
    }

    if (isHold) {
        Serial.println("\n[GESTURE DETECTED] -> 2-SEC HOLD (FULL EMERGENCY SOS)");
        triggerHapticFeedback(1, 1500, 0); // 1 Long 1.5s vibration + LED ON
        while (digitalRead(BUTTON_PIN) == LOW) delay(10);
        return GESTURE_HOLD_2S;
    }

    // 2. Count Clicks for Double Press
    int clickCount = 1;
    unsigned long lastReleaseTime = millis();

    while (millis() - lastReleaseTime < 400) {
        yield();
        if (digitalRead(BUTTON_PIN) == LOW) {
            clickCount++;
            delay(40); // Debounce
            while (digitalRead(BUTTON_PIN) == LOW) delay(10);
            lastReleaseTime = millis();
        }
        delay(10);
    }

    Serial.printf("\n[GESTURE DETECTED] -> Clicks: %d\n", clickCount);

    if (clickCount == 2) {
        Serial.println("[ACTION] -> 2 Presses (FAKE DAD CALL)");
        triggerHapticFeedback(1, 200, 0); // 1 Short 200ms vibration + LED flash
        return GESTURE_DOUBLE;
    }

    // Single press feedback
    triggerHapticFeedback(1, 80, 0);
    return GESTURE_NONE;
}

void setup() {
    Serial.begin(115200);

    unsigned long startWait = millis();
    while (!Serial && (millis() - startWait < 3000)) {
        delay(10);
    }

    Serial.println("\n=======================================================");
    Serial.println("  AURA ALWAYS-ON SAFETY PENDANT FIRMWARE RUNNING       ");
    Serial.println("=======================================================");

    pinMode(BUTTON_PIN, INPUT_PULLUP);
    pinMode(LED_PIN, OUTPUT);
    pinMode(VIBE_PIN, OUTPUT);

    digitalWrite(LED_PIN, LOW);
    digitalWrite(VIBE_PIN, LOW);

    // Initial Always-ON Startup Buzz (1 Short Vibration)
    triggerHapticFeedback(1, 200, 0);

    // Initialize BLE Server (ALWAYS ON 24/7)
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

    Serial.println("[BLE READY] Bluetooth ALWAYS ON & Advertising 'Safety_Pendant_S3'!\n");
}

void loop() {
    yield();

    if (digitalRead(BUTTON_PIN) == LOW) {
        uint8_t gesture = processButtonPresses();

        if (gesture != GESTURE_NONE && pCharacteristic != NULL && deviceConnected) {
            pCharacteristic->setValue(&gesture, 1);
            pCharacteristic->notify();
            Serial.printf("[BLE SENT] Gesture Payload 0x%02X transmitted over Bluetooth!\n", gesture);
        }
    }

    delay(20);
}
