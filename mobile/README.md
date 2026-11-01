# BETO mobile app

Native iOS/Android version of the BETO web app, built with Expo (SDK 58) and Expo Router.
It shares the lens catalogue (`../constants.tsx`, `../types.ts`) and the tracking engine (`../engine`) with the web app.

## Run it

The live try-on uses native camera and ML modules, so it needs a **development build**; Expo Go will not work.

```bash
cd mobile
npm install
npm run android   # builds and installs on a connected Android phone or emulator (needs Android Studio SDK)
npm run ios       # macOS + Xcode only
```

After the first native build, `npx expo start` is enough for JS-only changes.
Cloud builds without local SDKs: `npx eas-cli@latest build --profile development`.

### Building on Windows

Native C++ object paths from `node_modules` go past Windows' 260-character limit, and the Android SDK's
default CMake 3.22 ships a `ninja` that cannot handle long paths. What worked (Nov 2026):

1. Copy the repo to a short folder (e.g. `C:\bb`) without its root `node_modules`, `.git` and `dist`.
2. `npx expo prebuild --platform android`
3. In `android/app/build.gradle`, inside `android {`, add:
   `externalNativeBuild { cmake { buildStagingDirectory = file("C:/x"); version = "3.31.6" } }`
   (needs CMake 3.31.6 from the SDK Manager and Windows long paths enabled).
4. `cd android && gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64`

The APK lands in `android/app/build/outputs/apk/release/`. It is signed with the debug key: fine for
testing, not for the Play Store. EAS cloud builds avoid all of this.

Release builds shrink code with R8; the keep rules in `app.json` (`expo-build-properties`) stop it from
renaming the Nitro classes that VisionCamera and the face detector look up from C++. Without them the
try-on screen crashes on open.

## How the try-on works

| Step | Code |
| --- | --- |
| Front camera preview | `react-native-vision-camera` v5 (`<Camera>` in `src/app/try-on/[id].tsx`) |
| Face + eye outlines | Google ML Kit via `react-native-vision-camera-face-detector`, converted to preview coordinates |
| Eye measure + smoothing | `measureContourEye` + `EyeTracker` from `../engine` (One Euro filter, blink hiding) |
| Drawing | `src/components/LensOverlay.tsx`: Skia port of the web lens, clipped to the eye opening |

ML Kit gives eye outlines but no iris points, so the lens is centered in the eye opening and sized from
its width (`IRIS_TO_EYE_WIDTH`). That is accurate while the user looks at the screen; the web app's MediaPipe
iris tracking follows sideways glances more closely.

## Not in the app yet

- Photo capture + share (the web app has it)
- Admin dashboard for adding lenses
- App icon and splash (still Expo defaults)
