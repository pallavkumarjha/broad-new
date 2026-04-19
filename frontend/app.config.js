// Dynamic Expo config — branches app name / package / backend URL on APP_ENV.
// Set APP_ENV=development for the dev/integration build (coexists on device
// with prod, pointed at the integration backend). Default = production.
//
// EAS reads APP_ENV from the matching build profile in eas.json via its "env"
// block. For `expo start` locally, `APP_ENV=development expo start` works.

const IS_DEV = process.env.APP_ENV === 'development';

// Backend URL precedence: explicit env var > env-specific default > prod default.
// .env is still honoured at build-time via EXPO_PUBLIC_BACKEND_URL.
const DEFAULT_BACKEND =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  (IS_DEV
    ? 'https://broad-backend-integration.up.railway.app' // placeholder — create Railway integration env, then update
    : 'https://broad-backend-production.up.railway.app');

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
      permissions: [
        'android.permission.USE_BIOMETRIC',
        'android.permission.USE_FINGERPRINT',
        'android.permission.RECORD_AUDIO',
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
