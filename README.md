<!-- zrzur-publication -->
# Zrzur Mobile

The phone app of [Zrzur](https://zrzur.com) for Android, iPhone and iPad: an open-source group chat platform for friends and communities. It is a native app built with [Expo](https://expo.dev) and React Native, with the same design as the phone layout of [app.zrzur.com](https://app.zrzur.com).

- Android phones, iPhone and iPad (with a split view on iPad).
- Seven languages: English, Arabic (right to left), German, Spanish, French, Russian and Simplified Chinese.
- The app talks to Zrzur's own servers only (`https://api.zrzur.com`), through [`@zrzur/sdk`](https://www.npmjs.com/package/@zrzur/sdk).

## Status

The app is in development. There is no store release yet. The Actions in this repository build test files only:

- **Android:** an APK, signed with the release key when the repository has one, otherwise a clearly named test build signed with the debug key.
- **iOS:** an unsigned build for the iOS Simulator. A build that installs on a real iPhone or iPad needs the project's Apple Developer signing (or EAS with the project's Expo account). This is not set up yet.

Nothing is uploaded to Google Play or the App Store automatically.

## Quick start

Needs Git and Node.js 24.

```bash
git clone https://github.com/zrzur/mobile.git
cd mobile
npm ci
npm run i18n:compile
npx expo start
```

The app uses native modules that Expo Go does not include (calls, notifications, secure storage), so it runs in a development build:

```bash
npx expo run:android   # Android Studio and an emulator or a phone with USB debugging
npx expo run:ios       # macOS with Xcode and a simulator
```

`npx expo prebuild` generates the `android/` and `ios/` folders from `app.json` and its config plugins. They are not kept in Git; never edit them by hand.

### Against a local server

A development build can point at your own [backend](https://github.com/zrzur/backend) instead of `api.zrzur.com`. Release builds always use `api.zrzur.com`.

```bash
npm run start:local                                   # http://127.0.0.1:14702
ZRZUR_LOCAL_API=<computer address>:14702 npm run start:local   # from a phone on the same network
```

An Android emulator reaches the computer at `10.0.2.2`.

## Checks

```bash
npm run typecheck   # TypeScript (tsc --noEmit)
npm run lint        # ESLint (expo lint)
npm test            # Jest
npm run check       # all three
```

CI runs the same checks and confirms that the compiled translation catalogs match the `.po` files.

## Translations

[Lingui](https://lingui.dev) catalogs live in `src/i18n/locales/<language>/messages.po`. The message ids are the same as in the web app, so existing translations are reused.

```bash
npm run i18n:extract                       # update the .po files from the source
npm run i18n:reuse -- <web catalogs dir>   # copy translations that already exist in the web app
npm run i18n:compile                       # write messages.ts (needed before running)
```

Arabic is Modern Standard Arabic, and every screen is checked right to left.

## Layout

| Folder | What is inside |
| --- | --- |
| `src/app/` | Screens (Expo Router): `(auth)` signed out, `(setup)` first steps, `(app)` signed in |
| `src/auth/` | Sign-in, two-factor, sign-up, email confirmation, session storage (keychain / encrypted preferences) |
| `src/sdk/` | The SDK's state and events as React state |
| `src/chat/`, `src/voice/` | Messages, composer, calls |
| `src/ui/` | Design-system components and the app's pages |
| `src/theme/` | Zrzur colours, type and spacing |
| `src/i18n/` | Languages and catalogs |

## Builds on GitHub Actions

| Workflow | When | Result |
| --- | --- | --- |
| `CI` | Push and pull request to `main` and `beta` | Type check, lint, tests, translation check |
| `Android build` | By hand, and on version tags | APK as a workflow artifact |
| `iOS build` | By hand only | Unsigned simulator `.app` (zipped) as a workflow artifact |

Android release signing reads these repository secrets. Without them the APK is signed with the debug key and named `zrzur-mobile-android-TEST-debug-signed`:

| Secret | Content |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | The upload keystore (`.jks`), base64-encoded |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEY_PASSWORD` | Key password |

## Other parts of Zrzur

- [zrzur/web](https://github.com/zrzur/web): the web app
- [zrzur/desktop](https://github.com/zrzur/desktop): the desktop app for Windows, macOS and Linux
- [zrzur/backend](https://github.com/zrzur/backend): API, real-time gateway, files and media
- [zrzur/sdk-js](https://github.com/zrzur/sdk-js): `@zrzur/sdk`, the library this app uses
- [zrzur/self-hosted](https://github.com/zrzur/self-hosted): run your own instance

## Contributing and security

- Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md). Open pull requests into `beta`.
- Security reports: [SECURITY.md](./SECURITY.md).
- Code of conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Licence

- Licence: GNU Affero General Public License v3.0, see [LICENSE](./LICENSE).
- Notices and bundled assets: [NOTICE](./NOTICE).
- "Zrzur" and the Zrzur logo are trademarks of the Zrzur project and are not covered by the source code licence.

Zrzur is not affiliated with Stoat, stoat.chat or Revolt Platforms Ltd. Please do not report Zrzur issues to the Stoat team.
