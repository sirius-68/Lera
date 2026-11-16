package com.sirius68.lera;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * Lera on the home screen.
 *
 * What she shows depends on how long she has been left alone. While the
 * streak is alive the day sets the tone: bright in the morning, asking in the
 * afternoon, alarmed in the evening, desperate before midnight, asleep at
 * night, pleased once practice is done. After the streak breaks it is the
 * days that count: sad, then bored, then covered in cobwebs after a week, a
 * ghost after a month, a fossil after a year.
 *
 * Test mode (off unless switched on from the app's Streak page) climbs the
 * same ladder one step a minute from the moment the app was last open, so
 * every state can be seen in ten minutes.
 *
 * Tapping her makes her react; tapping anywhere else opens practice.
 */
public class StreakWidget extends AppWidgetProvider {

    static final String PREFS = "lera_widget";
    static final String ACTION_TICK = "com.sirius68.lera.widget.TICK";
    static final String ACTION_POKE = "com.sirius68.lera.widget.POKE";
    static final long MINUTE = 60000L;

    static final int NEW = 0, SAFE = 1, GOAL = 2, MORNING = 3, AFTERNOON = 4, EVENING = 5, LATE = 6, NIGHT = 7, LOST = 8, DAYS = 9, WEEK = 10, MONTH = 11, YEAR = 12, POKE = 13;
    /** Test mode: one of these per minute since the app was last open. */
    static final int[] LADDER = { SAFE, MORNING, AFTERNOON, EVENING, LATE, LOST, DAYS, WEEK, MONTH, YEAR };
    /** Days ignored that each lost stage stands for in test mode, so its lines read true. */
    static final int[] TEST_DAYS = { 0, 0, 0, 0, 0, 2, 4, 9, 41, 400 };

    /** One way a stage can look: a background, her whole figure, optionally a card her face fills, and a line. */
    static final class Look {
        final int bg, face, blend;
        final String line;

        Look(int bg, int face, int blend, String line) {
            this.bg = bg;
            this.face = face;
            this.blend = blend;
            this.line = line;
        }
    }

    static Look[] looks(int stage) {
        switch (stage) {
            case SAFE:
                return new Look[] {
                    new Look(R.drawable.widget_bg_green, R.drawable.widget_lera_strong, 0, "Streak safe!"),
                    new Look(R.drawable.widget_bg_green, R.drawable.widget_lera_fired, 0, "{left} XP to today's goal"),
                    new Look(R.drawable.widget_bg_blue, R.drawable.widget_lera_happy, 0, "See you tomorrow!"),
                };
            case GOAL:
                return new Look[] {
                    new Look(R.drawable.widget_bg_orange, R.drawable.widget_lera_cool, 0, "Goal done!"),
                    new Look(R.drawable.widget_bg_orange, R.drawable.widget_lera_fired, 0, "You're on fire!"),
                };
            case MORNING:
                return new Look[] {
                    new Look(R.drawable.widget_bg_blue, R.drawable.widget_lera_happy, 0, "Get started early!"),
                    new Look(R.drawable.widget_bg_purple, R.drawable.widget_lera_strong, 0, "One problem. Two minutes."),
                    new Look(R.drawable.widget_bg_blue, R.drawable.widget_lera_confused, 0, "{due} ideas want a review"),
                };
            case AFTERNOON:
                return new Look[] {
                    new Look(R.drawable.widget_bg_violet, R.drawable.widget_lera_pleading, R.drawable.widget_blend_pleading, "Got 3 minutes?"),
                    new Look(R.drawable.widget_bg_violet, R.drawable.widget_lera_pleading, 0, "Pretty please?"),
                    new Look(R.drawable.widget_bg_purple, R.drawable.widget_lera_bored, 0, "x misses you."),
                };
            case EVENING:
                return new Look[] {
                    new Look(R.drawable.widget_bg_orange, R.drawable.widget_lera_scared, 0, "Save your streak!"),
                    new Look(R.drawable.widget_bg_orange, R.drawable.widget_lera_pleading, 0, "Don't break the chain!"),
                    new Look(R.drawable.widget_bg_red, R.drawable.widget_lera_angry, 0, "{n}-day streak on the line"),
                };
            case LATE:
                return new Look[] {
                    new Look(R.drawable.widget_bg_maroon, R.drawable.widget_lera_cry, R.drawable.widget_blend_menace, "Now or never!"),
                    new Look(R.drawable.widget_bg_red, R.drawable.widget_lera_cry, 0, "Last chance! {t} left"),
                    new Look(R.drawable.widget_bg_maroon, R.drawable.widget_lera_scared, R.drawable.widget_blend_menace, "{t} left."),
                };
            case NIGHT:
                return new Look[] {
                    new Look(R.drawable.widget_bg_night, R.drawable.widget_lera_sleepy, 0, "Dreaming of x²…"),
                };
            case LOST:
                return new Look[] {
                    new Look(R.drawable.widget_bg_ice, R.drawable.widget_lera_sad, 0, "It's gone… start again?"),
                    new Look(R.drawable.widget_bg_ice, R.drawable.widget_lera_frozen, R.drawable.widget_blend_frozen, "Brr. Thaw me out?"),
                    new Look(R.drawable.widget_bg_ice, R.drawable.widget_lera_cry, 0, "I waited all night."),
                };
            case DAYS:
                return new Look[] {
                    new Look(R.drawable.widget_bg_violet, R.drawable.widget_lera_bored, R.drawable.widget_blend_bored, "I'm waiting…"),
                    new Look(R.drawable.widget_bg_mist, R.drawable.widget_lera_angry, 0, "{d} days. Really?"),
                    new Look(R.drawable.widget_bg_violet, R.drawable.widget_lera_bored, 0, "Still here."),
                };
            case WEEK:
                return new Look[] {
                    new Look(R.drawable.widget_bg_dust, R.drawable.widget_lera_dusty, 0, "A week. I have cobwebs."),
                    new Look(R.drawable.widget_bg_dust, R.drawable.widget_lera_dusty, 0, "{d} days. Dust me off?"),
                };
            case MONTH:
                return new Look[] {
                    new Look(R.drawable.widget_bg_mist, R.drawable.widget_lera_ghost, 0, "Remember me?"),
                    new Look(R.drawable.widget_bg_mist, R.drawable.widget_lera_ghost, 0, "Boo. {d} days."),
                };
            case YEAR:
                return new Look[] {
                    new Look(R.drawable.widget_bg_stone, R.drawable.widget_lera_fossil, 0, "Lera, fossil. Dig me up?"),
                    new Look(R.drawable.widget_bg_stone, R.drawable.widget_lera_fossil, 0, "{d} days. I'm a rock now."),
                };
            case POKE:
                return new Look[] {
                    new Look(R.drawable.widget_bg_purple, R.drawable.widget_lera_laugh, 0, "Hey, that tickles!"),
                    new Look(R.drawable.widget_bg_blue, R.drawable.widget_lera_laugh, 0, "Ha! Now solve one."),
                    new Look(R.drawable.widget_bg_violet, R.drawable.widget_lera_confused, 0, "Poke the maths instead."),
                    new Look(R.drawable.widget_bg_orange, R.drawable.widget_lera_cool, 0, "Tap the card. I dare you."),
                };
            default:
                return new Look[] {
                    new Look(R.drawable.widget_bg_purple, R.drawable.widget_lera_happy, 0, "Let's solve one?"),
                };
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        refresh(context);
    }

    @Override
    public void onEnabled(Context context) {
        schedule(context);
    }

    @Override
    public void onDisabled(Context context) {
        if (!anyPlaced(context)) {
            AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarms != null) alarms.cancel(tick(context));
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (ACTION_TICK.equals(action)) {
            refresh(context);
        } else if (ACTION_POKE.equals(action)) {
            SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            p.edit().putLong("pokeAt", System.currentTimeMillis()).putInt("pokeN", p.getInt("pokeN", 0) + 1).apply();
            refresh(context);
            // she settles back to what she was showing a few seconds later
            final Context app = context.getApplicationContext();
            new Handler(Looper.getMainLooper()).postDelayed(() -> refresh(app), 6500);
        }
    }

    private static int[] ids(Context context, Class<?> provider) {
        int[] ids = AppWidgetManager.getInstance(context).getAppWidgetIds(new ComponentName(context, provider));
        return ids == null ? new int[0] : ids;
    }

    static boolean anyPlaced(Context context) {
        return ids(context, StreakWidget.class).length > 0 || ids(context, StreakWidgetWide.class).length > 0;
    }

    /** Redraw every placed widget of both sizes, and keep the clock that redraws them running. */
    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] small = ids(context, StreakWidget.class);
        int[] wide = ids(context, StreakWidgetWide.class);
        if (small.length > 0) manager.updateAppWidget(small, build(context, false));
        if (wide.length > 0) manager.updateAppWidget(wide, build(context, true));
        schedule(context);
    }

    private static PendingIntent tick(Context context) {
        Intent intent = new Intent(context, StreakWidget.class).setAction(ACTION_TICK);
        return PendingIntent.getBroadcast(context, 1, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void schedule(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null || !anyPlaced(context)) return;
        boolean test = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("test", false);
        long every = test ? MINUTE : 15 * MINUTE;
        alarms.setRepeating(AlarmManager.RTC, System.currentTimeMillis() + every, every, tick(context));
    }

    private static String day(int offset) {
        Calendar c = Calendar.getInstance();
        c.add(Calendar.DAY_OF_YEAR, offset);
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(c.getTime());
    }

    private static long daysSince(String day) {
        try {
            Date then = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(day);
            Date today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(day(0));
            if (then == null || today == null) return 0;
            return Math.max(0, Math.round((today.getTime() - then.getTime()) / 86400000.0));
        } catch (Exception e) {
            return 0;
        }
    }

    static RemoteViews build(Context context, boolean wide) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        boolean known = p.getBoolean("known", false);
        boolean test = p.getBoolean("test", false);
        int stored = p.getInt("streak", 0);
        String last = p.getString("lastDay", "");
        int goal = p.getInt("goal", 30);
        int xpToday = p.getInt("xpToday", 0);
        int due = p.getInt("due", 0);
        Calendar cal = Calendar.getInstance();
        int hour = cal.get(Calendar.HOUR_OF_DAY);

        // which rung of the ladder
        int stage;
        long ignoredDays = last.isEmpty() ? 0 : daysSince(last);
        long seed;
        if (!known) {
            stage = NEW;
            seed = 0;
        } else if (test) {
            int step = (int) Math.min(Math.max(0, (now - p.getLong("seenAt", now)) / MINUTE), LADDER.length - 1);
            stage = LADDER[step];
            ignoredDays = TEST_DAYS[step];
            seed = now / MINUTE;
        } else {
            // the look is re-drawn from the same choices within an hour, so the card does not flicker between lines
            seed = cal.get(Calendar.DAY_OF_YEAR) * 24L + hour;
            if (last.isEmpty()) {
                // never practised: count from when the app was last opened
                ignoredDays = Math.max(0, (now - p.getLong("seenAt", now)) / 86400000L) + 1;
            }
            if (last.equals(day(0))) {
                // practised today: nothing more is asked
                stage = xpToday >= goal ? GOAL : SAFE;
            } else if (ignoredDays <= 1) {
                // the streak is alive (or the app is new) and today is still open: the hour sets the tone
                if (last.isEmpty()) stage = NEW;
                else if (hour < 6) stage = NIGHT;
                else if (hour < 12) stage = MORNING;
                else if (hour < 17) stage = AFTERNOON;
                else if (hour < 21) stage = EVENING;
                else stage = LATE;
            } else if (ignoredDays >= 365) {
                stage = YEAR;
            } else if (ignoredDays >= 30) {
                stage = MONTH;
            } else if (ignoredDays >= 7) {
                stage = WEEK;
            } else if (ignoredDays >= 3) {
                stage = DAYS;
            } else {
                // yesterday was missed: the streak is gone, as of this morning (someone who never had one is simply being waited for)
                stage = hour < 6 ? NIGHT : last.isEmpty() ? DAYS : LOST;
            }
        }
        boolean lost = stage >= LOST && stage <= YEAR;
        boolean atRisk = stage == EVENING || stage == LATE;
        int streak = lost || stage == NEW ? 0 : Math.max(stored, stage == SAFE || stage == GOAL ? 1 : 0);

        int poked = p.getInt("pokeN", 0);
        if (now - p.getLong("pokeAt", 0) < 6000) stage = POKE;
        Look[] all = looks(stage);
        Look look = all[(int) ((seed + poked) % all.length)];
        // a line that needs a number it doesn't have falls back to the stage's first line
        if ((look.line.contains("{due}") && due <= 0) || (look.line.contains("{n}") && streak <= 1)) look = all[0];

        int minutesLeft = (23 - hour) * 60 + (60 - cal.get(Calendar.MINUTE));
        String line = look.line
            .replace("{left}", String.valueOf(Math.max(1, goal - xpToday)))
            .replace("{due}", String.valueOf(due))
            .replace("{n}", String.valueOf(streak))
            .replace("{d}", String.valueOf(Math.max(2, ignoredDays)))
            .replace("{t}", (minutesLeft / 60) + "h " + (minutesLeft % 60) + "m");

        RemoteViews views = new RemoteViews(context.getPackageName(), wide ? R.layout.widget_wide : R.layout.widget_streak);
        views.setInt(R.id.widget_root, "setBackgroundResource", look.bg);
        views.setImageViewResource(R.id.widget_lera, look.face);
        views.setImageViewResource(R.id.widget_flame, lost ? R.drawable.widget_flame_out : atRisk ? R.drawable.widget_flame_alert : R.drawable.widget_flame);
        views.setTextViewText(R.id.widget_count, wide ? streak + (streak == 1 ? " day" : " days") : String.valueOf(streak));
        views.setTextViewText(R.id.widget_line, line);

        if (wide) {
            // this week's days: filled when practised, a ring for today, faint otherwise
            String week = p.getString("week", "0000000");
            boolean current = p.getString("weekStart", "").equals(day(-((cal.get(Calendar.DAY_OF_WEEK) + 5) % 7)));
            int today = (cal.get(Calendar.DAY_OF_WEEK) + 5) % 7;
            int[] dots = { R.id.widget_d0, R.id.widget_d1, R.id.widget_d2, R.id.widget_d3, R.id.widget_d4, R.id.widget_d5, R.id.widget_d6 };
            for (int i = 0; i < 7; i++) {
                boolean on = current && !lost && i < week.length() && week.charAt(i) == '1';
                views.setImageViewResource(dots[i], on ? R.drawable.widget_dot_on : i == today ? R.drawable.widget_dot_today : R.drawable.widget_dot_off);
            }
        } else {
            boolean blend = look.blend != 0;
            views.setViewVisibility(R.id.widget_blend, blend ? View.VISIBLE : View.GONE);
            views.setViewVisibility(R.id.widget_lera, blend ? View.GONE : View.VISIBLE);
            if (blend) views.setImageViewResource(R.id.widget_blend, look.blend);
            Intent poke = new Intent(context, StreakWidget.class).setAction(ACTION_POKE);
            views.setOnClickPendingIntent(R.id.widget_blend, PendingIntent.getBroadcast(context, 2, poke, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }

        // tap her: she reacts. Tap the card: straight into practice.
        Intent poke = new Intent(context, StreakWidget.class).setAction(ACTION_POKE);
        views.setOnClickPendingIntent(R.id.widget_lera, PendingIntent.getBroadcast(context, 2, poke, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        Intent open = new Intent(context, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra("lera_action", "practice");
        views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 3, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return views;
    }
}
