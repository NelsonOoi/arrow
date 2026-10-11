# Arrow

Conference networking app that uses Bluetooth Low Energy (BLE) to detect when a matched attendee is physically nearby, then vibrates the phone and opens a match card.

- Expo SDK 55, React Native 0.83, TypeScript, expo-router (routes in `src/app/`)
- BLE via `munim-bluetooth@0.8.1` + `react-native-nitro-modules@0.36.5` (pinned exactly; don't upgrade casually)
- Builds run in the cloud on EAS (Expo project `@maketheswapp/arrow`), so no local Xcode or Android Studio is needed
- Bundle id / package: `com.speedhacks.arrow`

BLE needs native code, so this app **does not run in Expo Go or simulators**. It runs as a development build on physical phones, and JavaScript loads from your Mac over the dev server.

## Requirements

- Node 20.19+ (tested on 22.16) and npm
- An Expo account with access to the `maketheswapp` org
- For iOS: the Apple Developer team (Team ID `KM42FN8X8D`)
- Two or more physical phones to test proximity

EAS CLI is run via `npx eas-cli@latest`, so there's nothing to install globally.

## First-time setup

```bash
npm install
npx eas-cli@latest login
```

The project is already linked to EAS (`extra.eas.projectId` in `app.json`), so `eas init` is not needed again.

## Daily development

Start the dev server (tunnel works across any network):

```bash
npm start
```

Then open the **Arrow** app on each phone:

- **iPhone:** scan the QR code with the Camera app.
- **Android:** open Arrow and use the dev launcher's scan button.

If the tunnel is slow or flaky, use LAN mode instead. The phones and Mac must be on the same Wi-Fi, and that Wi-Fi must allow devices to see each other, which venue networks often don't:

```bash
npm run start:lan
```

While the dev server is running: `r` reloads the app, `m` toggles the dev menu, `j` opens the debugger.

JavaScript changes hot-reload. You only need a new build when native code or `app.json` changes (see below).

## Checks

```bash
npm test             # Jest unit tests (engine, token parsing, user data, signal)
npm run typecheck    # tsc --noEmit
npx expo-doctor      # dependency/config checks; the Xcode version warning is expected (EAS builds iOS)
```

## Builds (EAS)

| Command | What it does |
|---|---|
| `npm run build:dev:android` | Android development build (APK) |
| `npm run build:dev:ios` | iOS development build (ad hoc, registered iPhones only) |
| `npm run build:dev` | Both platforms |
| `npm run build:preview` | Internal build without the dev client, for demos |

Useful EAS commands:

```bash
npx eas-cli@latest build:list --limit 5            # recent builds + download links
npx eas-cli@latest build:view <build-id>           # status of one build
npx eas-cli@latest device:list                     # registered iPhones
```

**Rebuild only when** you add or upgrade a package with native code, change `app.json` (permissions, plugins, bundle id, icons), or change `eas.json`. Everything else reloads over `npm start`.

## Installing on phones

### Android

Open the build page on the phone (or scan its QR code), download the APK, allow installs from that source, and install. Any Android phone can install it; there is no device list.

### iPhone

iOS internal builds only install on iPhones that were registered **before** the build was signed.

1. **Register the iPhone:**

   ```bash
   npx eas-cli@latest device:create
   ```

   Choose **Website**, open the link **in Safari on the iPhone**, then **Settings > Profile Downloaded > Install**.

2. **Get a build that includes it.** Either re-sign the latest build (fast, no recompile):

   ```bash
   npx eas-cli@latest build:resign --platform ios --profile development
   ```

   Select the latest iOS build and make sure the new device is selected. Or rebuild with `npm run build:dev:ios` and answer yes when EAS offers to update the provisioning profile with new devices.

3. **Install:** open the build link in Safari and tap **Install**.

4. **Turn on Developer Mode:** **Settings > Privacy & Security > Developer Mode**, then restart and tap **Turn On**. The option only appears after the app is installed.

   If the phone has Stolen Device Protection on and you're away from a familiar location (home/work), iOS enforces a **one-hour Security Delay**: authenticate, wait an hour, authenticate again. Start it early and keep the phone with you.

Phones that already have the app keep working when new devices are added; they only need the new build if you want everyone on the same one.

## Testing proximity on two phones

1. Phone A: pick **Maya Chen**. Phone B: pick **Diego Alvarez** (they're a match; see `src/data/users.ts` for all users and matches).
2. Allow the Bluetooth permission prompts.
3. Open the **Debug** tab: the other phone should appear within a few seconds, with its signal strength and whether its token came from the advertised name (`localName`) or a GATT read (`gatt`).
4. Walk the phones apart, then together: the phone vibrates once and a match card opens. The same match won't alert again for 30 seconds.
5. Tune the alert distance in **Profile** (RSSI threshold; closer to 0 means the phones must be nearer).

Keep the app in the foreground; background detection is out of scope.

## Project layout

```
src/
  app/          expo-router screens (tabs: Nearby, Matches, Profile, Debug; plus onboarding,
                match card, finder, nearby devices, signal)
  ble/          munim-bluetooth wrappers: permissions, advertising, scanning, token resolution
  proximity/    pure proximity engine (smoothing, hysteresis, cooldown) + React hooks
  haptics/      vibration alert
  data/         local users and matches (stand-in until there's a database)
  store/        zustand stores: session (persisted) and radar (live BLE state)
  components/   shared UI
```

Tunable constants (service UUIDs, RSSI threshold, smoothing window, cooldown, timeouts) live in `src/ble/constants.ts`.

## Troubleshooting

- **`eas: command not found`:** use `npx eas-cli@latest ...` (or the `npm run build:*` scripts, which already do).
- **`Missing build profile in eas.json: "production"`:** pass `--profile development` (e.g. to `build:resign`).
- **iOS app won't open after install:** Developer Mode is off, or the phone hasn't restarted since turning it on.
- **iPhone can't install the build:** it was registered after the build was signed. Re-sign or rebuild (see above).
- **App opens but can't reach the dev server:** check `npm start` is running; try scanning the QR again, or switch between `npm start` (tunnel) and `npm run start:lan`.
- **No peers in Debug:** both phones must be in the foreground with Bluetooth on and permissions granted, and must be signed in as two different users.
- **Android shows the phone's Bluetooth name as `AR<token>`:** expected while advertising; it reverts when scanning stops.
