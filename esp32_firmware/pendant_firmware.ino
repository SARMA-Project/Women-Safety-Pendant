/*
 * ESP32-S3 SUPER MINI - PIN DIAGNOSTIC & BUTTON TROUBLESHOOTER
 * 
 * This code monitors GPIO 1, 2, 3, 4, 5, 7, 8, 9, 10 simultaneously.
 * Prints current pin states to Serial Monitor every 2 seconds.
 * 
 * Troubleshooting Steps:
 * 1. Open Serial Monitor at 115200 baud.
 * 2. Take a jumper wire connected to GND.
 * 3. Touch the other end of the wire directly to physical pin headers (1, 2, 3, 4, etc.).
 * 4. See which GPIO number responds!
 */

#include <Arduino.h>

const int pins[] = {1, 2, 3, 4, 5, 7, 8, 9, 10};
const int pinCount = sizeof(pins) / sizeof(pins[0]);

#define LED_PIN 5
#define VIBE_PIN 6

unsigned long lastPrintTime = 0;

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n=======================================================");
    Serial.println("  ESP32-S3 PIN TROUBLESHOOTER & DIAGNOSTIC INITIALIZED ");
    Serial.println("=======================================================");

    pinMode(LED_PIN, OUTPUT);
    pinMode(VIBE_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);
    digitalWrite(VIBE_PIN, LOW);

    // Initial Vibration Test (Buzzes 2 times on power up)
    for (int i = 0; i < 2; i++) {
        digitalWrite(VIBE_PIN, HIGH);
        digitalWrite(LED_PIN, HIGH);
        delay(150);
        digitalWrite(VIBE_PIN, LOW);
        digitalWrite(LED_PIN, LOW);
        delay(150);
    }

    // Configure all candidate pins with internal pull-up
    for (int i = 0; i < pinCount; i++) {
        pinMode(pins[i], INPUT_PULLUP);
    }

    Serial.println("[READY] Touch any pin with a GND wire or press button to test!\n");
}

void loop() {
    yield();

    // 1. Instant Detection Loop
    for (int i = 0; i < pinCount; i++) {
        int p = pins[i];
        if (digitalRead(p) == LOW) {
            Serial.printf("\n*** SUCCESS! GROUND DETECTED ON GPIO %d ***\n", p);
            
            digitalWrite(VIBE_PIN, HIGH);
            digitalWrite(LED_PIN, HIGH);
            delay(250);
            digitalWrite(VIBE_PIN, LOW);
            digitalWrite(LED_PIN, LOW);

            while (digitalRead(p) == LOW) {
                yield();
                delay(10);
            }
            Serial.printf("[RELEASED] GPIO %d back to HIGH.\n\n", p);
            delay(100);
        }
    }

    // 2. Periodic Live Status Display (Every 2 seconds)
    if (millis() - lastPrintTime > 2000) {
        lastPrintTime = millis();
        Serial.print("[LIVE PINS] ");
        for (int i = 0; i < pinCount; i++) {
            Serial.printf("G%d:%s ", pins[i], digitalRead(pins[i]) == LOW ? "LOW(GND)" : "HIGH");
        }
        Serial.println();
    }

    delay(20);
}
