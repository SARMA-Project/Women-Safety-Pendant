/*
 * STEP 2: ESP32-S3 BLE BLUETOOTH PAIRING FIRMWARE
 * 
 * Target Pin: GPIO 3 (Verified in Step 1)
 * Device Name: Safety_Pendant_S3
 * 
 * Arduino IDE Settings:
 * - Board: ESP32S3 Dev Module
 * - USB CDC On Boot: Enabled
 */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>

#define BUTTON_PIN 3 // Verified physical pin from Step 1!

// Custom BLE UUIDs
#define SERVICE_UUID        "4fa8c001-1402-4ca2-8979-45d4d9807601"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

BLEServer *pServer = NULL;
BLECharacteristic *pCharacteristic = NULL;
bool deviceConnected = false;

class MyServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer *pServer) {
        deviceConnected = true;
        Serial.println("\n[BLE EVENT] >>> PHONE CONNECTED TO ESP32-S3 OVER BLUETOOTH! <<<");
    }

    void onDisconnect(BLEServer *pServer) {
        deviceConnected = false;
        Serial.println("\n[BLE EVENT] Phone Disconnected. Re-advertising Bluetooth immediately...");
        BLEDevice::startAdvertising();
    }
};

void setup() {
    Serial.begin(115200);

    unsigned long startWait = millis();
    while (!Serial && (millis() - startWait < 3000)) {
        delay(10);
    }

    Serial.println("\n=======================================================");
    Serial.println("  STEP 2: ESP32-S3 BLE BLUETOOTH PAIRING FIRMWARE    ");
    Serial.println("=======================================================");

    pinMode(BUTTON_PIN, INPUT_PULLUP);

    // Initialize BLE Server
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

    Serial.println("[BLE READY] Bluetooth ALWAYS ON & Advertising 'Safety_Pendant_S3'!");
    Serial.println("[INSTRUCTION] Open Web App in Chrome & tap 'PAIR ESP32-S3 PENDANT'!\n");
}

void loop() {
    yield();

    // Check GPIO 3 wire touch
    if (digitalRead(BUTTON_PIN) == LOW) {
        Serial.println("\n>>> GPIO 3 TOUCH DETECTED! Sending BLE Payload... <<<");

        if (pCharacteristic != NULL && deviceConnected) {
            uint8_t payload = 0x02; // Test Payload
            pCharacteristic->setValue(&payload, 1);
            pCharacteristic->notify();
            Serial.println("[BLE SENT] Payload 0x02 sent over Bluetooth to Chrome Web App!");
        } else {
            Serial.println("[BLE NOTICE] Touch detected, but phone is not paired yet over Bluetooth!");
        }

        while (digitalRead(BUTTON_PIN) == LOW) {
            yield();
            delay(10);
        }
        Serial.println("[RELEASED] GPIO 3 wire disconnected.\n");
        delay(100);
    }

    delay(20);
}
