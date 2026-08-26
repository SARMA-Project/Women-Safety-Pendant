// ============================================================
// AURA SAFETY – USER DASHBOARD ENGINE
// ============================================================

const SERVICE_UUID        = "4fa8c001-1402-4ca2-8979-45d4d9807601";
const CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

let bleDevice = null;
let bleChar   = null;
let callTimer = null;
let callSeconds = 0;
let clockTimer  = null;
let emergencyContact = localStorage.getItem('pendant_contact') || '+1234567890';

document.addEventListener('DOMContentLoaded', () => {

    document.getElementById('contact-phone').value = emergencyContact;
    document.getElementById('call-contact-number').textContent = emergencyContact;

    // Bluetooth pair button
    document.getElementById('btn-connect-ble').addEventListener('click', pairBLE);

    // Save contact
    document.getElementById('btn-save-contact').addEventListener('click', () => {
        emergencyContact = document.getElementById('contact-phone').value.trim();
        if (!emergencyContact) return;
        localStorage.setItem('pendant_contact', emergencyContact);
        document.getElementById('call-contact-number').textContent = emergencyContact;
        showToast('Contact saved: ' + emergencyContact, 'green');
    });

    // Call screen buttons
    document.getElementById('btn-decline-call').addEventListener('click', stopFakeCall);
    document.getElementById('btn-accept-call').addEventListener('click', acceptFakeCall);
});

// ─── BLE ───────────────────────────────────────────────────
async function pairBLE() {
    if (!navigator.bluetooth) {
        showToast('Web Bluetooth requires Chrome on Android/Desktop.', 'red');
        return;
    }
    try {
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [{ name: 'Safety_Pendant_S3' }],
            optionalServices: [SERVICE_UUID]
        }).catch(() => navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [SERVICE_UUID]
        }));

        bleDevice.addEventListener('gattserverdisconnected', onBLEDisconnect);

        const server  = await bleDevice.gatt.connect();
        const service = await server.getPrimaryService(SERVICE_UUID);
        bleChar        = await service.getCharacteristic(CHARACTERISTIC_UUID);

        await bleChar.startNotifications();
        bleChar.addEventListener('characteristicvaluechanged', onGesture);

        setBLEStatus(true);
        showToast('Pendant connected!', 'green');
    } catch (e) {
        showToast('BLE error: ' + (e.message || e), 'red');
    }
}

function onBLEDisconnect() { setBLEStatus(false); }

function setBLEStatus(connected) {
    const pill   = document.getElementById('ble-status-pill');
    const text   = document.getElementById('ble-status-text');
    const info   = document.getElementById('ble-info');
    const btn    = document.getElementById('btn-connect-ble');

    if (connected) {
        pill.className = 'status-pill status-connected';
        text.textContent = 'CONNECTED';
        info.classList.remove('hidden');
        btn.innerHTML = '<i class="fa-solid fa-link-slash"></i> Disconnect';
        btn.onclick = () => { bleDevice && bleDevice.gatt.disconnect(); setBLEStatus(false); };
    } else {
        pill.className = 'status-pill status-disconnected';
        text.textContent = 'DISCONNECTED';
        info.classList.add('hidden');
        btn.innerHTML = '<i class="fa-solid fa-wifi"></i> PAIR ESP32-S3 PENDANT';
        btn.onclick = pairBLE;
    }
}

// ─── Gesture Handler ────────────────────────────────────────
function onGesture(event) {
    const val = event.target.value.getUint8(0);
    handleGestureCode(val);
}

function handleGestureCode(val) {
    switch (val) {
        case 0x02: showFakeCallOverlay(); break;    // 2 Presses → Fake Dad Call
        case 0x08: dispatchEmergencySOS(); break;   // 2 sec Hold → Emergency SOS
    }
}

// ─── Fake Incoming Call (Google Dialer Style) ───────────────
function showFakeCallOverlay() {
    const overlay  = document.getElementById('fake-call-overlay');
    const ringtone = document.getElementById('ringtone-audio');

    overlay.classList.remove('hidden');
    ringtone.currentTime = 0;
    ringtone.play().catch(() => {});
    updateCallClock();
    clockTimer = setInterval(updateCallClock, 10000);
}

function updateCallClock() {
    const now = new Date();
    document.getElementById('call-clock').textContent =
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function acceptFakeCall() {
    document.getElementById('ringtone-audio').pause();
    document.getElementById('call-status-label').textContent = '00:00';
    document.getElementById('btn-accept-call').parentElement.style.display = 'none';

    callSeconds = 0;
    if (callTimer) clearInterval(callTimer);
    callTimer = setInterval(() => {
        callSeconds++;
        const m = String(Math.floor(callSeconds / 60)).padStart(2, '0');
        const s = String(callSeconds % 60).padStart(2, '0');
        document.getElementById('call-status-label').textContent = `${m}:${s}`;
    }, 1000);
}

function stopFakeCall() {
    document.getElementById('ringtone-audio').pause();
    if (callTimer) clearInterval(callTimer);
    if (clockTimer) clearInterval(clockTimer);
    document.getElementById('fake-call-overlay').classList.add('hidden');
    document.getElementById('btn-accept-call').parentElement.style.display = 'flex';
    document.getElementById('call-status-label').textContent = 'Incoming call';
}

// ─── INSTANT Emergency SOS ──────────────────────────────────
function dispatchEmergencySOS() {
    console.log('[SOS] Instant emergency dispatch triggered!');

    if (!navigator.geolocation) {
        triggerCallAndSMS(emergencyContact, null);
        return;
    }

    navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
        const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

        // Broadcast to parent page via localStorage (real-time cross-tab)
        localStorage.setItem('aura_sos_event', JSON.stringify({
            lat, lng, accuracy, speed: speed || 0,
            timestamp: new Date().toISOString(),
            status: 'EMERGENCY SOS ACTIVE'
        }));

        triggerCallAndSMS(emergencyContact, mapsUrl);

        // Background 11-second audio recording
        record11sAudio().then(blob => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            localStorage.setItem('aura_audio_url', url);
            localStorage.setItem('aura_audio_time', new Date().toLocaleTimeString());
        });

    }, () => {
        triggerCallAndSMS(emergencyContact, null);
    }, { enableHighAccuracy: true });
}

function triggerCallAndSMS(phone, mapsUrl) {
    const locText = mapsUrl
        ? `Location: ${mapsUrl}`
        : 'Location not available – please track her phone!';
    const smsBody = encodeURIComponent(`🚨 FULL EMERGENCY SOS! She needs urgent help! ${locText}`);

    showToast(`🚨 SOS Dispatched to ${phone}`, 'red');

    // Open SMS first
    window.location.href = `sms:${phone}?body=${smsBody}`;

    // Then trigger phone call
    setTimeout(() => {
        window.location.href = `tel:${phone}`;
    }, 1500);
}

// ─── 11-Second Audio Recorder ───────────────────────────────
function record11sAudio() {
    return new Promise(resolve => {
        if (!navigator.mediaDevices?.getUserMedia) { resolve(null); return; }
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                const rec    = new MediaRecorder(stream);
                const chunks = [];
                rec.ondataavailable = e => chunks.push(e.data);
                rec.onstop = () => resolve(new Blob(chunks, { type: 'audio/m4a' }));
                rec.start();
                setTimeout(() => rec.stop(), 11000);
            })
            .catch(() => resolve(null));
    });
}

// ─── Toast ──────────────────────────────────────────────────
function showToast(msg, type = 'blue') {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = `toast ${type === 'red' ? 'toast-red' : type === 'green' ? 'toast-green' : ''}`;
    t.innerHTML = `<i class="fa-solid fa-bell"></i> <span>${msg}</span>`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}
