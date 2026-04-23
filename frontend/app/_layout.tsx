import React from 'react';
import { Stack } from 'expo-router';
import { useFonts as useFraunces, Fraunces_400Regular, Fraunces_500Medium, Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { useFonts as useMono, JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { View, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/contexts/AuthContext';
import { SettingsProvider } from '../src/contexts/SettingsContext';
import { colors } from '../src/theme/tokens';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../src/lib/queryClient';
import { GlobalSosListener } from '../src/components/GlobalSosListener';

export default function RootLayout() {
  const [f1] = useFraunces({ Fraunces_400Regular, Fraunces_500Medium, Fraunces_600SemiBold, Fraunces_700Bold });
  const [f2] = useMono({ JetBrainsMono_400Regular, JetBrainsMono_500Medium });

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
            <Stack.Screen name="sos/safe/[id]" options={{ animation: 'fade' }} />
            {/* Auth — crossfade, not directional */}
            <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
          </Stack>
        </SettingsProvider>
      </AuthProvider>
    </SafeAreaProvider>
    </QueryClientProvider>
  );
}
