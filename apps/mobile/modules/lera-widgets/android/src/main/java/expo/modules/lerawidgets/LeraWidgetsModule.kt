package expo.modules.lerawidgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

/**
 * What the app can ask of the home-screen widgets. The same four calls the older Android build
 * offered as `window.LeraNative`; host/widget.ts puts them back under that name.
 * The widgets themselves (StreakWidget, StreakWidgetWide, their layouts and pictures) are copied
 * here from android-overrides/ by scripts/sync-widgets.mjs, so there is one copy to maintain.
 */
class LeraWidgetsModule : Module() {
  private val context: Context?
    get() = appContext.reactContext?.applicationContext

  override fun definition() = ModuleDefinition {
    Name("LeraWidgets")

    // The app's numbers, after every change and whenever it comes to the front; the widgets work out the rest from the clock.
    Function("setWidget") { json: String ->
      context?.let { ctx ->
        try {
          val o = JSONObject(json)
          ctx.getSharedPreferences(StreakWidget.PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("known", true)
            .putBoolean("test", false)
            .putLong("seenAt", System.currentTimeMillis())
            .putInt("streak", o.optInt("streak", 0))
            .putString("lastDay", o.optString("lastDay", ""))
            .putInt("goal", o.optInt("goal", 30))
            .putInt("xpToday", o.optInt("xpToday", 0))
            .putInt("due", o.optInt("due", 0))
            .putString("week", o.optString("week", "0000000"))
            .putString("weekStart", o.optString("weekStart", ""))
            .apply()
          StreakWidget.refresh(ctx)
        } catch (_: Exception) {
          // a malformed message leaves the widgets as they were
        }
      }
      Unit
    }

    // "practice" when the app was opened from a widget, once; otherwise an empty string.
    Function("takeAction") {
      var action = WidgetStore.pendingAction
      WidgetStore.pendingAction = null
      if (action == null) {
        val intent = appContext.currentActivity?.intent
        action = intent?.getStringExtra("lera_action")
        intent?.removeExtra("lera_action")
      }
      action ?: ""
    }

    // Whether this launcher lets an app offer its widget directly.
    Function("canPin") {
      val ctx = context
      ctx != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && AppWidgetManager.getInstance(ctx).isRequestPinAppWidgetSupported
    }

    // Ask the launcher to place a widget; the person confirms in the launcher's own dialog.
    Function("pinWidget") { wide: Boolean ->
      val ctx = context
      if (ctx == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        false
      } else {
        val manager = AppWidgetManager.getInstance(ctx)
        manager.isRequestPinAppWidgetSupported && manager.requestPinAppWidget(ComponentName(ctx, if (wide) StreakWidgetWide::class.java else StreakWidget::class.java), null, null)
      }
    }

    OnNewIntent { intent ->
      intent.getStringExtra("lera_action")?.let { WidgetStore.pendingAction = it }
    }
  }
}
