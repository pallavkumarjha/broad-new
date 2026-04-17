import React from 'react';
import { Stack } from 'expo-router';
import { useFonts as useFraunces, Fraunces_400Regular, Fraunces_500Medium, Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';
import { useFonts as useMono, JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/contexts/AuthContext';
import { SettingsProvider } from '../src/contexts/SettingsContext';
import { colors } from '../src/theme/tokens';

export default function RootLayout() {
  const [f1] = useFraunces({ Fraunces_400Regular, Fraunces_500Medium, Fraunces_600SemiBold, Fraunces_700Bold });
  const [f2] = useMono({ JetBrainsMono_400Regular, JetBrainsMono_500Medium });

  if (!f1 || !f2) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.light.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.light.ink} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SettingsProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.light.bg },
              animation: 'fade',
            }}
          />
        </SettingsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
