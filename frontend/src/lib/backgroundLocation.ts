import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { storage, TOKEN_KEY } from './api';

/** Background location task name. Must be a stable string — TaskManager
 * registers tasks at module import time and the OS holds a reference by name. */
export const BACKGROUND_LOC_TASK = 'broad-bg-location';

/** Storage key for the trip we're currently tracking. The background task
 * has no React context, no Redux store — it can only read what we put in
 * persistent storage before starting tracking. */
const ACTIVE_TRIP_KEY = 'broad.bg.active_trip';

/** Read the backend URL from the same env the rest of the app uses, so the
 * background task hits the same server even after a JS hot reload. */
function backendUrl(): string | null {
  return process.env.EXPO_PUBLIC_BACKEND_URL || null;
}

/** Define the background task. Runs on the OS's location-update cadence
 * (every ~5–30s while moving, less often when stationary). The task body
 * must be small + fast — Android kills tasks that exceed ~10s of work. */
TaskManager.defineTask(BACKGROUND_LOC_TASK, async ({ data, error }) => {
  if (error) return;
  if (!data) return;
  // expo-location packages multiple samples in one task fire when the OS
  // batched them while we were suspended. We ship the latest only — older
  // samples are useless for live tracking.
  const locations: Location.LocationObject[] = (data as any).locations || [];
  const sample = locations[locations.length - 1];
  if (!sample) return;

  const tripId = await storage.getItem(ACTIVE_TRIP_KEY);
  const token = await storage.getItem(TOKEN_KEY);
  const base = backendUrl();
  if (!tripId || !token || !base) return;

  const speedMs = sample.coords.speed ?? -1;
  const speed_kmh = speedMs >= 0 ? Math.round(speedMs * 3.6) : 0;
  const heading_deg = typeof sample.coords.heading === 'number' && sample.coords.heading >= 0 ? sample.coords.heading : 0;
  const accuracy_m = typeof sample.coords.accuracy === 'number' && sample.coords.accuracy >= 0 ? sample.coords.accuracy : null;

  // Plain `fetch` rather than the axios `api` instance — axios pulls in the
  // full interceptor stack and refresh-token flow, which is overkill for a
  // fire-and-forget background ping and may behave oddly when the app's
  // React tree is suspended. Token refresh on background failures is left
  // for the foreground tick to handle.
  try {
    await fetch(`${base}/api/trips/${tripId}/pos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        lat: sample.coords.latitude,
        lng: sample.coords.longitude,
        speed_kmh,
        heading_deg,
        accuracy_m,
      }),
    });
  } catch {
    // Swallow — phone may be in a tunnel. Next sample will retry naturally.
  }
});

/** Start the background location task for a given trip. Idempotent — calling
 * twice with the same trip is fine, calling with a different trip cleanly
 * stops the previous task first. */
export async function startBackgroundTracking(tripId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (Platform.OS === 'web') return { ok: false, reason: 'unsupported' };

  // Foreground permission first — OS won't grant background without it.
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return { ok: false, reason: 'foreground_denied' };

  // Then upgrade to background. On Android 10+ the user must pick "Allow all
  // the time" in the system settings sheet; we surface the prompt and let
  // them decide.
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return { ok: false, reason: 'background_denied' };

  await storage.setItem(ACTIVE_TRIP_KEY, tripId);

  // Stop any previous tracking — different trip, or stale registration that
  // survived a hot reload.
  const already = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOC_TASK).catch(() => false);
  if (already) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOC_TASK).catch(() => {});
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOC_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    // 5s / 10m — fine balance between battery and crew-map smoothness for
    // motorcycle speeds. The OS may further throttle when stationary.
    timeInterval: 5000,
    distanceInterval: 10,
    showsBackgroundLocationIndicator: true, // iOS — blue bar
    foregroundService: {
      // Persistent notification on Android — required by FOREGROUND_SERVICE_LOCATION.
      // Riders see this pinned for the whole ride; tapping it brings the app forward.
      notificationTitle: 'Sharing live location',
      notificationBody: 'Your crew can see you on the map. Tap to open the ride.',
      notificationColor: '#D96606',
    },
    // OS won't start the foreground service if we don't have it active yet;
    // pausesUpdatesAutomatically would also let iOS pause us on stop, which
    // breaks long stationary breaks.
    pausesUpdatesAutomatically: false,
  });

  return { ok: true };
}

/** Stop the background task. Safe to call when not running. */
export async function stopBackgroundTracking(): Promise<void> {
  if (Platform.OS === 'web') return;
  await storage.deleteItem(ACTIVE_TRIP_KEY).catch(() => {});
  const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOC_TASK).catch(() => false);
  if (running) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOC_TASK).catch(() => {});
  }
}

/** Whether the task is currently registered with the OS. Useful for the
 * ride-screen toggle to render its initial state correctly. */
export async function isBackgroundTrackingActive(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOC_TASK).catch(() => false);
}
