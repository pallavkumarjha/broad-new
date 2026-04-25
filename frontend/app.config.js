// Dynamic Expo config — branches app name / package / backend URL on APP_ENV.
// Set APP_ENV=development for the dev/integration build (coexists on device
// with prod, pointed at the integration backend). Default = production.
//
// EAS reads APP_ENV from the matching build profile in eas.json via its "env"
// block. For `expo start` locally, `APP_ENV=development expo start` works.

const IS_DEV = process.env.APP_ENV === 'development';

// Backend URL precedence: explicit env var > env-specific default > prod default.
// .env is still honoured at build-time via EXPO_PUBLIC_BACKEND_URL.
//
// Prod default is the Vercel-hosted proxy (broad-homepage) rather than Railway
// directly. Reason: Indian mobile carriers (Jio/Airtel/Vi) intermittently fail
// to route to Railway's Fastly edge; Vercel's Mumbai POP is reliably reachable,
// and the proxy at /api/[...path] forwards server-to-server to Railway.
// If you need to bypass the proxy (e.g. debugging), set EXPO_PUBLIC_BACKEND_URL
// to the Railway URL directly via .env or the EAS profile's env block.
const DEFAULT_BACKEND =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  (IS_DEV
    ? 'https://broad-backend-integration.up.railway.app' // placeholder — create Railway integration env, then update
    : 'https://broad-homepage.vercel.app');

module.exports = () => ({
  expo: {
    name: IS_DEV ? 'broad-dev' : 'Broad',
    slug: 'broad-rider',
    owner: 'pallavjha',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: IS_DEV ? 'broaddev' : 'broad',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      // Different bundle ID so dev and prod coexist on the same device.
      bundleIdentifier: IS_DEV ? 'app.broad.rider.dev' : 'app.broad.rider',
    },
    android: {
      package: IS_DEV ? 'app.broad.rider.dev' : 'app.broad.rider',
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        // Cream to match the logo's canvas — black looked jarring against the
        // cream helmet shell once the new icon landed.
        backgroundColor: '#EFECE5',
      },
      edgeToEdgeEnabled: true,
      // Allow plain HTTP only in dev builds so Metro/LAN backend (http://192.168.x.x:8000)
      // is reachable. Production stays HTTPS-only.
      usesCleartextTraffic: IS_DEV,
      permissions: [
        'android.permission.USE_BIOMETRIC',
        'android.permission.USE_FINGERPRINT',
        'android.permission.RECORD_AUDIO',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        // Background location — opt-in per ride. Required so the foreground
        // service can keep updating the crew when the rider locks the screen
        // or switches apps to navigation.
        'android.permission.ACCESS_BACKGROUND_LOCATION',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_LOCATION',
      ],
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-image.png',
          imageWidth: 220,
          resizeMode: 'contain',
          backgroundColor: '#EFECE5',
        },
      ],
      'expo-secure-store',
      [
        'expo-local-authentication',
        {
          faceIDPermission: 'Allow Broad to use Face ID to protect your Glovebox documents.',
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: 'Allow Broad to access your photo library to attach document images to your Glovebox.',
          cameraPermission: 'Allow Broad to use your camera to photograph documents for your Glovebox.',
        },
      ],
      'expo-document-picker',
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'Allow Broad to access your location so your crew can see you on the map during a ride.',
          locationWhenInUsePermission:
            'Allow Broad to access your location so your crew can see you on the map during a ride.',
          // iOS — required for the background location task to keep running
          // while the screen is off. Without this the OS suspends us.
          isIosBackgroundLocationEnabled: true,
          isAndroidBackgroundLocationEnabled: true,
          // Foreground service notification text on Android. Riders see this
          // pinned to their notification shade for the duration of a ride.
          isAndroidForegroundServiceEnabled: true,
        },
      ],
      'expo-task-manager',
      [
        'expo-notifications', // Start a new array for notifications
        {
          color: '#1C1B1A',
          sounds: [],
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: 'ecb122aa-3c20-4822-bfc9-6db58e209e48',
      },
      appEnv: IS_DEV ? 'development' : 'production',
      backendUrl: DEFAULT_BACKEND,
    },
  },
});
