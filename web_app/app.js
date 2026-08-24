// ==========================================================
// SAFETY PENDANT WEB COMPANION PWA - APP LOGIC
// ==========================================================

const SUPABASE_URL = 'https://YOUR_SUPABASE_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// BLE Configuration
#define SERVICE_UUID        "4fa8c001-1402-4ca2-8979-45d4d9807601"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

let bleDevice = null;
let bleCharacteristic = null;
let graceTimer = null;
let graceCountdown = 10;
let isGraceActive = false;
let pendingSosType = '';
let emergencyContact = localStorage.getItem('pendant_contact') || '+1234567890';

document.getElementById('contact-phone').value = emergencyContact;

// 1. Web Bluetooth Pairing
document.getElementById('btn-connect-ble').addEventListener('click', async () => {
    try {
        console.log('Requesting Bluetooth Device...');
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [{ name: 'Safety_Pendant_S3' }],
            optionalServices: ['4fa8c001-1402-4ca2-8979-45d4d9807601']
        });

        const server = await bleDevice.gatt.connect();
        const service = await server.getPrimaryService('4fa8c001-1402-4ca2-8979-45d4d9807601');
        bleCharacteristic = await service.getCharacteristic('beb5483e-36e1-4688-b7f5-ea07361b26a8');

        await bleCharacteristic.startNotifications();
        bleCharacteristic.addEventListener('characteristicvaluechanged', handleGestureNotification);

        document.getElementById('ble-status').innerText = 'CONNECTED';
        document.getElementById('ble-status').className = 'status-badge badge-online';
        alert('Connected successfully to Safety Pendant S3!');
    } catch (err) {
        console.error('BLE Connection Failed:', err);
        alert('Bluetooth Connection Failed: ' + err.message);
    }
});

// 2. Gesture Payload Handler
function handleGestureNotification(event) {
    const value = event.target.value.getUint8(0);
    console.log('Received BLE Gesture Payload: 0x' + value.toString(16));

    switch (value) {
        case 0x02: // Double Click -> De-escalation Fake Call
            showFakeCallOverlay();
            break;
        case 0x03: // Triple Click -> Stealth SOS
            startGracePeriod('stealth');
            break;
        case 0x08: // Hold 2s -> Full SOS
            startGracePeriod('full');
            break;
        case 0x06: // 6 Clicks -> Cancel SOS
            cancelGracePeriod();
            break;
    }
}

// 3. Fake Call System
function showFakeCallOverlay() {
    const overlay = document.getElementById('fake-call-overlay');
    const ringtone = document.getElementById('ringtone-audio');
    
    overlay.classList.remove('hidden');
    ringtone.play().catch(e => console.log('Audio autoplay blocked', e));
}

document.getElementById('btn-decline-call').addEventListener('click', () => {
    stopFakeCall();
});

document.getElementById('btn-accept-call').addEventListener('click', () => {
    document.getElementById('call-status-text').innerText = '00:01 - Call Connected';
    document.getElementById('btn-accept-call').style.display = 'none';
    const ringtone = document.getElementById('ringtone-audio');
    ringtone.pause();
});

function stopFakeCall() {
    const overlay = document.getElementById('fake-call-overlay');
    const ringtone = document.getElementById('ringtone-audio');
    ringtone.pause();
    overlay.classList.add('hidden');
    document.getElementById('btn-accept-call').style.display = 'flex';
    document.getElementById('call-status-text').innerText = 'Mobile Incoming Call...';
}

// 4. 10-Second Grace Window Cancel Controller
function startGracePeriod(sosType) {
    isGraceActive = true;
    pendingSosType = sosType;
    graceCountdown = 10;

    const graceBar = document.getElementById('grace-bar');
    document.getElementById('grace-seconds').innerText = graceCountdown;
    graceBar.classList.remove('hidden');

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
        clearInterval(graceTimer);
        document.getElementById('grace-bar').classList.add('hidden');
        alert('SOS CANCELLED BY BUTTON GESTURE!');
    }
}

document.getElementById('btn-cancel-grace').addEventListener('click', () => {
    cancelGracePeriod();
});

// 5. Emergency SOS Dispatcher
async function executeEmergencyDispatch(sosType) {
    console.log('Dispatching Emergency SOS:', sosType);

    // Get current GPS position
    navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

        // Record 10-second audio snippet using MediaRecorder
        const audioBlob = await record10sAudio();

        // Upload to Supabase if configured
        let audioUrl = '';
        if (supabase && audioBlob) {
            const fileName = `snippet_${Date.now()}.m4a`;
            const { data } = await supabase.storage.from('audio-snippets').upload(fileName, audioBlob);
            if (data) {
                audioUrl = `${SUPABASE_URL}/storage/v1/object/public/audio-snippets/${fileName}`;
            }
        }

        // Open SMS composer with prefilled message
        const smsMessage = encodeURIComponent(
            sosType === 'stealth' 
                ? `STEALTH SOS! I need help. Location: ${mapsUrl}` 
                : `FULL EMERGENCY SOS! Urgent help needed! Location: ${mapsUrl}`
        );
        window.location.href = `sms:${emergencyContact}?body=${smsMessage}`;

    }, (err) => {
        console.error('Geolocation Error:', err);
    }, { enableHighAccuracy: true });
}

// 6. 10-Second Audio Recorder
function record10sAudio() {
    return new Promise((resolve) => {
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

// Save Emergency Contact
document.getElementById('btn-save-contact').addEventListener('click', () => {
    emergencyContact = document.getElementById('contact-phone').value;
    localStorage.setItem('pendant_contact', emergencyContact);
    alert('Contact Saved: ' + emergencyContact);
});
