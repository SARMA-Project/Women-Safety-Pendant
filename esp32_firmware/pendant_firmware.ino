/*
 * ===================================================================
 *  AURA ALWAYS-ON SAFETY PENDANT FIRMWARE
 * ===================================================================
 *  Push Button    : GPIO 3
 *  Status LED     : GPIO 5 (2 sec hold ONLY)
 *  Vibration Motor: GPIO 6 (all gestures)
 * ===================================================================
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>

#define BUTTON_PIN 3
#define LED_PIN    5
#define VIBE_PIN   6

#define SERVICE_UUID        "4fa8c001-1402-4ca2-8979-45d4d9807601"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

#define GESTURE_NONE    0x00
#define GESTURE_DOUBLE  0x02
#define GESTURE_HOLD_2S 0x08

BLEServer *pServer = NULL;
BLECharacteristic *pCharacteristic = NULL;
bool deviceConnected = false;

class MyServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer *pServer) {
        deviceConnected = true;
        Serial.println("\n[BLE] Phone Connected!");
        // 2 quick vibrations only on connect, NO LED
        for (int i = 0; i < 2; i++) {
            digitalWrite(VIBE_PIN, HIGH);
            delay(120);
            digitalWrite(VIBE_PIN, LOW);
            delay(120);
        }
    }

    void onDisconnect(BLEServer *pServer) {
        deviceConnected = false;
        Serial.println("\n[BLE] Disconnected. Re-advertising...");
        BLEDevice::startAdvertising();
    }
};

uint8_t processButtonPresses() {
    unsigned long pressStartTime = millis();
    bool isHold = false;

    while (digitalRead(BUTTON_PIN) == LOW) {
        yield();
        if (millis() - pressStartTime >= 2000) {
            isHold = true;
            break;
        }
        delay(10);
    }

    if (isHold) {
        Serial.println("\n[GESTURE] -> 2-SEC HOLD (EMERGENCY SOS)");
        // 2 sec hold: LED ON + Long vibration (1.5s)
        digitalWrite(LED_PIN, HIGH);
        digitalWrite(VIBE_PIN, HIGH);
        delay(1500);
        digitalWrite(VIBE_PIN, LOW);
        digitalWrite(LED_PIN, LOW);
        while (digitalRead(BUTTON_PIN) == LOW) delay(10);
        return GESTURE_HOLD_2S;
    }

    int clickCount = 1;
    unsigned long lastReleaseTime = millis();

    while (millis() - lastReleaseTime < 400) {
        yield();
        if (digitalRead(BUTTON_PIN) == LOW) {
            clickCount++;
            delay(40);
            while (digitalRead(BUTTON_PIN) == LOW) delay(10);
            lastReleaseTime = millis();
        }
        delay(10);
    }

    Serial.printf("\n[GESTURE] -> Clicks: %d\n", clickCount);

    if (clickCount == 2) {
        Serial.println("[ACTION] -> 2 Presses (FAKE DAD CALL)");
        // 2 presses: vibration ONLY (no LED flash)
        digitalWrite(VIBE_PIN, HIGH);
        delay(200);
        digitalWrite(VIBE_PIN, LOW);
        return GESTURE_DOUBLE;
    }

    // Single click: vibration only
    digitalWrite(VIBE_PIN, HIGH);
    delay(80);
    digitalWrite(VIBE_PIN, LOW);
    return GESTURE_NONE;
}

void setup() {
    Serial.begin(115200);

    unsigned long startWait = millis();
    while (!Serial && (millis() - startWait < 3000)) delay(10);

    Serial.println("\n=======================================================");
    Serial.println("  AURA ALWAYS-ON SAFETY PENDANT FIRMWARE               ");
    Serial.println("=======================================================");

    pinMode(BUTTON_PIN, INPUT_PULLUP);
    pinMode(LED_PIN, OUTPUT);
    pinMode(VIBE_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);
    digitalWrite(VIBE_PIN, LOW);

    // Power-on vibration only (no LED on boot)
    digitalWrite(VIBE_PIN, HIGH);
    delay(200);
    digitalWrite(VIBE_PIN, LOW);

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

    Serial.println("[READY] Bluetooth ALWAYS ON - Advertising 'Safety_Pendant_S3'\n");
}

void loop() {
    yield();

    if (digitalRead(BUTTON_PIN) == LOW) {
        uint8_t gesture = processButtonPresses();

        if (gesture != GESTURE_NONE && pCharacteristic != NULL && deviceConnected) {
            pCharacteristic->setValue(&gesture, 1);
            pCharacteristic->notify();
            Serial.printf("[BLE SENT] Gesture 0x%02X sent!\n", gesture);
        }
    }

    delay(20);
}
