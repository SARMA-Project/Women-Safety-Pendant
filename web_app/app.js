// ==========================================================
// AURA SAFETY PENDANT WEB COMPANION - APP ENGINE
// ==========================================================

const SUPABASE_URL = 'https://YOUR_SUPABASE_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Service & Characteristic UUIDs
const SERVICE_UUID = "4fa8c001-1402-4ca2-8979-45d4d9807601";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

let bleDevice = null;
let bleCharacteristic = null;
let graceTimer = null;
let graceCountdown = 10;
let isGraceActive = false;
let pendingSosType = '';
let callTimer = null;
let callSeconds = 0;
let emergencyContact = localStorage.getItem('pendant_contact') || '+1234567890';

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('contact-phone').value = emergencyContact;

    // 1. Web Bluetooth Pairing
    document.getElementById('btn-connect-ble').addEventListener('click', async () => {
        try {
            console.log('Requesting Bluetooth Device...');
            bleDevice = await navigator.bluetooth.requestDevice({
                filters: [{ name: 'Safety_Pendant_S3' }],
                optionalServices: [SERVICE_UUID]
            });

            bleDevice.addEventListener('gattserverdisconnected', onDisconnected);

            const server = await bleDevice.gatt.connect();
            const service = await server.getPrimaryService(SERVICE_UUID);
            bleCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

            await bleCharacteristic.startNotifications();
            bleCharacteristic.addEventListener('characteristicvaluechanged', handleGestureNotification);

            updateConnectionStatus(true);
            alert('Connected successfully to Safety Pendant S3!');
        } catch (err) {
            console.error('BLE Connection Failed:', err);
            alert('Bluetooth Connection Error: ' + err.message);
        }
    });

    // 2. Save Contact Button
    document.getElementById('btn-save-contact').addEventListener('click', () => {
        emergencyContact = document.getElementById('contact-phone').value;
        localStorage.setItem('pendant_contact', emergencyContact);
        alert('Emergency Contact Saved: ' + emergencyContact);
    });

    // 3. Fake Call Handlers
    document.getElementById('btn-decline-call').addEventListener('click', stopFakeCall);
    document.getElementById('btn-accept-call').addEventListener('click', acceptFakeCall);
    document.getElementById('btn-cancel-grace').addEventListener('click', cancelGracePeriod);
});

function updateConnectionStatus(isConnected) {
    const pill = document.getElementById('ble-status-pill');
    const text = document.getElementById('ble-status-text');
    if (isConnected) {
        text.innerText = 'CONNECTED';
        pill.className = 'status-pill status-connected';
    } else {
        text.innerText = 'DISCONNECTED';
        pill.className = 'status-pill status-disconnected';
    }
}

function onDisconnected() {
    console.log('BLE Disconnected!');
    updateConnectionStatus(false);
}

// Global simulator function for testing gestures on screen
window.simulateGesture = function(gestureCode) {
    console.log('Simulating Gesture Code: 0x' + gestureCode.toString(16));
    handleGestureCode(gestureCode);
};

function handleGestureNotification(event) {
    const value = event.target.value.getUint8(0);
    console.log('Received BLE Gesture Payload: 0x' + value.toString(16));
    handleGestureCode(value);
}

function handleGestureCode(value) {
    switch (value) {
        case 0x02: // Double Click -> Fake Call ("Dad Calling")
            showFakeCallOverlay();
            break;
        case 0x03: // Triple Click -> Stealth SOS
            startGracePeriod('stealth');
            break;
        case 0x08: // Hold 2s -> Full SOS
            startGracePeriod('full');
            break;
        case 0x06: // 6 Clicks -> Cancel SOS
            cancelGracePeriod();
            break;
    }
}

// Fake Call System
function showFakeCallOverlay() {
    const overlay = document.getElementById('fake-call-overlay');
    const ringtone = document.getElementById('ringtone-audio');
    
    overlay.classList.remove('hidden');
    ringtone.currentTime = 0;
    ringtone.play().catch(e => console.log('Audio autoplay blocked', e));
}

function acceptFakeCall() {
    const ringtone = document.getElementById('ringtone-audio');
    ringtone.pause();
    document.getElementById('btn-accept-call').parentElement.style.display = 'none';
    
    callSeconds = 0;
    document.getElementById('call-status-text').innerText = '00:00 - Connected';

    if (callTimer) clearInterval(callTimer);
    callTimer = setInterval(() => {
        callSeconds++;
        const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
        const secs = String(callSeconds % 60).padStart(2, '0');
        document.getElementById('call-status-text').innerText = `${mins}:${secs} - Connected`;
    }, 1000);
}

function stopFakeCall() {
    const overlay = document.getElementById('fake-call-overlay');
    const ringtone = document.getElementById('ringtone-audio');
    ringtone.pause();
    if (callTimer) clearInterval(callTimer);
    overlay.classList.add('hidden');
    document.getElementById('btn-accept-call').parentElement.style.display = 'flex';
    document.getElementById('call-status-text').innerText = 'Mobile Incoming Call...';
}

// 10-Second Grace Window Cancel Controller
function startGracePeriod(sosType) {
    isGraceActive = true;
    pendingSosType = sosType;
    graceCountdown = 10;

    const graceBar = document.getElementById('grace-bar');
    document.getElementById('grace-seconds').innerText = graceCountdown;
    graceBar.classList.remove('hidden');

    if (graceTimer) clearInterval(graceTimer);

    graceTimer = setInterval(() => {
        graceCountdown--;
        document.getElementById('grace-seconds').innerText = graceCountdown;

        if (graceCountdown <= 0) {
            clearInterval(graceTimer);
            graceBar.classList.add('hidden');
            if (isGraceActive) {
                isGraceActive = false;
                executeEmergencyDispatch(pendingSosType);
            }
        }
    }, 1000);
}

function cancelGracePeriod() {
    if (isGraceActive) {
        isGraceActive = false;
        if (graceTimer) clearInterval(graceTimer);
        document.getElementById('grace-bar').classList.add('hidden');
        alert('SOS CANCELLED BY BUTTON GESTURE!');
    }
}

// Emergency SOS Dispatcher
async function executeEmergencyDispatch(sosType) {
    console.log('Dispatching Emergency SOS:', sosType);

    navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

        // Record 10-second audio snippet
        const audioBlob = await record10sAudio();

        // Send Emergency SMS via tel/sms protocol link
        const smsMessage = encodeURIComponent(
            sosType === 'stealth' 
                ? `STEALTH SOS! I need help. Location: ${mapsUrl}` 
                : `FULL EMERGENCY SOS! Urgent help needed! Location: ${mapsUrl}`
        );

        window.location.href = `sms:${emergencyContact}?body=${smsMessage}`;

        if (sosType === 'full') {
            setTimeout(() => {
                window.location.href = `tel:${emergencyContact}`;
            }, 1000);
        }

    }, (err) => {
        console.error('Geolocation Error:', err);
    }, { enableHighAccuracy: true });
}

// 10-Second Audio Recorder
function record10sAudio() {
    return new Promise((resolve) => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            resolve(null);
            return;
        }

        navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
            const mediaRecorder = new MediaRecorder(stream);
            const audioChunks = [];

            mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/m4a' });
                resolve(resolve(audioBlob));
            };

            mediaRecorder.start();
            setTimeout(() => mediaRecorder.stop(), 10000);
        }).catch(err => {
            console.error('Microphone error:', err);
            resolve(null);
        });
    });
}
