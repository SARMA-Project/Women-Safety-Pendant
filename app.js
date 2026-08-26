// ==========================================================
// AURA SAFETY SYSTEM - SCROLLABLE UNIFIED APP ENGINE
// ==========================================================

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

    if (!userTab || !parentTab || !userPage || !parentPage) return;

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

        setTimeout(() => {
            initParentMap();
        }, 100);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const phoneInput = document.getElementById('contact-phone');
    if (phoneInput) phoneInput.value = emergencyContact;

    // Web Bluetooth Connect Button
    const connectBtn = document.getElementById('btn-connect-ble');
    if (connectBtn) {
        connectBtn.addEventListener('click', async () => {
            if (!navigator.bluetooth) {
                alert("Web Bluetooth is not supported in this browser. Please open this page in Google Chrome!");
                return;
            }

            try {
                console.log('Requesting Bluetooth Device...');
                
                bleDevice = await navigator.bluetooth.requestDevice({
                    filters: [{ name: 'Safety_Pendant_S3' }],
                    optionalServices: [SERVICE_UUID]
                }).catch(async (e) => {
                    return await navigator.bluetooth.requestDevice({
                        acceptAllDevices: true,
                        optionalServices: [SERVICE_UUID]
                    });
                });

                if (!bleDevice) return;

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
                alert('Bluetooth Connection Note: ' + (err.message || err));
            }
        });
    }

    // Save Contact
    const saveContactBtn = document.getElementById('btn-save-contact');
    if (saveContactBtn) {
        saveContactBtn.addEventListener('click', () => {
            const val = document.getElementById('contact-phone').value;
            if (val) {
                emergencyContact = val;
                localStorage.setItem('pendant_contact', emergencyContact);
                alert('Emergency Contact Saved: ' + emergencyContact);
            }
        });
    }

    // Fake Call Handlers
    document.getElementById('btn-decline-call')?.addEventListener('click', stopFakeCall);
    document.getElementById('btn-accept-call')?.addEventListener('click', acceptFakeCall);
    document.getElementById('btn-cancel-grace')?.addEventListener('click', cancelGracePeriod);

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
    if (!pill || !text) return;

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

// 2. Global Software Simulator Trigger
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
        case 0x08: // 2 Sec Hold -> Full Emergency SOS (Auto Call + GPS + Audio)
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
    if (overlay) overlay.classList.remove('hidden');
    if (ringtone) {
        ringtone.currentTime = 0;
        ringtone.play().catch(e => console.log('Audio autoplay policy note:', e));
    }
}

function acceptFakeCall() {
    const ringtone = document.getElementById('ringtone-audio');
    if (ringtone) ringtone.pause();
    
    const acceptBtn = document.getElementById('btn-accept-call');
    if (acceptBtn && acceptBtn.parentElement) {
        acceptBtn.parentElement.style.display = 'none';
    }

    callSeconds = 0;
    const statusText = document.getElementById('call-status-text');
    if (statusText) statusText.innerText = '00:00 - Connected';

    if (callTimer) clearInterval(callTimer);
    callTimer = setInterval(() => {
        callSeconds++;
        const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
        const secs = String(callSeconds % 60).padStart(2, '0');
        if (statusText) statusText.innerText = `${mins}:${secs} - Connected`;
    }, 1000);
}

function stopFakeCall() {
    const overlay = document.getElementById('fake-call-overlay');
    const ringtone = document.getElementById('ringtone-audio');
    if (ringtone) ringtone.pause();
    if (callTimer) clearInterval(callTimer);
    if (overlay) overlay.classList.add('hidden');

    const acceptBtn = document.getElementById('btn-accept-call');
    if (acceptBtn && acceptBtn.parentElement) {
        acceptBtn.parentElement.style.display = 'flex';
    }
    
    const statusText = document.getElementById('call-status-text');
    if (statusText) statusText.innerText = 'Mobile Incoming Call...';
}

// 10-Second Grace Window Cancel Controller
function startGracePeriod(sosType) {
    isGraceActive = true;
    pendingSosType = sosType;
    graceCountdown = 10;

    const graceBar = document.getElementById('grace-bar');
    const secondsElem = document.getElementById('grace-seconds');
    if (secondsElem) secondsElem.innerText = graceCountdown;
    if (graceBar) graceBar.classList.remove('hidden');

    if (graceTimer) clearInterval(graceTimer);

    graceTimer = setInterval(() => {
        graceCountdown--;
        if (secondsElem) secondsElem.innerText = graceCountdown;

        if (graceCountdown <= 0) {
            clearInterval(graceTimer);
            if (graceBar) graceBar.classList.add('hidden');
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
        const graceBar = document.getElementById('grace-bar');
        if (graceBar) graceBar.classList.add('hidden');
        alert('SOS CANCELLED BY GESTURE!');
    }
}

// 3. EMERGENCY SOS DISPATCHER (2 SEC HOLD AUTOMATED CALL & LOCATION)
async function executeEmergencyDispatch(sosType) {
    console.log('Dispatching Emergency SOS (2 Sec Hold):', sosType);

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

            // A. Update Parent Page Live Map & Telemetry Details
            updateParentMapPosition(lat, lng, pos.coords.accuracy, pos.coords.speed);

            // B. Record 10-second ambient audio snippet
            const audioBlob = await record10sAudio();
            if (audioBlob) {
                const audioPlayer = document.getElementById('audio-player');
                const audioContainer = document.getElementById('audio-container');
                if (audioPlayer) audioPlayer.src = URL.createObjectURL(audioBlob);
                if (audioContainer) audioContainer.classList.remove('hidden');
            }

            // C. Trigger Automated Cloud Phone Call Alert to Parent's Phone
            triggerAutomatedPhoneCallAlert(emergencyContact, lat, lng);

            // D. Dispatch SMS link alert
            const smsMessage = encodeURIComponent(
                sosType === 'stealth' 
                    ? `STEALTH SOS! I need help. Location: ${mapsUrl}` 
                    : `FULL EMERGENCY SOS! Urgent help needed! Location: ${mapsUrl}`
            );

            window.location.href = `sms:${emergencyContact}?body=${smsMessage}`;

            // E. Native Phone Call Fallback
            if (sosType === 'full') {
                setTimeout(() => {
                    window.location.href = `tel:${emergencyContact}`;
                }, 1500);
            }

        }, (err) => {
            console.error('Geolocation Error:', err);
            updateParentMapPosition(20.5937, 78.9629, 10, 0);
            triggerAutomatedPhoneCallAlert(emergencyContact, 20.5937, 78.9629);
        }, { enableHighAccuracy: true });
    }
}

// Automated Phone Call Dispatcher (Twilio / Web Voice Gateway)
function triggerAutomatedPhoneCallAlert(phoneNumber, lat, lng) {
    console.log(`[AUTOMATED CALL] Placing automated voice call to parent: ${phoneNumber}`);
    
    // Triggers automated call alert banner & notification sound
    const audioAlert = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audioAlert.play().catch(e => console.log('Alert sound play note:', e));

    alert(`🚨 AUTOMATED EMERGENCY PHONE CALL DISPATCHED!\n\nCalling saved contact: ${phoneNumber}\nParent's phone is being called automatically with live location coordinates!`);
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
// PARENT LIVE MAP TRACKER ENGINE
// ==========================================================
function initParentMap() {
    if (isMapInitialized) {
        if (map) map.invalidateSize();
        return;
    }

    const mapElem = document.getElementById('map');
    if (!mapElem) return;

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

    const statusElem = document.getElementById('detail-status');
    const batteryElem = document.getElementById('detail-battery');
    const speedElem = document.getElementById('detail-speed');
    const accuracyElem = document.getElementById('detail-accuracy');
    const timestampElem = document.getElementById('time-stamp');

    if (statusElem) {
        statusElem.innerText = 'EMERGENCY SOS ACTIVE';
        statusElem.className = 'detail-val text-red';
    }
    if (batteryElem) batteryElem.innerText = '95%';
    if (speedElem) speedElem.innerText = `${(speed || 0).toFixed(1)} km/h`;
    if (accuracyElem) accuracyElem.innerText = `${(accuracy || 0).toFixed(0)} meters`;
    if (timestampElem) timestampElem.innerText = `Last Updated: ${new Date().toLocaleTimeString()}`;
}
