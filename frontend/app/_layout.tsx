import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useFonts as useFraunces, Fraunces_400Regular, Fraunces_500Medium, Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { useFonts as useMono, JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { View, Text, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { AuthProvider } from '../src/contexts/AuthContext';
import { SettingsProvider } from '../src/contexts/SettingsContext';
import { colors } from '../src/theme/tokens';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../src/lib/queryClient';
import { GlobalSosListener } from '../src/components/GlobalSosListener';
// Importing for side effect: registers the background-location task with the
// OS at app startup. Has to happen before any code calls
// `Location.startLocationUpdatesAsync(BACKGROUND_LOC_TASK, ...)` and also
// has to happen on cold restart so the OS can deliver queued samples that
// arrived while the app was killed.
import '../src/lib/backgroundLocation';

// ── Notification display handler ──────────────────────────────────────────────
// Controls how notifications appear when the app is in the foreground.
// Must be set at module level (before any component mounts).
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: false,
    }),
  });
}

// ── Navigate based on notification payload ────────────────────────────────────
function useNotificationNavigation() {
  const router = useRouter();

  const navigate = React.useCallback((data: Record<string, any> | undefined) => {
    if (!data) return;
    const { type, trip_id, sos_id } = data as any;
    // SOS push notifications are received by *other* riders — the sender's
    // own client navigates to /sos/{id} immediately after triggering. So the
    // tap-target for a push is the responder view, not the sender's resolve
    // screen (which would let a responder accidentally hit the "I'm safe"
    // button on someone else's emergency).
    if (type === 'sos' && sos_id)                                      router.push(`/sos/respond/${sos_id}` as any);
    else if (trip_id && (
      type === 'trip_request' ||
      type === 'trip_request_approved' ||
      type === 'trip_request_declined' ||
      type === 'trip_left' ||
      type === 'trip_removed' ||
      type === 'trip_started'
    ))                                                                  router.push(`/trip/${trip_id}` as any);
  }, [router]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // App was killed — user tapped notification to open it.
    // Small delay lets Expo Router finish mounting the navigator before we push.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        setTimeout(() => navigate(response.notification.request.content.data as any), 300);
      }
    });

    // App was backgrounded — user tapped notification while it was suspended.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      navigate(response.notification.request.content.data as any);
    });

    return () => sub.remove();
  }, [navigate]);
}

export default function RootLayout() {
  const [f1] = useFraunces({ Fraunces_400Regular, Fraunces_500Medium, Fraunces_600SemiBold, Fraunces_700Bold });
  const [f2] = useMono({ JetBrainsMono_400Regular, JetBrainsMono_500Medium });

  useNotificationNavigation();

  if (!f1 || !f2) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.light.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: 'System', fontSize: 34, letterSpacing: 8, color: colors.light.ink, fontWeight: '700' }}>
          BROAD
        </Text>
        <View style={{ width: 48, height: 2, backgroundColor: colors.light.amber, marginTop: 18 }} />
        <Text style={{ marginTop: 14, fontSize: 10, letterSpacing: 2, color: colors.light.inkMuted }}>
          THE RIDER'S COMPANION
        </Text>
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
    <SafeAreaProvider>
      <AuthProvider>
        <SettingsProvider>
          <GlobalSosListener />
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.light.bg },
              animation: 'slide_from_right',  // M9 — default: feels native
            }}
          >
            {/* Instrument panel slides up from bottom — feels like lifting a visor */}
            <Stack.Screen name="ride/[id]" options={{ animation: 'slide_from_bottom' }} />
            {/* Plan sheet slides up — feels like pulling out a map */}
            <Stack.Screen name="plan" options={{ animation: 'slide_from_bottom' }} />
            {/* SOS — full red takeover, no slide, just cut */}
            <Stack.Screen name="sos/[id]" options={{ animation: 'fade' }} />
            <Stack.Screen name="sos/respond/[id]" options={{ animation: 'fade' }} />
            <Stack.Screen name="sos/safe/[id]" options={{ animation: 'fade' }} />
            {/* Edit trip — slides up like plan sheet */}
            <Stack.Screen name="trip/edit/[id]" options={{ animation: 'slide_from_bottom' }} />
            {/* Auth — crossfade, not directional */}
            <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
          </Stack>
        </SettingsProvider>
      </AuthProvider>
    </SafeAreaProvider>
    </QueryClientProvider>
  );
}
