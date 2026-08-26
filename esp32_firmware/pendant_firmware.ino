/*
 * ===================================================================
 *  AURA SMART SAFETY PENDANT - FINAL PRODUCTION FIRMWARE
 * ===================================================================
 *  Board          : ESP32-S3 Super Mini
 *  Target Pin     : GPIO 3 (Push Button)
 *  Feedback Pins  : GPIO 5 (Status LED), GPIO 6 (Haptic Vibrator)
 *  Bluetooth Name : Safety_Pendant_S3 (ALWAYS ON 24/7)
 * 
 *  Gestures Configured on GPIO 3:
 *  - 2 Presses (Double Click) ➔ 0x02 : De-escalation Fake Call ("Dad Calling")
 *  - 2 Sec Hold (Long Press)  ➔ 0x08 : Full Emergency SOS (GPS + 10s Audio + Call)
 *  - 3 Presses (Triple Click) ➔ 0x03 : Stealth Silent SOS
 *  - 6 Rapid Presses          ➔ 0x06 : Cancel Emergency SOS
 * ===================================================================
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>

#define BUTTON_PIN 3  // Physical Button Pin (Verified!)
#define LED_PIN    5  // Status LED Pin
#define VIBE_PIN   6  // Haptic Motor Pin

// Custom BLE UUIDs
#define SERVICE_UUID        "4fa8c001-1402-4ca2-8979-45d4d9807601"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

// Gesture Payload Codes
#define GESTURE_NONE    0x00
#define GESTURE_DOUBLE  0x02  // 2 Presses -> Fake Call
#define GESTURE_TRIPLE  0x03  // 3 Presses -> Stealth SOS
#define GESTURE_CANCEL  0x06  // 6 Presses -> Cancel SOS
#define GESTURE_HOLD_2S 0x08  // 2 Sec Hold -> Full SOS

BLEServer *pServer = NULL;
BLECharacteristic *pCharacteristic = NULL;
bool deviceConnected = false;

class MyServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer *pServer) {
        deviceConnected = true;
        Serial.println("\n[BLE] Phone Connected over Bluetooth! Active & Ready.");
        
        // Double Haptic Buzz Feedback on Connection
        digitalWrite(VIBE_PIN, HIGH); digitalWrite(LED_PIN, HIGH); delay(120);
        digitalWrite(VIBE_PIN, LOW);  digitalWrite(LED_PIN, LOW);  delay(120);
        digitalWrite(VIBE_PIN, HIGH); digitalWrite(LED_PIN, HIGH); delay(120);
        digitalWrite(VIBE_PIN, LOW);  digitalWrite(LED_PIN, LOW);
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

    // 1. Check for 2-Second Hold
    while (digitalRead(BUTTON_PIN) == LOW) {
        yield();
        if (millis() - pressStartTime >= 2000) {
            isHold = true;
            break;
        }
        delay(10);
    }

    if (isHold) {
        Serial.println("\n[GESTURE DETECTED] -> 2-SEC HOLD (FULL SOS)");
        triggerHapticFeedback(1, 1500, 0); // 1 Long 1.5s vibration
        while (digitalRead(BUTTON_PIN) == LOW) delay(10);
        return GESTURE_HOLD_2S;
    }

    // 2. Count Clicks
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

    Serial.printf("\n[GESTURE DETECTED] -> Total Clicks: %d\n", clickCount);

    if (clickCount >= 6) {
        Serial.println("[ACTION] -> 6 Presses (CANCEL SOS)");
        triggerHapticFeedback(3, 100, 100);
        return GESTURE_CANCEL;
    } else if (clickCount == 3) {
        Serial.println("[ACTION] -> 3 Presses (STEALTH SOS)");
        triggerHapticFeedback(2, 200, 150);
        return GESTURE_TRIPLE;
    } else if (clickCount == 2) {
        Serial.println("[ACTION] -> 2 Presses (FAKE DAD CALL)");
        triggerHapticFeedback(1, 200, 0);
        return GESTURE_DOUBLE;
    }

    // Single click feedback
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
    Serial.println("  AURA SMART SAFETY PENDANT - FINAL PRODUCTION SYSTEM ");
    Serial.println("=======================================================");

    pinMode(BUTTON_PIN, INPUT_PULLUP);
    pinMode(LED_PIN, OUTPUT);
    pinMode(VIBE_PIN, OUTPUT);

    digitalWrite(LED_PIN, LOW);
    digitalWrite(VIBE_PIN, LOW);

    // Initial Startup Buzz
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

    Serial.println("[SYSTEM READY] Bluetooth ALWAYS ON & Advertising 'Safety_Pendant_S3'!\n");
}

void loop() {
    yield();

    if (digitalRead(BUTTON_PIN) == LOW) {
        uint8_t gesture = processButtonPresses();

        if (gesture != GESTURE_NONE && pCharacteristic != NULL && deviceConnected) {
            pCharacteristic->setValue(&gesture, 1);
            pCharacteristic->notify();
            Serial.printf("[BLE SENT] Gesture Code 0x%02X transmitted to Phone!\n", gesture);
        }
    }

    delay(20);
}
