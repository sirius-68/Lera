package com.sirius68.lera;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

/**
 * What the web app can ask of the home-screen widget: `window.LeraNative`.
 * The app sends its numbers after every change; nothing is read back.
 */
public class WidgetBridge {

    private final Context context;

    WidgetBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    @JavascriptInterface
    public void setWidget(String json) {
        try {
            JSONObject o = new JSONObject(json);
            context.getSharedPreferences(StreakWidget.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean("known", true)
                .putInt("streak", o.optInt("streak", 0))
                .putString("lastDay", o.optString("lastDay", ""))
                .putInt("goal", o.optInt("goal", 30))
                .putInt("xpToday", o.optInt("xpToday", 0))
                .putInt("due", o.optInt("due", 0))
                .apply();
            StreakWidget.refresh(context);
        } catch (Exception ignored) {
            // a malformed message leaves the widget as it was
        }
    }

    /** Whether this launcher lets an app offer its widget directly. */
    @JavascriptInterface
    public boolean canPin() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        return AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported();
    }

    /** Ask the launcher to place the widget; the person confirms in the launcher's own dialog. */
    @JavascriptInterface
    public boolean pinWidget() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (!manager.isRequestPinAppWidgetSupported()) return false;
        return manager.requestPinAppWidget(new ComponentName(context, StreakWidget.class), null, null);
    }
}
