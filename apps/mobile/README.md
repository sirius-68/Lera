# Lera, native (Android and iOS)

The React Native build described in `../../MIGRATION.md`: Expo SDK 58, Expo Router, Reanimated, react-native-svg.
It is the whole app. Nothing from the web build is missing, because the screens that are not native yet run inside it.

## How it is put together

| Part | How it runs |
| --- | --- |
| Home, Learn, Practice, Progress, the tab bar | Native (`screens/`) |
| Moving between screens, the back button, toasts | Native (`app/index.tsx`) |
| Lera, all 50 moods, breathing, blinking, tap reactions | Native (`mascot/Lera.tsx`) |
| Haptics, share sheet, clipboard, daily reminder | Native (`host/phone.ts`) |
| Home-screen widgets (Android) | Native module (`modules/lera-widgets`) |
| Lesson reader, practice session, book import, Ask Lera, notebook, settings, streak, onboarding, sign-in | The existing screens from `../../src`, inside the app (`host/Island.tsx`) |

The two halves talk through small JSON messages: `../../src/host.ts` on the web side, `host/link.ts` and
`host/handle.ts` here. The web side owns the saved state and every action on it; the native side keeps a
copy to draw from and sends back what its buttons ask for. So progress is changed and saved in one place.

Lera's logic is shared, not copied: the tabs import the same `../../src/engine` and `../../src/store`
functions the web screens use (as `@core/...`).

## Generated files (not in git)

    npm run island     # builds ../../src into web/island.js, the screens the app carries
    npm run widgets    # copies the Android widgets from ../../android-overrides into the native module
    npm run lera       # redraws mascot/moods.json from the web mascot (needs playwright); this one IS in git

`npm run prepare-native` does the first two. Run it before `npx expo start` or a build.

## Check it without a phone

    npx expo export --platform web --output-dir /tmp/lera-web

serves the same app in a browser, with the web screens in a frame. `/moods` shows every mood of Lera.

## What is left to make native

In order of how much it would be felt: the practice session and its maths keyboard, the lesson reader,
Ask Lera, the notebook, settings and streak, onboarding and sign-in. Then the iOS widget (WidgetKit),
which needs an Apple Developer account to try. Each one can be moved on its own: once a native screen
exists, `go()` in `host/link.ts` stops handing that route to the web side.

Builds: `.github/workflows/native.yml` on the `native` branch. The Android app installs next to the
older one (`com.sirius68.lera.next`).
