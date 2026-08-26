/*
 * ESP32-S3 Super Mini - PIN DIAGNOSTIC (TESTING GPIO 1, 2, 3, 4, 5, 6, 7)
 * 
 * Touch GND wire to GPIO 1, GPIO 2, GPIO 3, GPIO 4, or GPIO 5 one by one!
 * Serial Monitor at 115200 baud will show which pin responds!
 */

#include <Arduino.h>

#define VIBE_PIN 6
#define LED_PIN 5

// Test pins: GPIO 1, GPIO 2, GPIO 3, GPIO 4, GPIO 7
const int testPins[] = {1, 2, 3, 4, 7};
const int count = 5;

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n=================================================");
    Serial.println("  ESP32-S3 WIRE TOUCH TEST (GPIO 1, 2, 3, 4, 7) ");
    Serial.println("=================================================");

    pinMode(LED_PIN, OUTPUT);
    pinMode(VIBE_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);
    digitalWrite(VIBE_PIN, LOW);

    // Initial Test Buzz (Vibrates once on boot)
    digitalWrite(VIBE_PIN, HIGH);
    digitalWrite(LED_PIN, HIGH);
    delay(300);
    digitalWrite(VIBE_PIN, LOW);
    digitalWrite(LED_PIN, LOW);

    for (int i = 0; i < count; i++) {
        pinMode(testPins[i], INPUT_PULLUP);
        Serial.printf("Configured GPIO %d as INPUT_PULLUP\n", testPins[i]);
    }

    Serial.println("\n[READY] Take your GND wire and touch pins 1, 2, 3, 4, or 7!");
}

void loop() {
    yield();

    for (int i = 0; i < count; i++) {
        int pin = testPins[i];
        int val = digitalRead(pin);

        if (val == LOW) {
            Serial.printf("\n>>> SUCCESS! WIRE TOUCH DETECTED ON GPIO %d <<<\n", pin);
            
            // Buzz Motor & Flash LED
            digitalWrite(VIBE_PIN, HIGH);
            digitalWrite(LED_PIN, HIGH);
            delay(300);
            digitalWrite(VIBE_PIN, LOW);
            digitalWrite(LED_PIN, LOW);

            // Wait until wire is disconnected
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
