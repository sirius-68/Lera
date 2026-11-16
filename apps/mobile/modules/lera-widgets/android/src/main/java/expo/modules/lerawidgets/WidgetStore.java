package expo.modules.lerawidgets;

import android.content.Context;
import android.content.Intent;

/** What the widgets and the app share that is not a saved number. */
final class WidgetStore {
    /** Where a tap on a widget wants the app to go; read once by the app. */
    static volatile String pendingAction = null;

    private WidgetStore() {
    }

    /** The intent that opens the app, whatever its main screen is called. */
    static Intent launch(Context context) {
        Intent intent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) intent = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(context.getPackageName());
        return intent;
    }
}
