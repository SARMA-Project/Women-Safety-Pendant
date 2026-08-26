// ============================================================
// AURA SAFETY – PARENT TRACKER ENGINE (LIGHT MODE)
// ============================================================

let map = null;
let userMarker = null;
let accuracyCircle = null;
let lastLat = null, lastLng = null;

// Emergency Audio Siren Engine (Web Audio API)
let audioCtx = null;
let sirenOsc = null;
let sirenGain = null;
let sirenInterval = null;
let isSirenPlaying = false;
let isAlarmMuted = false;

document.addEventListener('DOMContentLoaded', () => {

    initMap();

    // 1. Check existing telemetry & audio on load WITHOUT sounding siren
    const existingAudio = localStorage.getItem('aura_audio_base64');
    if (existingAudio) loadAudio(existingAudio);

    const existingSOS = localStorage.getItem('aura_sos_event');
    if (existingSOS) {
        try { displaySOSTelemetry(JSON.parse(existingSOS)); } catch(e){}
    }

    // 2. Listen for fresh live SOS events & audio from user page across all tabs
    window.addEventListener('storage', (e) => {
        if (e.key === 'aura_sos_event' && e.newValue) {
            try { handleIncomingLiveSOS(JSON.parse(e.newValue)); } catch(err){}
        }
        if (e.key === 'aura_audio_base64' && e.newValue) {
            loadAudio(e.newValue);
        }
    });

    document.getElementById('btn-recenter').addEventListener('click', recenterMap);
    
    // Silence Alarm Button: attached via event listener + touch handler
    const muteBtn = document.getElementById('btn-silence-alarm');
    if (muteBtn) {
        muteBtn.addEventListener('click', silenceAlarm);
        muteBtn.addEventListener('touchstart', (e) => { e.preventDefault(); silenceAlarm(); }, { passive: false });
    }

    // Audio context unlock on click
    document.addEventListener('click', () => {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }, { once: true });
});

// ─── Emergency Siren Alarm (100% Bulletproof Mute) ───────────
function startEmergencySiren() {
    if (isSirenPlaying || isAlarmMuted) return;

    try {
        stopAnyPlayingSiren();

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

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

        isSirenPlaying = true;
        console.log('[Siren] Emergency Alarm started.');
    } catch (e) {
        console.error('[Siren] Web Audio error:', e);
    }
}

function stopAnyPlayingSiren() {
    try {
        if (sirenInterval) {
            clearInterval(sirenInterval);
            sirenInterval = null;
        }
        if (sirenGain && audioCtx) {
            sirenGain.gain.setValueAtTime(0, audioCtx.currentTime);
            sirenGain.disconnect();
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
        console.warn('[Siren] Cleanup:', e);
    }
    isSirenPlaying = false;
}

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
}

// ─── Map (Light Theme Tile Layer) ────────────────────────────
function initMap() {
    map = L.map('map', { zoomControl: false, attributionControl: false })
           .setView([20.5937, 78.9629], 5);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(map);

    L.control.zoom({ position: 'topleft' }).addTo(map);
}

function updateMapPin(lat, lng) {
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
    if (lastLat !== null) map.setView([lastLat, lastLng], 16, { animate: true });
}

// ─── Live SOS Event Handler ──────────────────────────────────
function handleIncomingLiveSOS(data) {
    isAlarmMuted = false; // Reset mute for the new emergency
    const btn = document.getElementById('btn-silence-alarm');
    if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i> MUTE ALARM';
        btn.classList.remove('alarm-muted');
        btn.disabled = false;
    }
    displaySOSTelemetry(data);
    startEmergencySiren();
}

function displaySOSTelemetry(data) {
    try {
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

    } catch(e) { console.error('[Parent] Failed to display telemetry:', e); }
}

// ─── Audio Recording Player ──────────────────────────────────
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
