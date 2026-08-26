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
let holdOn = false;
let emergencyContact = localStorage.getItem('pendant_contact') || '+91 98765 43210';

document.addEventListener('DOMContentLoaded', () => {

    document.getElementById('contact-phone').value = emergencyContact;
    document.getElementById('call-contact-number').textContent = emergencyContact;
    document.getElementById('call-active-number').textContent = emergencyContact;

    document.getElementById('btn-connect-ble').addEventListener('click', pairBLE);
    document.getElementById('btn-save-contact').addEventListener('click', saveContact);

    // Google Dialer buttons
    document.getElementById('btn-decline-call').addEventListener('click', stopFakeCall);
    document.getElementById('btn-accept-call').addEventListener('click', acceptFakeCall);
    document.getElementById('btn-end-call').addEventListener('click', stopFakeCall);

    document.getElementById('btn-toggle-mute').addEventListener('click', toggleMute);
    document.getElementById('btn-toggle-speaker').addEventListener('click', toggleSpeaker);
    document.getElementById('btn-dialer-hold').addEventListener('click', toggleHold);

    updateCallClock();
    clockTimer = setInterval(updateCallClock, 10000);
});

function saveContact() {
    emergencyContact = document.getElementById('contact-phone').value.trim();
    if (!emergencyContact) return;
    localStorage.setItem('pendant_contact', emergencyContact);
    document.getElementById('call-contact-number').textContent = emergencyContact;
    document.getElementById('call-active-number').textContent = emergencyContact;
    showToast('Emergency contact saved: ' + emergencyContact, 'green');
}

// ─── BLE ─────────────────────────────────────────────────────
async function pairBLE() {
    if (!navigator.bluetooth) {
        showToast('Web Bluetooth requires Google Chrome on Android or Desktop.', 'red');
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
        showToast('Safety Pendant connected successfully!', 'green');
    } catch (e) {
        showToast('BLE Connection: ' + (e.message || e), 'red');
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

// ─── Google Phone Fake Call Screen ───────────────────────────
function showFakeCallOverlay() {
    const overlay = document.getElementById('fake-call-overlay');
    overlay.classList.remove('hidden');
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

    // Transition to authentic in-call 3x3 screen
    document.getElementById('call-incoming-state').classList.add('hidden');
    document.getElementById('call-active-state').classList.remove('hidden');

    // Start in-call incrementing timer
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

    muteOn = false; speakerOn = false; holdOn = false;
    document.querySelector('#btn-toggle-mute .dialer-grid-icon')?.classList.remove('active-toggle');
    document.querySelector('#btn-toggle-speaker .dialer-grid-icon')?.classList.remove('active-toggle');
    document.querySelector('#btn-dialer-hold .dialer-grid-icon')?.classList.remove('active-toggle');
}

function toggleMute() {
    muteOn = !muteOn;
    document.querySelector('#btn-toggle-mute .dialer-grid-icon')?.classList.toggle('active-toggle', muteOn);
}

function toggleSpeaker() {
    speakerOn = !speakerOn;
    document.querySelector('#btn-toggle-speaker .dialer-grid-icon')?.classList.toggle('active-toggle', speakerOn);
}

function toggleHold() {
    holdOn = !holdOn;
    document.querySelector('#btn-dialer-hold .dialer-grid-icon')?.classList.toggle('active-toggle', holdOn);
}

// ─── Emergency SOS Dispatch ──────────────────────────────────
function dispatchEmergencySOS() {
    if (!navigator.geolocation) {
        triggerAlerts(emergencyContact, null);
        return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
        const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

        // Save SOS event to localStorage for real-time cross-tab sync
        localStorage.setItem('aura_sos_event', JSON.stringify({
            lat, lng, accuracy, speed: speed || 0,
            timestamp: new Date().toISOString(),
            status: 'EMERGENCY SOS ACTIVE'
        }));

        triggerAlerts(emergencyContact, mapsUrl);

        // Record 11s background audio and store as Base64 Data URL for cross-page playback
        record11sAudio().then(base64Data => {
            if (!base64Data) return;
            localStorage.setItem('aura_audio_base64', base64Data);
            localStorage.setItem('aura_audio_time', new Date().toLocaleTimeString());
        });
    }, () => triggerAlerts(emergencyContact, null), { enableHighAccuracy: true });
}

function triggerAlerts(phone, mapsUrl) {
    const loc = mapsUrl ? `Location: ${mapsUrl}` : 'Location unavailable!';
    const smsBody = encodeURIComponent(`🚨 EMERGENCY SOS! She needs urgent help! ${loc}`);
    showToast(`🚨 SOS Dispatched to ${phone}`, 'red');
    window.location.href = `sms:${phone}?body=${smsBody}`;
    setTimeout(() => { window.location.href = `tel:${phone}`; }, 1500);
}

// ─── Audio Recording (Base64 conversion for cross-tab sharing) ─
function record11sAudio() {
    return new Promise(resolve => {
        if (!navigator.mediaDevices?.getUserMedia) {
            console.warn('[Audio] getUserMedia not supported');
            resolve(null);
            return;
        }

        const mimeTypes = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', ''];
        let selectedMime = '';
        for (const type of mimeTypes) {
            if (type === '' || MediaRecorder.isTypeSupported(type)) {
                selectedMime = type;
                break;
            }
        }

        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            const options = selectedMime ? { mimeType: selectedMime } : {};
            const rec = new MediaRecorder(stream, options);
            const chunks = [];

            rec.ondataavailable = e => {
                if (e.data && e.data.size > 0) chunks.push(e.data);
            };

            rec.onstop = () => {
                stream.getTracks().forEach(track => track.stop());
                const blob = new Blob(chunks, { type: selectedMime || 'audio/webm' });

                // Convert Blob to Base64 String so any tab/window can play it
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            };

            rec.start();
            setTimeout(() => {
                if (rec.state === 'recording') rec.stop();
            }, 11000);
        }).catch(err => {
            console.error('[Audio] Microphone permission/recording error:', err);
            resolve(null);
        });
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
