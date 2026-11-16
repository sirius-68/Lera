import { useEffect } from 'react';
import { setLang } from './i18n';
import { HomeScreen, LessonsScreen, PracticeScreen, ProgressScreen } from './screens/Main';
import { LessonScreen } from './screens/Lesson';
import { AuthGate } from './screens/Auth';
import { Onboarding } from './screens/Onboarding';
import { AskSheet, ReviewSheet } from './screens/Overlays';
import { SessionScreen } from './screens/Session';
import { SavedScreen } from './screens/Saved';
import { SettingsScreen } from './screens/Settings';
import { StreakScreen } from './screens/Streak';
import { UploadScreen } from './screens/Upload';
import { useHydrated, useStore } from './store';
import { Lera } from './mascot/Lera';
import { back, Route, useNav } from './store/nav';
import { Confirmer, Toaster } from './ui/kit';
import { inHost } from './host';
import { TermPop } from './ui/terms';

const TAB_ROUTES = ['home', 'lessons', 'practice', 'progress'];

function Screen({ route, dir }: { route: Route; dir: number }) {
  // inside the native app the four tabs are drawn natively; nothing of them is drawn here
  if (inHost && TAB_ROUTES.includes(route.name)) return null;
  switch (route.name) {
    case 'home':
      return <HomeScreen />;
    case 'lessons':
      return <LessonsScreen />;
    case 'practice':
      return <PracticeScreen />;
    case 'progress':
      return <ProgressScreen />;
    case 'lesson':
      return <LessonScreen route={route} dir={dir} />;
    case 'session':
      return <SessionScreen route={route} />;
    case 'settings':
      return <SettingsScreen />;
    case 'upload':
      return <UploadScreen />;
    case 'streak':
      return <StreakScreen />;
    case 'saved':
      return <SavedScreen />;
  }
}

export function App() {
  // the language is set before anything below is drawn; changing it redraws the whole app in the new one
  const lang = useStore((s) => s.profile.language);
  setLang(lang);
  const onboarded = useStore((s) => s.profile.onboarded);
  const lockedOut = useStore((s) => !!s.profile.email && s.profile.signedIn === false);
  const { stack, dir, overlay } = useNav();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !overlay && stack.length > 1 && stack[stack.length - 1].name !== 'session') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlay, stack]);

  // over a native tab only a sheet (Ask Lera, a review) is drawn, so the page itself must be see-through
  const clear = inHost && onboarded && !lockedOut && TAB_ROUTES.includes(stack[stack.length - 1].name);
  useEffect(() => {
    document.documentElement.classList.toggle('host-clear', clear);
  }, [clear]);

  const ready = useHydrated();
  if (!ready) {
    // the notes are being read back from the device: a blink, on all but the largest books
    return (
      <div className="app">
        <div className="boot"><Lera size={84} mood="idle" interactive={false} /></div>
      </div>
    );
  }

  if (!onboarded) {
    return (
      <div className="app">
        <Onboarding />
        <Toaster />
      </div>
    );
  }

  if (lockedOut) {
    // signed out: nothing of the app is shown until the password is given again
    return (
      <div className="app">
        <AuthGate />
        <Toaster />
      </div>
    );
  }

  return (
    <div className="app" key={lang}>
      {/* every screen in the stack stays mounted, so a practice session survives a detour into a review */}
      {stack.map((route, i) => {
        const top = i === stack.length - 1;
        const key = `${i}:${route.name}:${'topicId' in route ? route.topicId ?? '' : ''}`;
        return (
          <div key={key} className="layer" hidden={!top} aria-hidden={!top}>
            <Screen route={route} dir={top ? dir : 0} />
          </div>
        );
      })}
      {overlay?.name === 'review' && <ReviewSheet key={overlay.concept} concept={overlay.concept} />}
      {overlay?.name === 'ask' && <AskSheet topicId={overlay.topicId} seed={overlay.seed} problem={overlay.problem} lines={overlay.lines} />}
      <TermPop />
      <Confirmer />
      <Toaster />
    </div>
  );
}
