import React from 'react';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { colors, fonts } from '../../src/theme/tokens';
import { useSettings } from '../../src/contexts/SettingsContext';

export default function TabsLayout() {
  const { settings } = useSettings();
  const tapHaptic = () => {
    if (!settings.haptics || Platform.OS === 'web') return;
    Haptics.selectionAsync().catch(() => {});
  };
  return (
    <Tabs
      screenListeners={{ tabPress: tapHaptic }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.light.amber,
        tabBarInactiveTintColor: colors.light.inkMuted,
        tabBarStyle: {
          backgroundColor: colors.light.bg,
          borderTopWidth: 1,
          borderTopColor: colors.light.rule,
          height: 64,
          paddingTop: 8,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.monoMed,
          fontSize: 9,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
        },
        tabBarIcon: ({ color }) => {
          const map: Record<string, keyof typeof Feather.glyphMap> = {
            index: 'home',
            trips: 'map',
            discover: 'compass',
            profile: 'user',
          };
          const name = map[route.name] || 'circle';
          return <Feather name={name} size={20} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="trips" options={{ title: 'Trips' }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
