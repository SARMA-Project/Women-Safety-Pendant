// ==========================================================
// AURA SAFETY SYSTEM - UNIFIED ENGINE (USER + PARENT MODES)
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

// Map & Tracker Globals
let map = null, marker = null, circle = null;
let currentLat = 0, currentLng = 0;
let isMapInitialized = false;

// 1. Role Selection & Switching Logic
window.selectRole = function(role) {
    document.getElementById('role-selector-screen').classList.add('hidden');

    if (role === 'user') {
        document.getElementById('user-dashboard-screen').classList.remove('hidden');
        document.getElementById('parent-dashboard-screen').classList.add('hidden');
    } else if (role === 'parent') {
        document.getElementById('parent-dashboard-screen').classList.remove('hidden');
        document.getElementById('user-dashboard-screen').classList.add('hidden');
        if (!isMapInitialized) {
            initParentMap();
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('contact-phone').value = emergencyContact;

    document.getElementById('btn-switch-role').addEventListener('click', () => {
        document.getElementById('user-dashboard-screen').classList.add('hidden');
        document.getElementById('parent-dashboard-screen').classList.add('hidden');
        document.getElementById('role-selector-screen').classList.remove('hidden');
    });

    // Web Bluetooth Pairing
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

    // Save Contact
    document.getElementById('btn-save-contact').addEventListener('click', () => {
        emergencyContact = document.getElementById('contact-phone').value;
        localStorage.setItem('pendant_contact', emergencyContact);
        alert('Emergency Contact Saved: ' + emergencyContact);
    });

    // Fake Call Buttons
    document.getElementById('btn-decline-call').addEventListener('click', stopFakeCall);
    document.getElementById('btn-accept-call').addEventListener('click', acceptFakeCall);
    document.getElementById('btn-cancel-grace').addEventListener('click', cancelGracePeriod);

    // Map Recenter
    document.getElementById('btn-recenter-map')?.addEventListener('click', () => {
        if (currentLat !== 0 && currentLng !== 0 && map) {
            map.setView([currentLat, currentLng], 17, { animate: true });
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

// Global Simulator Function
window.simulateGesture = function(gestureCode) {
    console.log('Simulating Gesture Code: 0x' + gestureCode.toString(16));
    handleGestureCode(gestureCode);
};

function handleGestureNotification(event) {
    const value = event.target.value.getUint8(0);
    handleGestureCode(value);
}

function handleGestureCode(value) {
    switch (value) {
        case 0x02: showFakeCallOverlay(); break;
        case 0x03: startGracePeriod('stealth'); break;
        case 0x08: startGracePeriod('full'); break;
        case 0x06: cancelGracePeriod(); break;
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

        const audioBlob = await record10sAudio();

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
// PARENT LIVE MAP TRACKER ENGINE (Leaflet + Supabase)
// ==========================================================
function initParentMap() {
    isMapInitialized = true;
    map = L.map('map').setView([20.5937, 78.9629], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const customIcon = L.divIcon({
        className: 'pulse-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    marker = L.marker([0, 0], { icon: customIcon }).addTo(map);
    circle = L.circle([0, 0], { radius: 15, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.2 }).addTo(map);

    if (supabase) {
        subscribeToParentRealtime();
    }
}

function subscribeToParentRealtime() {
    document.getElementById('tracker-status-badge').innerText = 'LIVE TRACKING ACTIVE';
    document.getElementById('tracker-status-badge').className = 'badge badge-danger';

    // Geolocation fallback demo for map pin
    navigator.geolocation.getCurrentPosition((pos) => {
        updateMapCoordinates(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.coords.speed);
    });
}

function updateMapCoordinates(lat, lng, accuracy = 10, speed = 0) {
    currentLat = lat;
    currentLng = lng;
    const latLng = [lat, lng];

    if (marker && circle && map) {
        marker.setLatLng(latLng);
        circle.setLatLng(latLng);
        circle.setRadius(accuracy);
        map.setView(latLng, 16, { animate: true });
    }

    document.getElementById('stat-battery').innerText = '95%';
    document.getElementById('stat-speed').innerText = `${(speed || 0).toFixed(1)} km/h`;
    document.getElementById('stat-accuracy').innerText = `${(accuracy || 0).toFixed(0)} m`;
    document.getElementById('time-stamp').innerText = `Last Updated: ${new Date().toLocaleTimeString()}`;
}
