/*
 * STEP 1: ESP32-S3 STABLE HARDWARE BUTTON TEST (NO-CRASH & WATCHDOG SAFE)
 * 
 * Fixes:
 * - Added yield() to feed FreeRTOS watchdog (Prevents WDT Timeout / Guru Meditation crash)
 * - Added non-blocking button sampling
 */

#include <Arduino.h>

#define BUTTON_PIN 4
#define VIBE_PIN 6
#define LED_PIN 5

unsigned long lastDebounceTime = 0;
bool lastButtonState = HIGH;
bool buttonState = HIGH;

void setup() {
    Serial.begin(115200);
    delay(1000); // Allow Serial connection to stabilize

    Serial.println("\n=============================================");
    Serial.println("  STEP 1: ESP32-S3 STABLE HARDWARE BUTTON TEST");
    Serial.println("=============================================");

    pinMode(BUTTON_PIN, INPUT_PULLUP);
    pinMode(LED_PIN, OUTPUT);
    pinMode(VIBE_PIN, OUTPUT);

    digitalWrite(LED_PIN, LOW);
    digitalWrite(VIBE_PIN, LOW);

    // Initial Vibration Test on Power Up (Buzzes once for 200ms)
    digitalWrite(VIBE_PIN, HIGH);
    digitalWrite(LED_PIN, HIGH);
    delay(200);
    digitalWrite(VIBE_PIN, LOW);
    digitalWrite(LED_PIN, LOW);
    Serial.println("[TEST] Startup Vibration Complete! Press button now...");
}

void loop() {
    // Feed FreeRTOS Watchdog to prevent Core 1 WDT Panic
    yield();

    int reading = digitalRead(BUTTON_PIN);

    // Debounce Logic
    if (reading != lastButtonState) {
        lastDebounceTime = millis();
    }

    if ((millis() - lastDebounceTime) > 50) {
        if (reading != buttonState) {
            buttonState = reading;

            if (buttonState == LOW) {
                Serial.println("\n>>> SUCCESS! Button Press Detected on GPIO 4 <<<");
                
                // Trigger Feedback
                digitalWrite(VIBE_PIN, HIGH);
                digitalWrite(LED_PIN, HIGH);
                delay(200);
                digitalWrite(VIBE_PIN, LOW);
                digitalWrite(LED_PIN, LOW);
            } else {
                Serial.println("[RELEASED] Button Released.");
            }
        }
    }

    lastButtonState = reading;
    delay(10); // Non-blocking delay to yield CPU time to FreeRTOS
}
