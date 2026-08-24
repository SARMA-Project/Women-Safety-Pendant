package com.safety.pendant

import android.app.*
import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.content.Intent
import android.location.Location
import android.media.MediaRecorder
import android.net.Uri
import android.os.*
import android.telephony.SmsManager
import android.util.Log
import androidx.core.app.NotificationCompat
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.*
import kotlin.concurrent.thread

class BleService : Service() {

    private val TAG = "PendantBleService"
    private var bluetoothAdapter: BluetoothAdapter? = null
    private var bluetoothGatt: BluetoothGatt? = null
    private var isGraceWindowActive = false
    private var pendingSosType = ""
    private val handler = Handler(Looper.getMainLooper())
    private var graceRunnable: Runnable? = null

    // Configuration - Set your Supabase URL & Keys
    val SUPABASE_URL = "https://YOUR_SUPABASE_PROJECT_ID.supabase.co"
    val SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY"
    val EMERGENCY_CONTACT = "+1234567890" // Set default emergency phone number

    override fun onCreate() {
        super.onCreate()
        startForegroundServiceNotification()
        initBluetooth()
    }

    private fun startForegroundServiceNotification() {
        val channelId = "PendantServiceChannel"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "Safety Pendant Background Service", NotificationManager.IMPORTANCE_LOW)
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Safety Pendant Active")
            .setContentText("Monitoring Bluetooth connection for emergency button...")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .build()

        startForeground(1001, notification)
    }

    private fun initBluetooth() {
        val bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        bluetoothAdapter = bluetoothManager.adapter
        scanAndConnect()
    }

    private fun scanAndConnect() {
        val scanner = bluetoothAdapter?.bluetoothLeScanner ?: return
        val scanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult?) {
                val device = result?.device
                if (device?.name == "Safety_Pendant_S3") {
                    scanner.stopScan(this)
                    connectToDevice(device)
                }
            }
        }
        scanner.startScan(scanCallback)
    }

    private fun connectToDevice(device: BluetoothDevice) {
        bluetoothGatt = device.connectGatt(this, true, object : BluetoothGattCallback() {
            override fun onConnectionStateChange(gatt: BluetoothGatt?, status: Int, newState: Int) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    Log.d(TAG, "Connected to Safety Pendant!")
                    gatt?.discoverServices()
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    Log.d(TAG, "Disconnected. Retrying scan...")
                    scanAndConnect()
                }
            }

            override fun onServicesDiscovered(gatt: BluetoothGatt?, status: Int) {
                val service = gatt?.getService(UUID.fromString("4fa8c001-1402-4ca2-8979-45d4d9807601"))
                val characteristic = service?.getCharacteristic(UUID.fromString("beb5483e-36e1-4688-b7f5-ea07361b26a8"))
                if (characteristic != null) {
                    gatt.setCharacteristicNotification(characteristic, true)
                }
            }

            @Suppress("DEPRECATION")
            override fun onCharacteristicChanged(gatt: BluetoothGatt?, characteristic: BluetoothGattCharacteristic?) {
                val value = characteristic?.value?.get(0)?.toInt() ?: 0
                Log.d(TAG, "Received BLE Gesture Payload: 0x%02X".format(value))
                handleGesture(value)
            }

            override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
                val gestureCode = if (value.isNotEmpty()) value[0].toInt() else 0
                Log.d(TAG, "Received BLE Gesture Payload (API33+): 0x%02X".format(gestureCode))
                handleGesture(gestureCode)
            }
        })
    }

    private fun handleGesture(code: Int) {
        when (code) {
            0x02 -> {
                // Double Click -> De-escalation Fake Call
                Log.d(TAG, "Triggering Fake Call UI...")
                val intent = Intent(this, FakeCallActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                }
                startActivity(intent)
            }
            0x03 -> {
                // Triple Click -> Stealth SOS (10s Grace Window)
                startGracePeriodTimer("stealth")
            }
            0x08 -> {
                // Hold 2s -> Full SOS (10s Grace Window)
                startGracePeriodTimer("full")
            }
            0x06 -> {
                // 6 Rapid Clicks -> CANCEL SOS
                cancelGracePeriodTimer()
            }
        }
    }

    private fun startGracePeriodTimer(sosType: String) {
        isGraceWindowActive = true
        pendingSosType = sosType
        Log.d(TAG, "SOS Triggered ($sosType). Starting 10-second cancellation window...")

        graceRunnable = Runnable {
            if (isGraceWindowActive) {
                isGraceWindowActive = false
                Log.d(TAG, "Grace period expired! Executing Emergency SOS dispatch...")
                executeEmergencyDispatch(pendingSosType)
            }
        }
        handler.postDelayed(graceRunnable!!, 10000) // 10-Second Grace Window
    }

    private fun cancelGracePeriodTimer() {
        if (isGraceWindowActive) {
            isGraceWindowActive = false
            graceRunnable?.let { handler.removeCallbacks(it) }
            Log.d(TAG, "SOS SUCCESSFULLY CANCELLED by 6 rapid clicks!")
            vibrateFeedback(3)
        }
    }

    private fun executeEmergencyDispatch(sosType: String) {
        thread {
            try {
                // 1. Create Supabase Emergency Session
                val sessionId = createSupabaseSession(sosType)

                // 2. Record 10-Second Audio Snippet & Upload
                val audioUrl = recordAndUpload10sAudio(sessionId)
                if (audioUrl != null) {
                    updateSessionAudioUrl(sessionId, audioUrl)
                }

                // 3. Send SMS with Live Location Link
                val trackingLink = "$SUPABASE_URL/web_tracker/index.html?id=$sessionId"
                val message = if (sosType == "stealth") {
                    "STEALTH EMERGENCY ALERT! I need help. Live Location: $trackingLink"
                } else {
                    "FULL EMERGENCY SOS! Urgent assistance needed! Live Location: $trackingLink"
                }
                sendSms(EMERGENCY_CONTACT, message)

                // 4. If Full SOS -> Place Auto Emergency Phone Call
                if (sosType == "full") {
                    val callIntent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$EMERGENCY_CONTACT")).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    startActivity(callIntent)
                }

            } catch (e: Exception) {
                Log.e(TAG, "Emergency dispatch failed", e)
            }
        }
    }

    private fun createSupabaseSession(sosType: String): String {
        val url = URL("$SUPABASE_URL/rest/v1/sos_sessions")
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("apikey", SUPABASE_ANON_KEY)
        conn.setRequestProperty("Authorization", "Bearer $SUPABASE_ANON_KEY")
        conn.setRequestProperty("Content-Type", "application/json")
        conn.setRequestProperty("Prefer", "return=representation")
        conn.doOutput = true

        val jsonInput = """{"user_name": "Emergency User", "sos_type": "$sosType", "status": "active"}"""
        conn.outputStream.write(jsonInput.toByteArray())

        val response = conn.inputStream.bufferedReader().readText()
        val sessionId = response.substringAfter("\"id\":\"").substringBefore("\"")
        return sessionId
    }

    @Suppress("DEPRECATION")
    private fun recordAndUpload10sAudio(sessionId: String): String? {
        val audioFile = File(cacheDir, "ambient_snippet.m4a")
        val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(this)
        } else {
            MediaRecorder()
        }.apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setOutputFile(audioFile.absolutePath)
            prepare()
            start()
        }

        Thread.sleep(10000) // Record for 10 seconds

        recorder.stop()
        recorder.release()

        val uploadUrl = URL("$SUPABASE_URL/storage/v1/object/audio-snippets/$sessionId.m4a")
        val conn = uploadUrl.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("apikey", SUPABASE_ANON_KEY)
        conn.setRequestProperty("Authorization", "Bearer $SUPABASE_ANON_KEY")
        conn.setRequestProperty("Content-Type", "audio/m4a")
        conn.doOutput = true

        conn.outputStream.write(audioFile.readBytes())
        val code = conn.responseCode
        return if (code == 200 || code == 201) {
            "$SUPABASE_URL/storage/v1/object/public/audio-snippets/$sessionId.m4a"
        } else null
    }

    private fun updateSessionAudioUrl(sessionId: String, audioUrl: String) {
        val url = URL("$SUPABASE_URL/rest/v1/sos_sessions?id=eq.$sessionId")
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "PATCH"
        conn.setRequestProperty("apikey", SUPABASE_ANON_KEY)
        conn.setRequestProperty("Authorization", "Bearer $SUPABASE_ANON_KEY")
        conn.setRequestProperty("Content-Type", "application/json")
        conn.doOutput = true

        val jsonInput = """{"audio_snippet_url": "$audioUrl"}"""
        conn.outputStream.write(jsonInput.toByteArray())
        conn.responseCode
    }

    @Suppress("DEPRECATION")
    private fun sendSms(phoneNumber: String, message: String) {
        try {
            val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                getSystemService(SmsManager::class.java)
            } else {
                SmsManager.getDefault()
            }
            smsManager.sendTextMessage(phoneNumber, null, message, null, null)
            Log.d(TAG, "Emergency SMS sent to $phoneNumber")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send SMS", e)
        }
    }

    @Suppress("DEPRECATION")
    private fun vibrateFeedback(times: Int) {
        val vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(500, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            vibrator.vibrate(500)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
