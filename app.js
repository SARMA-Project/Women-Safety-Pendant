// ============================================================
// AURA SAFETY – UNIFIED MASTER ENGINE (ZERO BLE DISCONNECT)
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

// Leaflet Map & Parent Telemetry
let map = null;
let userMarker = null;
let accuracyCircle = null;
let lastLat = null, lastLng = null;

// Emergency Siren Audio Engine
let audioCtx = null;
let sirenOsc = null;
let sirenGain = null;
let sirenInterval = null;
let isSirenPlaying = false;
let isAlarmMuted = false;

document.addEventListener('DOMContentLoaded', () => {

    // View tab switcher (Keeps Bluetooth connected 24/7 without page reload)
    document.getElementById('btn-tab-user').addEventListener('click', () => switchView('user'));
    document.getElementById('btn-tab-parent').addEventListener('click', () => switchView('parent'));

    // Emergency Contact
    document.getElementById('contact-phone').value = emergencyContact;
    document.getElementById('call-contact-number').textContent = emergencyContact;
    document.getElementById('call-active-number').textContent = emergencyContact;

    document.getElementById('btn-connect-ble').addEventListener('click', pairBLE);
    document.getElementById('btn-save-contact').addEventListener('click', saveContact);

    // Google Phone Dialer Controls
    document.getElementById('btn-decline-call').addEventListener('click', stopFakeCall);
    document.getElementById('btn-accept-call').addEventListener('click', acceptFakeCall);
    document.getElementById('btn-end-call').addEventListener('click', stopFakeCall);

    document.getElementById('btn-toggle-mute').addEventListener('click', toggleMute);
    document.getElementById('btn-toggle-speaker').addEventListener('click', toggleSpeaker);
    document.getElementById('btn-dialer-hold').addEventListener('click', toggleHold);

    // Parent Dashboard Controls
    document.getElementById('btn-recenter').addEventListener('click', recenterMap);
    
    // Silence Alarm Button: attached via event listener + touch handler
    const muteBtn = document.getElementById('btn-silence-alarm');
    if (muteBtn) {
        muteBtn.addEventListener('click', silenceAlarm);
        muteBtn.addEventListener('touchstart', (e) => { e.preventDefault(); silenceAlarm(); }, { passive: false });
    }

    // Initialize Leaflet Light Map
    initMap();

    // Check on startup if audio or telemetry exists from previous session (NO SIREN ON PASSIVE LOAD)
    const existingAudio = localStorage.getItem('aura_audio_base64');
    if (existingAudio) loadAudio(existingAudio);

    const existingSOS = localStorage.getItem('aura_sos_event');
    if (existingSOS) {
        try { displaySOSTelemetry(JSON.parse(existingSOS)); } catch(e){}
    }

    // Real-time storage listener for cross-tab events
    window.addEventListener('storage', (e) => {
        if (e.key === 'aura_sos_event' && e.newValue) {
            try { handleIncomingSOS(JSON.parse(e.newValue)); } catch(err){}
        }
        if (e.key === 'aura_audio_base64' && e.newValue) {
            loadAudio(e.newValue);
        }
    });

    updateCallClock();
    clockTimer = setInterval(updateCallClock, 10000);
});

// ─── Seamless View Switcher (Zero BLE Disconnect) ─────────────
function switchView(view) {
    const secUser = document.getElementById('section-user');
    const secParent = document.getElementById('section-parent');
    const btnUser = document.getElementById('btn-tab-user');
    const btnParent = document.getElementById('btn-tab-parent');
    const ind = document.getElementById('view-indicator');

    if (view === 'user') {
        secUser.classList.remove('hidden');
        secParent.classList.add('hidden');
        btnUser.classList.add('active');
        btnParent.classList.remove('active');
        ind.textContent = 'WOMAN USER VIEW';
    } else {
        secUser.classList.add('hidden');
        secParent.classList.remove('hidden');
        btnParent.classList.add('active');
        btnUser.classList.remove('active');
        ind.textContent = 'PARENT TRACKING VIEW';

        // Invalidate map size so Leaflet renders properly on unhide
        if (map) {
            setTimeout(() => {
                map.invalidateSize();
                if (lastLat !== null) map.setView([lastLat, lastLng], 16);
            }, 100);
        }
    }
}

function saveContact() {
    emergencyContact = document.getElementById('contact-phone').value.trim();
    if (!emergencyContact) return;
    localStorage.setItem('pendant_contact', emergencyContact);
    document.getElementById('call-contact-number').textContent = emergencyContact;
    document.getElementById('call-active-number').textContent = emergencyContact;
    showToast('Emergency contact saved: ' + emergencyContact, 'green');
}

// ─── Web Bluetooth Low Energy ─────────────────────────────────
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

        const server = await bleDevice.gatt.connect();
        const service = await server.getPrimaryService(SERVICE_UUID);
        bleChar = await service.getCharacteristic(CHARACTERISTIC_UUID);
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

// ─── Gesture Routing ──────────────────────────────────────────
function onGesture(event) {
    const val = event.target.value.getUint8(0);
    console.log('[ESP32-S3 Gesture Received]:', val);

    if (val === 0x02) {
        // Double Click ➔ Fake Dad Call (Vibration only, No LED)
        showFakeCallOverlay();
    } else if (val === 0x08) {
        // 2-Sec Hold ➔ Instant Full Emergency SOS (Alerts at 0.0s + Parallel Audio)
        dispatchEmergencySOS();
    }
}

// ─── Google Phone Fake Call Screen ───────────────────────────
function showFakeCallOverlay() {
    const overlay = document.getElementById('fake-call-overlay');
    overlay.classList.remove('hidden');
    document.getElementById('call-incoming-state').classList.remove('hidden');
    document.getElementById('call-active-state').classList.add('hidden');

    const ringtone = document.getElementById('ringtone-audio');
    if (ringtone) {
        ringtone.currentTime = 0;
        ringtone.play().catch(() => {});
    }
    updateCallClock();
}

function updateCallClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const el = document.getElementById('call-clock');
    if (el) el.textContent = timeStr;
}

function acceptFakeCall() {
    const ringtone = document.getElementById('ringtone-audio');
    if (ringtone) ringtone.pause();

    document.getElementById('call-incoming-state').classList.add('hidden');
    document.getElementById('call-active-state').classList.remove('hidden');

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
    const ringtone = document.getElementById('ringtone-audio');
    if (ringtone) {
        ringtone.pause();
        ringtone.currentTime = 0;
    }
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

// ─── Instant Full Emergency SOS (0.0s Immediate Dispatch) ─────
function dispatchEmergencySOS() {
    console.log('[SOS] Emergency SOS hold detected! Triggering instant alerts...');
    
    // Reset mute state for this new emergency
    isAlarmMuted = false;
    const btn = document.getElementById('btn-silence-alarm');
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i> MUTE ALARM';
        btn.classList.remove('alarm-muted');
        btn.disabled = false;
    }

    if (!navigator.geolocation) {
        triggerImmediateAlerts(emergencyContact, null);
        return;
    }

    navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
        const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

        const sosData = {
            lat, lng, accuracy, speed: speed || 0,
            timestamp: new Date().toISOString(),
            status: 'EMERGENCY SOS ACTIVE'
        };

        // 1. Save and handle SOS locally
        localStorage.setItem('aura_sos_event', JSON.stringify(sosData));
        handleIncomingSOS(sosData);

        // 2. Trigger auto SMS & Phone call
        triggerImmediateAlerts(emergencyContact, mapsUrl);

        // 3. PARALLEL: Record 11s ambient audio and deliver next without delaying alert
        record11sAudio().then(base64Data => {
            if (!base64Data) return;
            localStorage.setItem('aura_audio_base64', base64Data);
            localStorage.setItem('aura_audio_time', new Date().toLocaleTimeString());
            loadAudio(base64Data);
            showToast('10-Second ambient audio delivered to Parent Dashboard', 'green');
        });

    }, () => triggerImmediateAlerts(emergencyContact, null), { enableHighAccuracy: true });
}

function triggerImmediateAlerts(phone, mapsUrl) {
    const loc = mapsUrl ? `Location: ${mapsUrl}` : 'Location unavailable!';
    const smsBody = encodeURIComponent(`🚨 EMERGENCY SOS! She needs urgent help! ${loc}`);
    showToast(`🚨 SOS Alert Dispatched to ${phone}`, 'red');
    window.location.href = `sms:${phone}?body=${smsBody}`;
    setTimeout(() => { window.location.href = `tel:${phone}`; }, 1500);
}

// ─── Parent Telemetry & Siren Alarm Handler ───────────────────
function handleIncomingSOS(data) {
    displaySOSTelemetry(data);
    // ONLY sound the siren alarm when an active SOS is explicitly triggered
    startEmergencySiren();
}

function displaySOSTelemetry(data) {
    if (!data) return;
    const { lat, lng, accuracy, speed, timestamp } = data;

    document.getElementById('sos-banner').classList.remove('hidden');
    const t = new Date(timestamp);
    document.getElementById('sos-banner-time').textContent = 'Triggered at ' + t.toLocaleTimeString();

    document.getElementById('d-status').textContent = '🚨 SOS ACTIVE';
    document.getElementById('d-status').className = 'detail-val text-red';
    document.getElementById('d-speed').textContent = (speed * 3.6).toFixed(1) + ' km/h';
    document.getElementById('d-accuracy').textContent = Math.round(accuracy) + ' m';
    document.getElementById('d-coords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    document.getElementById('last-updated-text').textContent = 'Live update: ' + t.toLocaleTimeString();

    updateMapPin(lat, lng);
    document.getElementById('btn-open-maps').href = `https://maps.google.com/?q=${lat},${lng}`;

    const pill = document.getElementById('tracker-status');
    const pillText = document.getElementById('tracker-status-text');
    pill.className = 'status-pill status-emergency';
    pillText.textContent = 'EMERGENCY';
}

// ─── Emergency Siren Engine (HTML5 Audio + Web Audio Dual Mute) 
function startEmergencySiren() {
    if (isSirenPlaying || isAlarmMuted) return;

    try {
        stopAnyPlayingSiren();

        // 1. Try HTML5 Audio element first (most reliable on Android / iOS)
        const sirenAudio = document.getElementById('siren-audio');
        if (sirenAudio) {
            sirenAudio.currentTime = 0;
            sirenAudio.volume = 1.0;
            sirenAudio.play().catch(e => {
                console.log('[Siren Audio Element Autoplay]: Fallback to Web Audio');
            });
        }

        // 2. Synthesize Web Audio oscillator siren in parallel
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            audioCtx = new AudioContext();
            sirenGain = audioCtx.createGain();
            sirenGain.gain.setValueAtTime(0.35, audioCtx.currentTime);
            sirenGain.connect(audioCtx.destination);

            sirenOsc = audioCtx.createOscillator();
            sirenOsc.type = 'sawtooth';
            sirenOsc.connect(sirenGain);
            sirenOsc.start();

            let highPitch = false;
            sirenOsc.frequency.setValueAtTime(800, audioCtx.currentTime);

            sirenInterval = setInterval(() => {
                if (!audioCtx || !sirenOsc || isAlarmMuted) {
                    stopAnyPlayingSiren();
                    return;
                }
                const targetFreq = highPitch ? 650 : 960;
                sirenOsc.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.12);
                highPitch = !highPitch;
            }, 400);
        }

        isSirenPlaying = true;
        console.log('[Siren] Emergency Alarm started.');
    } catch (e) {
        console.error('[Siren] Error starting alarm:', e);
    }
}

function stopAnyPlayingSiren() {
    // 1. Stop HTML5 audio element
    const sirenAudio = document.getElementById('siren-audio');
    if (sirenAudio) {
        sirenAudio.pause();
        sirenAudio.currentTime = 0;
    }

    // 2. Stop Web Audio oscillators & context
    try {
        if (sirenInterval) {
            clearInterval(sirenInterval);
            sirenInterval = null;
        }
        if (sirenGain && audioCtx) {
            sirenGain.gain.setValueAtTime(0, audioCtx.currentTime);
            sirenGain.disconnect();
            sirenGain = null;
        }
        if (sirenOsc) {
            sirenOsc.stop();
            sirenOsc.disconnect();
            sirenOsc = null;
        }
        if (audioCtx) {
            audioCtx.close();
            audioCtx = null;
        }
    } catch (e) {
        console.warn('[Siren] Stop cleanup:', e);
    }
    isSirenPlaying = false;
}

// Global silenceAlarm callable directly anywhere
function silenceAlarm() {
    console.log('[Siren] Silencing emergency alarm NOW...');
    isAlarmMuted = true;
    stopAnyPlayingSiren();

    const btn = document.getElementById('btn-silence-alarm');
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-bell-slash"></i> ALARM MUTED';
        btn.classList.add('alarm-muted');
        btn.disabled = true;
    }
    showToast('Emergency Siren Silenced', 'blue');
}
window.silenceAlarm = silenceAlarm;

// ─── Leaflet Map Engine ───────────────────────────────────────
function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    map = L.map('map', { zoomControl: false, attributionControl: false })
           .setView([20.5937, 78.9629], 5);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(map);

    L.control.zoom({ position: 'topleft' }).addTo(map);
}

function updateMapPin(lat, lng) {
    if (!map) return;
    lastLat = lat; lastLng = lng;

    const icon = L.divIcon({
        className: '',
        html: '<div class="custom-sos-pin"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    if (userMarker) {
        userMarker.setLatLng([lat, lng]);
    } else {
        userMarker = L.marker([lat, lng], { icon }).addTo(map);
    }

    const accuracy = parseInt(document.getElementById('d-accuracy').textContent) || 80;
    if (accuracyCircle) {
        accuracyCircle.setLatLng([lat, lng]);
        accuracyCircle.setRadius(accuracy);
    } else {
        accuracyCircle = L.circle([lat, lng], {
            radius: accuracy,
            color: '#E91E8C',
            fillColor: '#F472B6',
            fillOpacity: 0.18,
            weight: 2
        }).addTo(map);
    }

    map.setView([lat, lng], 16, { animate: true });
}

function recenterMap() {
    if (map && lastLat !== null) map.setView([lastLat, lastLng], 16, { animate: true });
}

// ─── Parallel 11-Second Background Audio Recorder ────────────
function record11sAudio() {
    return new Promise(resolve => {
        if (!navigator.mediaDevices?.getUserMedia) {
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
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            };

            rec.start();
            setTimeout(() => {
                if (rec.state === 'recording') rec.stop();
            }, 11000); // 11-second audio snippet
        }).catch(err => {
            console.error('[Audio] Microphone error:', err);
            resolve(null);
        });
    });
}

function loadAudio(base64Data) {
    if (!base64Data) return;
    const player = document.getElementById('audio-player');
    const container = document.getElementById('audio-container');
    const placeholder = document.getElementById('audio-placeholder');
    const tsText = document.getElementById('audio-timestamp-text');

    player.src = base64Data;
    placeholder.classList.add('hidden');
    container.classList.remove('hidden');

    const ts = localStorage.getItem('aura_audio_time');
    if (ts) tsText.textContent = 'Recorded at ' + ts;
}

// ─── Non-Blocking Toast Banners ──────────────────────────────
function showToast(msg, type = '') {
    document.querySelectorAll('.toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = `toast ${type === 'red' ? 'toast-red' : type === 'green' ? 'toast-green' : ''}`;
    t.innerHTML = `<i class="fa-solid fa-bell" style="color:#E91E8C"></i><span>${msg}</span>`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}
