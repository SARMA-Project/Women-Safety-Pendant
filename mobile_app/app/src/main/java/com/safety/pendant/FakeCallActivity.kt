package com.safety.pendant

import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class FakeCallActivity : AppCompatActivity() {

    private var ringtone: Ringtone? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate()

        // Turn screen on and display over lockscreen
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        setContentView(createFakeCallLayout())
        playRingtone()
    }

    private fun createFakeCallLayout(): View {
        val layout = android.widget.RelativeLayout(this).apply {
            setBackgroundColor(android.graphics.Color.parseColor("#0F172A"))
            padding = 40
        }

        val tvCaller = TextView(this).apply {
            text = "Dad"
            textSize = 32f
            setTextColor(android.graphics.Color.WHITE)
            id = View.generateViewId()
        }

        val tvSub = TextView(this).apply {
            text = "Incoming Mobile Call..."
            textSize = 16f
            setTextColor(android.graphics.Color.parseColor("#94A3B8"))
        }

        val btnDecline = Button(this).apply {
            text = "Decline"
            setBackgroundColor(android.graphics.Color.parseColor("#DC2626"))
            setTextColor(android.graphics.Color.WHITE)
            setOnClickListener {
                stopRingtone()
                finish()
            }
        }

        val btnAccept = Button(this).apply {
            text = "Accept"
            setBackgroundColor(android.graphics.Color.parseColor("#16A34A"))
            setTextColor(android.graphics.Color.WHITE)
            setOnClickListener {
                stopRingtone()
                // Transition to active call view (simulated)
                tvSub.text = "00:01 - Call Connected"
                btnAccept.visibility = View.GONE
                btnDecline.text = "End Call"
            }
        }

        val paramsCaller = android.widget.RelativeLayout.LayoutParams(
            android.widget.RelativeLayout.LayoutParams.WRAP_CONTENT,
            android.widget.RelativeLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            addRule(android.widget.RelativeLayout.CENTER_HORIZONTAL)
            topMargin = 200
        }

        val paramsSub = android.widget.RelativeLayout.LayoutParams(
            android.widget.RelativeLayout.LayoutParams.WRAP_CONTENT,
            android.widget.RelativeLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            addRule(android.widget.RelativeLayout.CENTER_HORIZONTAL)
            addRule(android.widget.RelativeLayout.BELOW, tvCaller.id)
            topMargin = 20
        }

        val btnContainer = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
            weightSum = 2f
            addView(btnDecline, android.widget.LinearLayout.LayoutParams(0, 140, 1f).apply { rightMargin = 20 })
            addView(btnAccept, android.widget.LinearLayout.LayoutParams(0, 140, 1f).apply { leftMargin = 20 })
        }

        val paramsBtns = android.widget.RelativeLayout.LayoutParams(
            android.widget.RelativeLayout.LayoutParams.MATCH_PARENT,
            android.widget.RelativeLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            addRule(android.widget.RelativeLayout.ALIGN_PARENT_BOTTOM)
            bottomMargin = 100
        }

        layout.addView(tvCaller, paramsCaller)
        layout.addView(tvSub, paramsSub)
        layout.addView(btnContainer, paramsBtns)

        return layout
    }

    private fun playRingtone() {
        try {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ringtone = RingtoneManager.getRingtone(applicationContext, uri)
            ringtone?.play()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun stopRingtone() {
        ringtone?.stop()
    }

    override fun onDestroy() {
        super.onDestroy()
        stopRingtone()
    }
}
