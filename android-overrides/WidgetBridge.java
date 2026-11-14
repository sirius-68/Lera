package com.sirius68.lera;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

/**
 * What the web app can ask of the home-screen widgets: `window.LeraNative`.
 * The app sends its numbers after every change and whenever it comes to the
 * front; the widgets work out the rest from the clock.
 */
public class WidgetBridge {

    /** Where a tap on a widget wants the app to go; read once by the web app. */
    static volatile String pendingAction = null;

    private final Context context;

    WidgetBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    private SharedPreferences prefs() {
        return context.getSharedPreferences(StreakWidget.PREFS, Context.MODE_PRIVATE);
    }

    @JavascriptInterface
    public void setWidget(String json) {
        try {
            JSONObject o = new JSONObject(json);
            prefs().edit()
                .putBoolean("known", true)
                .putLong("seenAt", System.currentTimeMillis())
                .putInt("streak", o.optInt("streak", 0))
                .putString("lastDay", o.optString("lastDay", ""))
                .putInt("goal", o.optInt("goal", 30))
                .putInt("xpToday", o.optInt("xpToday", 0))
                .putInt("due", o.optInt("due", 0))
                .putString("week", o.optString("week", "0000000"))
                .putString("weekStart", o.optString("weekStart", ""))
                .apply();
            StreakWidget.refresh(context);
        } catch (Exception ignored) {
            // a malformed message leaves the widgets as they were
        }
    }

    /** Test mode: the widgets run through every mood, one a minute, from the moment the app was last open. */
    @JavascriptInterface
    public void setTest(boolean on) {
        prefs().edit().putBoolean("test", on).putLong("seenAt", System.currentTimeMillis()).apply();
        StreakWidget.refresh(context);
    }

    @JavascriptInterface
    public boolean isTest() {
        return prefs().getBoolean("test", false);
    }

    /** "practice" when the app was opened from a widget, once; otherwise an empty string. */
    @JavascriptInterface
    public String takeAction() {
        String action = pendingAction;
        pendingAction = null;
        return action == null ? "" : action;
    }

    /** Whether this launcher lets an app offer its widget directly. */
    @JavascriptInterface
    public boolean canPin() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        return AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported();
    }

    /** Ask the launcher to place a widget; the person confirms in the launcher's own dialog. */
    @JavascriptInterface
    public boolean pinWidget(boolean wide) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (!manager.isRequestPinAppWidgetSupported()) return false;
        return manager.requestPinAppWidget(new ComponentName(context, wide ? StreakWidgetWide.class : StreakWidget.class), null, null);
    }
}
