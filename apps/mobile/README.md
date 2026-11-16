# Lera, native (iOS and Android)

The React Native build described in `../../MIGRATION.md`. Expo SDK 58, Expo Router, Reanimated, react-native-svg.

- Lera's logic is not copied: the maths engine, book reader and learner model are imported from `../../src` as `@core/...`.
- Built by `.github/workflows/native.yml` on the `native` branch. It installs next to the current app (`com.sirius68.lera.next`).

## Where it stands

| Phase (MIGRATION.md) | State |
| --- | --- |
| 0 Project, CI | done |
| 1 Shared core runs on the phone | done: `app/check.tsx` checks working line by line with the same engine |
| 2 Onboarding and sign-in | not started |
| 3 Lessons and book import | not started |
| 4 Lera's 50 moods | started: body, blink, breathing, 4 moods in `components/Lera.tsx` |
| 5 Practice with the box keyboard | not started |
| 6 Ask Lera, notebook | not started |
| 7 Widgets (Android and iOS) | not started |
| 8 Parity check, store builds | not started |

## Run it

    npm install
    npx expo start
