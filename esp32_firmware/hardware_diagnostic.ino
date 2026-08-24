/*
 * ESP32-S3 Super Mini - HARDWARE DIAGNOSTIC TEST FIRMWARE
 * 
 * This diagnostic code scans ALL available GPIO pins (0 to 10) simultaneously.
 * Open Arduino IDE -> Tools -> Serial Monitor at 115200 baud.
 * 
 * Touch or press your 2-pin button connected to GND and any pin.
 * The monitor will instantly print which exact pin is activated!
 */

#include <Arduino.h>

const int testPins[] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
const int numPins = sizeof(testPins) / sizeof(testPins[0]);

#define LED_PIN 5
#define VIBE_PIN 6

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("\n==================================================");
    Serial.println("  ESP32-S3 HARDWARE PIN DIAGNOSTIC TEST RUNNING   ");
    Serial.println("==================================================");
    Serial.println("Scanning pins: GPIO 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10...");
    Serial.println("Connect 1 wire of button to GND and 1 wire to ANY PIN.");
    Serial.println("Press the button to test!\n");

    pinMode(LED_PIN, OUTPUT);
    pinMode(VIBE_PIN, OUTPUT);

    // Set all test pins to INPUT_PULLUP
    for (int i = 0; i < numPins; i++) {
        pinMode(testPins[i], INPUT_PULLUP);
    }

    // Startup Test: Blink LED & Vibe 3 times
    for (int i = 0; i < 3; i++) {
        digitalWrite(LED_PIN, HIGH);
        digitalWrite(VIBE_PIN, HIGH);
        delay(100);
        digitalWrite(LED_PIN, LOW);
        digitalWrite(VIBE_PIN, LOW);
        delay(100);
    }
}

void loop() {
    for (int i = 0; i < numPins; i++) {
        int pin = testPins[i];
        if (digitalRead(pin) == LOW) {
            Serial.printf(">>> BUTTON PRESS DETECTED ON GPIO %d ! <<<\n", pin);
            
            // Visual & Haptic Feedback
            digitalWrite(LED_PIN, HIGH);
            digitalWrite(VIBE_PIN, HIGH);
            delay(200);
            digitalWrite(LED_PIN, LOW);
            digitalWrite(VIBE_PIN, LOW);

            // Wait for button release
            while (digitalRead(pin) == LOW) {
                delay(10);
            }
            Serial.printf("[RELEASED] GPIO %d released.\n", pin);
            delay(100); // Debounce
        }
    }
    delay(20);
}
