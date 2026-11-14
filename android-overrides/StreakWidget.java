package com.sirius68.lera;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/**
 * The home-screen widget.
 *
 * It shows the streak, one short line and Lera's face, and all three change
 * with what has happened today and what time it is: calm in the morning,
 * pressing in the evening, alarmed near midnight, asleep and dreaming of
 * formulas at night, pleased once the day's practice is done.
 *
 * The numbers come from the app (see WidgetBridge); whether today counts is
 * worked out here from the date, so the widget stays right on days the app
 * is never opened.
 */
public class StreakWidget extends AppWidgetProvider {

    static final String PREFS = "lera_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        RemoteViews views = build(context);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    /** Redraw every placed widget; called when the app reports new numbers. */
    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, StreakWidget.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews views = build(context);
        for (int id : ids) manager.updateAppWidget(id, views);
    }

    private static String day(int offset) {
        Calendar c = Calendar.getInstance();
        c.add(Calendar.DAY_OF_YEAR, offset);
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(c.getTime());
    }

    static RemoteViews build(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int stored = p.getInt("streak", 0);
        String last = p.getString("lastDay", "");
        int goal = p.getInt("goal", 30);
        int xpToday = p.getInt("xpToday", 0);
        int due = p.getInt("due", 0);
        boolean known = p.getBoolean("known", false);

        boolean doneToday = last.equals(day(0));
        boolean alive = doneToday || last.equals(day(-1));
        int streak = alive ? stored : 0;
        int hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);

        int bg;
        int face;
        String line;

        if (!known) {
            bg = R.drawable.widget_bg_purple;
            face = R.drawable.widget_lera_happy;
            line = "Let's practise?";
        } else if (doneToday && xpToday >= goal) {
            bg = R.drawable.widget_bg_green;
            face = R.drawable.widget_lera_cool;
            line = "Goal done. See you tomorrow!";
        } else if (doneToday) {
            bg = R.drawable.widget_bg_orange;
            face = R.drawable.widget_lera_fired;
            line = "Streak safe. " + Math.max(1, goal - xpToday) + " XP to goal";
        } else if (hour < 6) {
            bg = R.drawable.widget_bg_night;
            face = R.drawable.widget_lera_sleepy;
            line = "Dreaming of x²…";
        } else if (streak == 0) {
            bg = R.drawable.widget_bg_ice;
            face = R.drawable.widget_lera_sad;
            line = stored > 1 ? "Start a new streak?" : "Ready to practise?";
        } else if (hour < 12) {
            bg = R.drawable.widget_bg_purple;
            face = R.drawable.widget_lera_happy;
            line = due > 0 ? due + (due == 1 ? " idea" : " ideas") + " to bring back" : "Time to practise!";
        } else if (hour < 18) {
            bg = R.drawable.widget_bg_violet;
            face = R.drawable.widget_lera_determined;
            line = "Got 3 minutes?";
        } else if (hour < 22) {
            bg = R.drawable.widget_bg_orange;
            face = R.drawable.widget_lera_shocked;
            line = "Save your streak!";
        } else {
            bg = R.drawable.widget_bg_red;
            face = R.drawable.widget_lera_sad;
            line = "Last chance tonight!";
        }

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_streak);
        views.setInt(R.id.widget_root, "setBackgroundResource", bg);
        views.setImageViewResource(R.id.widget_lera, face);
        views.setTextViewText(R.id.widget_count, String.valueOf(streak));
        views.setTextViewText(R.id.widget_line, line);

        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (open != null) {
            PendingIntent tap = PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, tap);
        }
        return views;
    }
}
