/*
 * PURE SERIAL MONITOR WIRE TEST (NO LED, NO MOTOR, NO BUZZER)
 * 
 * Instructions:
 * 1. Upload code to ESP32-S3.
 * 2. Open Arduino IDE -> Tools -> Serial Monitor at 115200 baud.
 * 3. Take 1 wire connected to GND.
 * 4. Touch the other end to physical pins 1, 2, 3, 4, or 7.
 * 5. See which GPIO number prints on screen!
 */

#include <Arduino.h>

const int testPins[] = {1, 2, 3, 4, 7};
const int count = 5;

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n=================================================");
    Serial.println("  PURE WIRE TEST (NO LED / NO MOTOR / NO BUZZER) ");
    Serial.println("=================================================");

    for (int i = 0; i < count; i++) {
        pinMode(testPins[i], INPUT_PULLUP);
        Serial.printf("Configured GPIO %d as INPUT_PULLUP\n", testPins[i]);
    }

    Serial.println("\n[READY] Touch GND wire to physical pins 1, 2, 3, 4, or 7!");
}

void loop() {
    yield();

    for (int i = 0; i < count; i++) {
        int pin = testPins[i];
        if (digitalRead(pin) == LOW) {
            Serial.printf("\n>>> SUCCESS! WIRE TOUCHED TO GROUND ON GPIO %d <<<\n", pin);

            while (digitalRead(pin) == LOW) {
                yield();
                delay(10);
            }
            Serial.printf("[RELEASED] GPIO %d disconnected from GND.\n\n", pin);
            delay(100);
        }
    }

    delay(20);
}
