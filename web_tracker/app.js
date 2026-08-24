// ==========================================================
// LIVE EMERGENCY TRACKER - LEAFLET + SUPABASE JS LOGIC
// ==========================================================

// Replace with your actual Supabase URL and Anon Key
const SUPABASE_URL = 'https://YOUR_SUPABASE_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Extract Session ID from URL parameter (e.g., index.html?id=XYZ)
const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('id');

let map, marker, circle;
let currentLat = 0, currentLng = 0;

function initMap() {
    // Default to city center view
    map = L.map('map').setView([20.5937, 78.9629], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Custom glowing red pin for emergency location
    const customIcon = L.divIcon({
        className: 'pulse-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    marker = L.marker([0, 0], { icon: customIcon }).addTo(map);
    circle = L.circle([0, 0], { radius: 10, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.2 }).addTo(map);
}

async function loadSessionDetails() {
    if (!sessionId) {
        document.getElementById('status-badge').innerText = 'NO SESSION ID';
        document.getElementById('status-badge').className = 'badge badge-warning';
        return;
    }

    // Fetch session meta
    const { data: session, error } = await supabase
        .from('sos_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

    if (error || !session) {
        console.error('Session error:', error);
        document.getElementById('status-badge').innerText = 'SESSION EXPIRED';
        return;
    }

    document.getElementById('user-name').innerText = session.user_name || 'Emergency User';
    updateStatusBadge(session.status, session.sos_type);

    if (session.audio_snippet_url) {
        showAudioSnippet(session.audio_snippet_url);
    }

    // Fetch latest coordinates
    const { data: tracks } = await supabase
        .from('live_tracks')
        .select('*')
        .eq('session_id', sessionId)
        .order('recorded_at', { ascending: false })
        .limit(1);

    if (tracks && tracks.length > 0) {
        updateMapPosition(tracks[0]);
    }
}

function updateStatusBadge(status, sosType) {
    const badge = document.getElementById('status-badge');
    if (status === 'cancelled') {
        badge.innerText = 'SOS CANCELLED';
        badge.className = 'badge badge-warning';
    } else if (sosType === 'stealth') {
        badge.innerText = 'STEALTH SOS ACTIVE';
        badge.className = 'badge badge-danger';
    } else {
        badge.innerText = 'FULL EMERGENCY SOS';
        badge.className = 'badge badge-danger';
    }
}

function updateMapPosition(track) {
    currentLat = track.latitude;
    currentLng = track.longitude;

    const latLng = [currentLat, currentLng];
    marker.setLatLng(latLng);
    circle.setLatLng(latLng);
    circle.setRadius(track.accuracy || 15);

    map.setView(latLng, 17, { animate: true });

    document.getElementById('stat-battery').innerText = `${track.battery_level || '--'}%`;
    document.getElementById('stat-speed').innerText = `${(track.speed || 0).toFixed(1)} km/h`;
    document.getElementById('stat-accuracy').innerText = `${(track.accuracy || 0).toFixed(0)} m`;

    const formattedTime = new Date(track.recorded_at).toLocaleTimeString();
    document.getElementById('time-stamp').innerText = `Last Updated: ${formattedTime}`;
}

function showAudioSnippet(url) {
    const audioContainer = document.getElementById('audio-container');
    const audioPlayer = document.getElementById('audio-player');
    audioPlayer.src = url;
    audioContainer.classList.remove('hidden');
}

function subscribeToRealtime() {
    if (!sessionId) return;

    // Listen to real-time coordinate broadcasts
    supabase
        .channel(`live-tracking-${sessionId}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'live_tracks',
                filter: `session_id=eq.${sessionId}`
            },
            (payload) => {
                console.log('Realtime location update:', payload.new);
                updateMapPosition(payload.new);
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'sos_sessions',
                filter: `id=eq.${sessionId}`
            },
            (payload) => {
                console.log('Realtime session update:', payload.new);
                updateStatusBadge(payload.new.status, payload.new.sos_type);
                if (payload.new.audio_snippet_url) {
                    showAudioSnippet(payload.new.audio_snippet_url);
                }
            }
        )
        .subscribe();
}

// Event Listeners
document.getElementById('btn-recenter').addEventListener('click', () => {
    if (currentLat !== 0 && currentLng !== 0) {
        map.setView([currentLat, currentLng], 17, { animate: true });
    }
});

window.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadSessionDetails();
    subscribeToRealtime();
});
