/*
 * ESP32-S3 Super Mini - PIN DIAGNOSTIC & MULTI-PIN BUTTON DETECTOR
 * 
 * This code monitors GPIO 1, 2, 3, 4, 5, 7, 8 simultaneously.
 * Connect your 2-pin button:
 * - Wire 1 to GND
 * - Wire 2 to the pin labeled '4' (or 1, 2, 3)
 * 
 * Open Arduino IDE -> Tools -> Serial Monitor at 115200 baud.
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>

// Tested Pins
const int pinsToScan[] = {1, 2, 3, 4, 7, 8, 9};
const int pinCount = sizeof(pinsToScan) / sizeof(pinsToScan[0]);

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
int activeBtnPin = -1;

class MyServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer *pServer) {
        deviceConnected = true;
        Serial.println("[BLE] Phone Connected & Active!");
        digitalWrite(VIBE_PIN, HIGH); delay(150); digitalWrite(VIBE_PIN, LOW);
    }

    void onDisconnect(BLEServer *pServer) {
        deviceConnected = false;
        Serial.println("[BLE] Disconnected! Re-advertising...");
        BLEDevice::startAdvertising();
    }
};

void triggerVibration(int count, int durationMs) {
    for (int i = 0; i < count; i++) {
        digitalWrite(VIBE_PIN, HIGH);
        digitalWrite(LED_PIN, HIGH);
        delay(durationMs);
        digitalWrite(VIBE_PIN, LOW);
        digitalWrite(LED_PIN, LOW);
        if (i < count - 1) delay(100);
    }
}

uint8_t processPress(int btnPin) {
    unsigned long start = millis();
    bool isHold = false;

    Serial.printf("[BUTTON PRESS DETECTED] Pin GPIO %d pulled LOW!\n", btnPin);

    while (digitalRead(btnPin) == LOW) {
        delay(20);
        if (millis() - start >= 2000) {
            isHold = true;
            break;
        }
    }

    if (isHold) {
        Serial.printf("[GESTURE] GPIO %d -> Hold 2s (Full SOS)\n", btnPin);
        triggerVibration(1, 1500);
        return GESTURE_HOLD_2S;
    }

    int clicks = 1;
    unsigned long releaseTime = millis();

    while (millis() - releaseTime < 400) {
        if (digitalRead(btnPin) == LOW) {
            clicks++;
            delay(40);
            while (digitalRead(btnPin) == LOW) delay(10);
            releaseTime = millis();
        }
    }

    Serial.printf("[GESTURE] GPIO %d -> Clicks: %d\n", btnPin, clicks);

    if (clicks >= 6) {
        triggerVibration(3, 100);
        return GESTURE_CANCEL;
    } else if (clicks == 3) {
        triggerVibration(2, 200);
        return GESTURE_TRIPLE;
    } else if (clicks == 2) {
        triggerVibration(1, 200);
        return GESTURE_DOUBLE;
    }

    triggerVibration(1, 80); // Single click feedback
    return GESTURE_NONE;
}

void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println("\n=============================================");
    Serial.println("  ESP32-S3 MULTI-PIN BUTTON DETECTOR RUNNING  ");
    Serial.println("=============================================");

    pinMode(LED_PIN, OUTPUT);
    pinMode(VIBE_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);
    digitalWrite(VIBE_PIN, LOW);

    // Startup Haptic Buzz Test
    triggerVibration(1, 200);

    // Configure all candidate button pins with internal pull-up
    for (int i = 0; i < pinCount; i++) {
        pinMode(pinsToScan[i], INPUT_PULLUP);
        Serial.printf("Configured GPIO %d as INPUT_PULLUP\n", pinsToScan[i]);
    }

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

    Serial.println("[BLE] Ready & Advertising 'Safety_Pendant_S3'...");
}

void loop() {
    // Scan all pins for button press (LOW)
    for (int i = 0; i < pinCount; i++) {
        int pin = pinsToScan[i];
        if (digitalRead(pin) == LOW) {
            uint8_t gesture = processPress(pin);

            if (gesture != GESTURE_NONE && pCharacteristic != NULL && deviceConnected) {
                pCharacteristic->setValue(&gesture, 1);
                pCharacteristic->notify();
                Serial.printf("[BLE SENT] Gesture 0x%02X sent to Chrome Web App!\n", gesture);
            }
            break;
        }
    }

    delay(20);
}
