// ============================================================
// AURA SAFETY – PARENT TRACKER ENGINE (LIGHT MODE)
// ============================================================

let map = null;
let userMarker = null;
let accuracyCircle = null;
let lastLat = null, lastLng = null;

document.addEventListener('DOMContentLoaded', () => {

    initMap();

    // Listen for SOS events from user page (same-device cross-tab)
    window.addEventListener('storage', (e) => {
        if (e.key === 'aura_sos_event') parseSOSEvent(e.newValue);
        if (e.key === 'aura_audio_url')  loadAudio(e.newValue);
    });

    // Load any existing SOS
    const existingSOS = localStorage.getItem('aura_sos_event');
    if (existingSOS) parseSOSEvent(existingSOS);

    const existingAudio = localStorage.getItem('aura_audio_url');
    if (existingAudio) loadAudio(existingAudio);

    document.getElementById('btn-recenter').addEventListener('click', recenterMap);
});

// ─── Map (Light Theme Tile Layer) ────────────────────────────
function initMap() {
    map = L.map('map', { zoomControl: false, attributionControl: false })
           .setView([20.5937, 78.9629], 5);

    // Light, modern Positron / OSM style tiles
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

    const accuracy = parseInt(document.getElementById('d-accuracy').textContent) || 100;
    if (accuracyCircle) {
        accuracyCircle.setLatLng([lat, lng]);
        accuracyCircle.setRadius(accuracy);
    } else {
        accuracyCircle = L.circle([lat, lng], {
            radius: accuracy,
            color: '#E91E8C',
            fillColor: '#F472B6',
            fillOpacity: 0.15,
            weight: 2
        }).addTo(map);
    }

    map.setView([lat, lng], 16, { animate: true });
}

function recenterMap() {
    if (lastLat !== null) map.setView([lastLat, lastLng], 16, { animate: true });
}

// ─── SOS Event Parser ────────────────────────────────────────
function parseSOSEvent(raw) {
    try {
        if (!raw) return;
        const data = JSON.parse(raw);
        const { lat, lng, accuracy, speed, timestamp } = data;

        // Show SOS Banner
        document.getElementById('sos-banner').classList.remove('hidden');
        const t = new Date(timestamp);
        document.getElementById('sos-banner-time').textContent = t.toLocaleTimeString();

        // Update telemetry
        document.getElementById('d-status').textContent = '🚨 SOS ACTIVE';
        document.getElementById('d-status').className = 'detail-val text-red';
        document.getElementById('d-speed').textContent = (speed * 3.6).toFixed(1) + ' km/h';
        document.getElementById('d-accuracy').textContent = Math.round(accuracy) + ' m';
        document.getElementById('d-coords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        document.getElementById('last-updated-text').textContent = 'Last update: ' + t.toLocaleTimeString();

        // Update map
        updateMapPin(lat, lng);

        // Update "Open Maps" link
        document.getElementById('btn-open-maps').href = `https://maps.google.com/?q=${lat},${lng}`;

        // Status pill
        const pill = document.getElementById('tracker-status');
        const pillText = document.getElementById('tracker-status-text');
        pill.className = 'status-pill status-emergency';
        pillText.textContent = 'EMERGENCY';

    } catch(e) { console.error('[Parent] Failed to parse SOS event:', e); }
}

function loadAudio(url) {
    if (!url) return;
    const player = document.getElementById('audio-player');
    const container = document.getElementById('audio-container');
    const placeholder = document.getElementById('audio-placeholder');
    const tsText = document.getElementById('audio-timestamp-text');

    player.src = url;
    placeholder.classList.add('hidden');
    container.classList.remove('hidden');

    const ts = localStorage.getItem('aura_audio_time');
    if (ts) tsText.textContent = 'Recorded at ' + ts;
}
