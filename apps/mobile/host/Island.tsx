import { getLocales } from 'expo-localization';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import island from '../web/island';
import { compose, handle } from './handle';
import { attach, Msg, send } from './link';
import { readBackup } from './phone';
import { canPin } from './widget';

/** A made-up address, never visited: it gives the page a stable home so what it saves is still there next time. */
const ORIGIN = 'https://lera.app.local/';

/**
 * Lera's web screens, inside the app. One web view, loaded once and kept, so opening a lesson or a
 * practice session does not start anything up: it is already there, off screen.
 */
export function Island() {
  const insets = useSafeAreaInsets();
  const ref = useRef<WebView<object>>(null);
  const [backup, setBackup] = useState<string | undefined | null>(null);
  const first = useRef(insets);
  const latest = useRef(insets);
  latest.current = insets;

  useEffect(() => {
    readBackup().then((b) => setBackup(b));
  }, []);

  const html = useMemo(
    () => (backup === null ? null : compose(island, { platform: Platform.OS, lang: getLocales()[0]?.languageTag, insets: { top: first.current.top, bottom: first.current.bottom }, canPin: canPin(), backup })),
    [backup],
  );

  useEffect(() => {
    attach((m: Msg) => ref.current?.injectJavaScript(`window.__leraHost&&window.__leraHost(${JSON.stringify(m)});true;`));
    return () => attach(null);
  }, []);

  useEffect(() => {
    send({ t: 'insets', insets: { top: insets.top, bottom: insets.bottom } });
  }, [insets.top, insets.bottom]);

  if (html === null) return null;
  const view = (
    <WebView<object>
      ref={ref}
      source={{ html, baseUrl: ORIGIN }}
      originWhitelist={['*']}
      style={styles.web}
      containerStyle={styles.web}
      onMessage={(e) => {
        try {
          const m = JSON.parse(e.nativeEvent.data) as Msg;
          handle(m);
          // the page may have loaded before the phone reported its safe areas: tell it again once it is listening
          if (m.t === 'ready') send({ t: 'insets', insets: { top: latest.current.top, bottom: latest.current.bottom } });
        } catch {
          /* not one of ours */
        }
      }}
      onShouldStartLoadWithRequest={(req) => {
        if (req.url.startsWith(ORIGIN) || req.url.startsWith('about:') || req.url.startsWith('data:')) return true;
        // a link out of the app opens in the phone's browser
        if (/^https?:|^mailto:/.test(req.url)) Linking.openURL(req.url).catch(() => undefined);
        return false;
      }}
      // if the system reclaims the page's memory while the app is in the background, start it again
      onContentProcessDidTerminate={() => ref.current?.reload()}
      onRenderProcessGone={() => ref.current?.reload()}
      javaScriptEnabled
      domStorageEnabled
      allowFileAccess
      setSupportMultipleWindows={false}
      textZoom={100}
      overScrollMode="never"
      bounces={false}
      scrollEnabled={false}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      keyboardDisplayRequiresUserAction={false}
      hideKeyboardAccessoryView
      // the reader has its own toolbar for selected text; the system's would sit on top of it
      menuItems={[]}
      allowsInlineMediaPlayback
      showsVerticalScrollIndicator={false}
      showsHorizontalScrollIndicator={false}
    />
  );
  // Android: the page is made shorter while the keyboard is up, so what is being typed stays in view.
  // iPhone: the web view does this itself.
  return Platform.OS === 'android' ? <KeyboardAvoidingView style={styles.web} behavior="padding">{view}</KeyboardAvoidingView> : view;
}

const styles = StyleSheet.create({ web: { flex: 1, backgroundColor: 'transparent' } });
