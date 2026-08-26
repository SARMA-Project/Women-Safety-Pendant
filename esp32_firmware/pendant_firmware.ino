/*
 * ESP32-S3 SUPER MINI - NATIVE USB CDC SERIAL TEST
 * 
 * ARDUINO IDE BOARD SETTINGS (CRITICAL):
 * 1. Board: "ESP32S3 Dev Module"
 * 2. USB CDC On Boot: "Enabled"   <-- (MUST BE ENABLED FOR USB-C SERIAL!)
 * 3. Upload Mode: "UART0 / Hardware CDC"
 */

#include <Arduino.h>

const int testPins[] = {1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13};
const int count = 11;

unsigned long lastTimer = 0;

void setup() {
    // Initialize Native USB Serial
    Serial.begin(115200);

    // Wait up to 3 seconds for Serial Monitor connection
    unsigned long startWait = millis();
    while (!Serial && (millis() - startWait < 3000)) {
        delay(10);
    }

    Serial.println("\n=======================================================");
    Serial.println("  ESP32-S3 NATIVE USB CDC SERIAL MONITOR INITIALIZED   ");
    Serial.println("=======================================================");

    for (int i = 0; i < count; i++) {
        pinMode(testPins[i], INPUT_PULLUP);
    }

    Serial.println("[SYSTEM READY] Touch GND wire to pins 1, 2, 3, 4, 7, 8, 9, 10, 11, 12, or 13!\n");
}

void loop() {
    yield();

    // 1. Check for wire touch (LOW)
    for (int i = 0; i < count; i++) {
        int pin = testPins[i];
        if (digitalRead(pin) == LOW) {
            Serial.printf("\n>>> SUCCESS! WIRE TOUCH DETECTED ON GPIO %d <<<\n", pin);

            while (digitalRead(pin) == LOW) {
                yield();
                delay(10);
            }
            Serial.printf("[RELEASED] GPIO %d disconnected from GND.\n\n", pin);
            delay(100);
        }
    }

    // 2. Heartbeat Ping every 2 seconds
    if (millis() - lastTimer > 2000) {
        lastTimer = millis();
        Serial.println("[ESP32-S3 ALIVE] Heartbeat ping... Waiting for wire touch...");
    }

    delay(20);
}
