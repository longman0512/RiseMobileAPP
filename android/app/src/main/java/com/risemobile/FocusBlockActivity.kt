package com.risemobile

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Full-screen screen shown when the user opens a blocked app during a RISE focus
 * session. It covers the blocked app and offers only a way back to the home
 * screen — it never returns to the blocked app.
 */
class FocusBlockActivity : Activity() {

  companion object {
    const val EXTRA_BLOCKED_PACKAGE = "blocked_package"
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val root =
      LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setBackgroundColor(Color.parseColor("#0A0A0C"))
        setPadding(dp(32), dp(32), dp(32), dp(32))
        layoutParams =
          ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
          )
      }

    val title =
      TextView(this).apply {
        text = "Blocked during focus"
        setTextColor(Color.parseColor("#F5F5F7"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
        gravity = Gravity.CENTER
      }

    val subtitle =
      TextView(this).apply {
        text = "This app is paused while your RISE session is running. End the session in Rise to unblock it."
        setTextColor(Color.parseColor("#9A9AA2"))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        gravity = Gravity.CENTER
        setPadding(0, dp(12), 0, dp(28))
      }

    val homeButton =
      Button(this).apply {
        text = "Back to home"
        setOnClickListener { goHome() }
      }

    root.addView(title)
    root.addView(subtitle)
    root.addView(homeButton)
    setContentView(root)
  }

  override fun onBackPressed() {
    // Never fall back into the blocked app.
    goHome()
  }

  private fun goHome() {
    val home =
      Intent(Intent.ACTION_MAIN).apply {
        addCategory(Intent.CATEGORY_HOME)
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
      }
    startActivity(home)
    finish()
  }

  private fun dp(value: Int): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), resources.displayMetrics)
      .toInt()
}
