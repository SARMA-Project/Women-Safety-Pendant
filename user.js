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
let muteOn = false;
let speakerOn = false;
let emergencyContact = localStorage.getItem('pendant_contact') || '+1234567890';

document.addEventListener('DOMContentLoaded', () => {

    document.getElementById('contact-phone').value = emergencyContact;
    document.getElementById('call-contact-number').textContent = emergencyContact;
    document.getElementById('call-active-number').textContent = emergencyContact;

    document.getElementById('btn-connect-ble').addEventListener('click', pairBLE);
    document.getElementById('btn-save-contact').addEventListener('click', saveContact);

    document.getElementById('btn-decline-call').addEventListener('click', stopFakeCall);
    document.getElementById('btn-accept-call').addEventListener('click', acceptFakeCall);
    document.getElementById('btn-end-call').addEventListener('click', stopFakeCall);

    document.getElementById('btn-toggle-mute').addEventListener('click', toggleMute);
    document.getElementById('btn-toggle-speaker').addEventListener('click', toggleSpeaker);

    updateCallClock();
    clockTimer = setInterval(updateCallClock, 15000);
});

function saveContact() {
    emergencyContact = document.getElementById('contact-phone').value.trim();
    if (!emergencyContact) return;
    localStorage.setItem('pendant_contact', emergencyContact);
    document.getElementById('call-contact-number').textContent = emergencyContact;
    document.getElementById('call-active-number').textContent = emergencyContact;
    showToast('Contact saved: ' + emergencyContact, 'green');
}

// ─── BLE ─────────────────────────────────────────────────────
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

        bleDevice.addEventListener('gattserverdisconnected', () => setBLEStatus(false));

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

function setBLEStatus(connected) {
    const pill = document.getElementById('ble-status-pill');
    const text = document.getElementById('ble-status-text');
    const info = document.getElementById('ble-info');
    const btn  = document.getElementById('btn-connect-ble');

    if (connected) {
        pill.className = 'status-pill status-connected';
        text.textContent = 'CONNECTED';
        info.classList.remove('hidden');
        btn.innerHTML = '<i class="fa-solid fa-link-slash"></i> Disconnect';
        btn.onclick = () => { bleDevice?.gatt.disconnect(); setBLEStatus(false); };
    } else {
        pill.className = 'status-pill status-disconnected';
        text.textContent = 'DISCONNECTED';
        info.classList.add('hidden');
        btn.innerHTML = '<i class="fa-solid fa-wifi"></i> PAIR ESP32-S3 PENDANT';
        btn.onclick = pairBLE;
    }
}

// ─── Gesture Handler ──────────────────────────────────────────
function onGesture(event) {
    handleGestureCode(event.target.value.getUint8(0));
}

function handleGestureCode(val) {
    if (val === 0x02) showFakeCallOverlay();
    if (val === 0x08) dispatchEmergencySOS();
}

// ─── Fake Incoming Call ───────────────────────────────────────
function showFakeCallOverlay() {
    document.getElementById('fake-call-overlay').classList.remove('hidden');
    document.getElementById('call-incoming-state').classList.remove('hidden');
    document.getElementById('call-active-state').classList.add('hidden');

    const ringtone = document.getElementById('ringtone-audio');
    ringtone.currentTime = 0;
    ringtone.play().catch(() => {});
    updateCallClock();
}

function updateCallClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const el = document.getElementById('call-clock');
    if (el) el.textContent = timeStr;
}

function acceptFakeCall() {
    document.getElementById('ringtone-audio').pause();

    // Transition to in-call active state
    document.getElementById('call-incoming-state').classList.add('hidden');
    document.getElementById('call-active-state').classList.remove('hidden');

    // Start timer
    callSeconds = 0;
    if (callTimer) clearInterval(callTimer);
    callTimer = setInterval(() => {
        callSeconds++;
        const m = String(Math.floor(callSeconds / 60)).padStart(2, '0');
        const s = String(callSeconds % 60).padStart(2, '0');
        document.getElementById('call-timer-display').textContent = `${m}:${s}`;
    }, 1000);
}

function stopFakeCall() {
    document.getElementById('ringtone-audio').pause();
    if (callTimer) clearInterval(callTimer);
    document.getElementById('fake-call-overlay').classList.add('hidden');
    document.getElementById('call-timer-display').textContent = '00:00';
    callSeconds = 0;
    muteOn = false; speakerOn = false;
    document.querySelector('#btn-toggle-mute .incall-icon').classList.remove('active');
    document.querySelector('#btn-toggle-speaker .incall-icon').classList.remove('active');
}

function toggleMute() {
    muteOn = !muteOn;
    document.querySelector('#btn-toggle-mute .incall-icon').classList.toggle('active', muteOn);
}

function toggleSpeaker() {
    speakerOn = !speakerOn;
    document.querySelector('#btn-toggle-speaker .incall-icon').classList.toggle('active', speakerOn);
}

// ─── Emergency SOS ─────────────────────────────────────────── 
function dispatchEmergencySOS() {
    if (!navigator.geolocation) {
        triggerAlerts(emergencyContact, null);
        return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
        const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

        localStorage.setItem('aura_sos_event', JSON.stringify({
            lat, lng, accuracy, speed: speed || 0,
            timestamp: new Date().toISOString(), status: 'EMERGENCY SOS ACTIVE'
        }));
        // Dispatch storage event for same-tab (same-page) listeners
        window.dispatchEvent(new StorageEvent('storage', {
            key: 'aura_sos_event',
            newValue: localStorage.getItem('aura_sos_event')
        }));

        triggerAlerts(emergencyContact, mapsUrl);
        record11sAudio().then(blob => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            localStorage.setItem('aura_audio_url', url);
            localStorage.setItem('aura_audio_time', new Date().toLocaleTimeString());
        });
    }, () => triggerAlerts(emergencyContact, null), { enableHighAccuracy: true });
}

function triggerAlerts(phone, mapsUrl) {
    const loc = mapsUrl ? `Location: ${mapsUrl}` : 'Location unavailable!';
    const smsBody = encodeURIComponent(`🚨 EMERGENCY SOS! She needs help! ${loc}`);
    showToast(`🚨 SOS Dispatched to ${phone}`, 'red');
    window.location.href = `sms:${phone}?body=${smsBody}`;
    setTimeout(() => { window.location.href = `tel:${phone}`; }, 1500);
}

function record11sAudio() {
    return new Promise(resolve => {
        if (!navigator.mediaDevices?.getUserMedia) { resolve(null); return; }
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            const rec = new MediaRecorder(stream);
            const chunks = [];
            rec.ondataavailable = e => chunks.push(e.data);
            rec.onstop = () => resolve(new Blob(chunks, { type: 'audio/m4a' }));
            rec.start();
            setTimeout(() => rec.stop(), 11000);
        }).catch(() => resolve(null));
    });
}

// ─── Toast ───────────────────────────────────────────────────
function showToast(msg, type = '') {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = `toast ${type === 'red' ? 'toast-red' : type === 'green' ? 'toast-green' : ''}`;
    t.innerHTML = `<i class="fa-solid fa-bell" style="color:#E91E8C"></i><span>${msg}</span>`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}
