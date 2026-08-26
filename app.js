// ==========================================================
// AURA SAFETY SYSTEM - SCROLLABLE UNIFIED APP ENGINE
// ==========================================================

const SUPABASE_URL = 'https://YOUR_SUPABASE_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// BLE Configuration
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

// Parent Map Globals
let map = null, marker = null, circle = null;
let currentLat = 20.5937, currentLng = 78.9629;
let isMapInitialized = false;

// 1. Tab Switching Function
window.switchTab = function(tabName) {
    const userTab = document.getElementById('tab-user');
    const parentTab = document.getElementById('tab-parent');
    const userPage = document.getElementById('user-page');
    const parentPage = document.getElementById('parent-page');

    if (tabName === 'user') {
        userTab.classList.add('active-tab');
        parentTab.classList.remove('active-tab');
        userPage.classList.remove('hidden');
        parentPage.classList.add('hidden');
    } else if (tabName === 'parent') {
        parentTab.classList.add('active-tab');
        userTab.classList.remove('active-tab');
        parentPage.classList.remove('hidden');
        userPage.classList.add('hidden');

        // Initialize Parent Map (Zero permission required)
        setTimeout(() => {
            initParentMap();
        }, 100);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('contact-phone').value = emergencyContact;

    // Web Bluetooth Connect Button
    document.getElementById('btn-connect-ble').addEventListener('click', async () => {
        try {
            console.log('Requesting Bluetooth Device...');
            
            // Flexible Bluetooth Request (Accepts Safety_Pendant_S3 or all devices)
            bleDevice = await navigator.bluetooth.requestDevice({
                filters: [{ name: 'Safety_Pendant_S3' }],
                optionalServices: [SERVICE_UUID]
            }).catch(async () => {
                return await navigator.bluetooth.requestDevice({
                    acceptAllDevices: true,
                    optionalServices: [SERVICE_UUID]
                });
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

    // Save Contact
    document.getElementById('btn-save-contact').addEventListener('click', () => {
        emergencyContact = document.getElementById('contact-phone').value;
        localStorage.setItem('pendant_contact', emergencyContact);
        alert('Emergency Contact Saved: ' + emergencyContact);
    });

    // Fake Call Handlers
    document.getElementById('btn-decline-call').addEventListener('click', stopFakeCall);
    document.getElementById('btn-accept-call').addEventListener('click', acceptFakeCall);
    document.getElementById('btn-cancel-grace').addEventListener('click', cancelGracePeriod);

    // Map Recenter
    document.getElementById('btn-recenter-map')?.addEventListener('click', () => {
        if (map && currentLat !== 0 && currentLng !== 0) {
            map.setView([currentLat, currentLng], 16, { animate: true });
        }
    });
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

// 2. Global Software System Simulator Trigger
window.triggerGesture = function(gestureCode) {
    console.log('Triggering Gesture Code: 0x' + gestureCode.toString(16));
    handleGestureCode(gestureCode);
};

function handleGestureNotification(event) {
    const value = event.target.value.getUint8(0);
    handleGestureCode(value);
}

function handleGestureCode(value) {
    switch (value) {
        case 0x02: // 2 Presses -> Fake Call ("Dad Calling")
            showFakeCallOverlay();
            break;
        case 0x08: // 2 Sec Hold -> Full Emergency SOS
            startGracePeriod('full');
            break;
        case 0x03: // 3 Presses -> Stealth SOS
            startGracePeriod('stealth');
            break;
        case 0x06: // 6 Presses -> Cancel SOS
            cancelGracePeriod();
            break;
    }
}

// Fake Call System (2 Presses)
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
        alert('SOS CANCELLED BY GESTURE!');
    }
}

// Emergency SOS Dispatcher (2 Sec Hold)
async function executeEmergencyDispatch(sosType) {
    console.log('Dispatching Emergency SOS:', sosType);

    navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

        // 1. Update Parent Page Live Map & Telemetry Details
        updateParentMapPosition(lat, lng, pos.coords.accuracy, pos.coords.speed);

        // 2. Record 10-second ambient audio snippet
        const audioBlob = await record10sAudio();
        if (audioBlob) {
            const audioPlayer = document.getElementById('audio-player');
            audioPlayer.src = URL.createObjectURL(audioBlob);
            document.getElementById('audio-container').classList.remove('hidden');
        }

        // 3. Dispatch SMS link alert
        const smsMessage = encodeURIComponent(
            sosType === 'stealth' 
                ? `STEALTH SOS! I need help. Location: ${mapsUrl}` 
                : `FULL EMERGENCY SOS! Urgent help needed! Location: ${mapsUrl}`
        );

        window.location.href = `sms:${emergencyContact}?body=${smsMessage}`;

        // 4. Auto-dial Phone Call
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
            resolve(null); return;
        }

        navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
            const mediaRecorder = new MediaRecorder(stream);
            const audioChunks = [];
            mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/m4a' });
                resolve(audioBlob);
            };

            mediaRecorder.start();
            setTimeout(() => mediaRecorder.stop(), 10000);
        }).catch(err => {
            console.error('Microphone error:', err);
            resolve(null);
        });
    });
}

// ==========================================================
// PARENT LIVE MAP TRACKER ENGINE (ZERO PERMISSIONS REQUIRED)
// ==========================================================
function initParentMap() {
    if (isMapInitialized) {
        if (map) map.invalidateSize();
        return;
    }

    isMapInitialized = true;
    map = L.map('map').setView([currentLat, currentLng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const customIcon = L.divIcon({
        className: 'pulse-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    marker = L.marker([currentLat, currentLng], { icon: customIcon }).addTo(map);
    circle = L.circle([currentLat, currentLng], { radius: 15, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.2 }).addTo(map);

    setTimeout(() => {
        if (map) map.invalidateSize();
    }, 200);
}

function updateParentMapPosition(lat, lng, accuracy = 10, speed = 0) {
    currentLat = lat;
    currentLng = lng;
    const latLng = [lat, lng];

    if (marker && circle && map) {
        marker.setLatLng(latLng);
        circle.setLatLng(latLng);
        circle.setRadius(accuracy);
        map.setView(latLng, 16, { animate: true });
    }

    document.getElementById('detail-status').innerText = 'EMERGENCY SOS ACTIVE';
    document.getElementById('detail-battery').innerText = '95%';
    document.getElementById('detail-speed').innerText = `${(speed || 0).toFixed(1)} km/h`;
    document.getElementById('detail-accuracy').innerText = `${(accuracy || 0).toFixed(0)} meters`;
    document.getElementById('time-stamp').innerText = `Last Updated: ${new Date().toLocaleTimeString()}`;
}
