package com.sirius68.lera;

import android.content.Context;
import android.graphics.Rect;
import android.util.AttributeSet;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;

import com.getcapacitor.CapacitorWebView;

/**
 * The web view Lera runs in.
 *
 * Holding on text in a lesson selects it, and the app shows its own toolbar
 * (highlight, note, save, ask). Android would also float its system menu
 * (Copy / Share / Select all / Web search) on top. This view lets the
 * selection happen but keeps that system menu empty, so only Lera's shows.
 */
public class LeraWebView extends CapacitorWebView {

    public LeraWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    public ActionMode startActionMode(ActionMode.Callback callback) {
        return super.startActionMode(new Quiet(callback));
    }

    @Override
    public ActionMode startActionMode(ActionMode.Callback callback, int type) {
        return super.startActionMode(new Quiet(callback), type);
    }

    /** Passes everything through to the web view's own callback, then removes the menu items. */
    private static final class Quiet extends ActionMode.Callback2 {
        private final ActionMode.Callback inner;

        Quiet(ActionMode.Callback inner) {
            this.inner = inner;
        }

        @Override
        public boolean onCreateActionMode(ActionMode mode, Menu menu) {
            // the web view must believe its action mode started, or it drops the selection
            inner.onCreateActionMode(mode, menu);
            menu.clear();
            return true;
        }

        @Override
        public boolean onPrepareActionMode(ActionMode mode, Menu menu) {
            inner.onPrepareActionMode(mode, menu);
            menu.clear();
            return true;
        }

        @Override
        public boolean onActionItemClicked(ActionMode mode, MenuItem item) {
            return inner.onActionItemClicked(mode, item);
        }

        @Override
        public void onDestroyActionMode(ActionMode mode) {
            inner.onDestroyActionMode(mode);
        }

        @Override
        public void onGetContentRect(ActionMode mode, View view, Rect outRect) {
            if (inner instanceof ActionMode.Callback2) {
                ((ActionMode.Callback2) inner).onGetContentRect(mode, view, outRect);
            } else {
                super.onGetContentRect(mode, view, outRect);
            }
        }
    }
}
