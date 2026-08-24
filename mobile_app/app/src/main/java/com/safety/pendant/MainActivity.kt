package com.safety.pendant

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private val PERMISSION_REQUEST_CODE = 101

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate()
        setContentView(createMainLayout())
        checkAndRequestPermissions()
    }

    private fun createMainLayout(): android.view.View {
        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            padding = 50
            setBackgroundColor(android.graphics.Color.parseColor("#0F172A"))
        }

        val tvTitle = TextView(this).apply {
            text = "🛡️ Safety Pendant"
            textSize = 28f
            setTextColor(android.graphics.Color.WHITE)
            setTypeface(null, android.graphics.Typeface.BOLD)
        }

        val tvSub = TextView(this).apply {
            text = "Configure Emergency Contacts & Service Status"
            textSize = 14f
            setTextColor(android.graphics.Color.parseColor("#94A3B8"))
            setPadding(0, 10, 0, 40)
        }

        val tvLabelContact = TextView(this).apply {
            text = "Emergency Phone Number (Mom/Dad/Partner):"
            textSize = 14f
            setTextColor(android.graphics.Color.WHITE)
        }

        val etContact = EditText(this).apply {
            hint = "+1234567890"
            setHintTextColor(android.graphics.Color.GRAY)
            setTextColor(android.graphics.Color.WHITE)
            setText("+1234567890")
            setBackgroundColor(android.graphics.Color.parseColor("#1E293B"))
            setPadding(30, 30, 30, 30)
        }

        val btnStart = Button(this).apply {
            text = "🚀 START PENDANT SERVICE"
            setBackgroundColor(android.graphics.Color.parseColor("#2563EB"))
            setTextColor(android.graphics.Color.WHITE)
            setPadding(0, 30, 0, 30)
            setOnClickListener {
                startPendantService()
                Toast.makeText(this@MainActivity, "Safety Service Active in Background", Toast.LENGTH_SHORT).show()
            }
        }

        layout.addView(tvTitle)
        layout.addView(tvSub)
        layout.addView(tvLabelContact)
        layout.addView(etContact)
        layout.addView(btnStart)

        return layout
    }

    private fun checkAndRequestPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.CALL_PHONE,
            Manifest.permission.SEND_SMS,
            Manifest.permission.RECORD_AUDIO
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissions.add(Manifest.permission.BLUETOOTH_SCAN)
            permissions.add(Manifest.permission.BLUETOOTH_CONNECT)
        }

        val missing = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), PERMISSION_REQUEST_CODE)
        }
    }

    private fun startPendantService() {
        val intent = Intent(this, BleService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }
}
