import React from 'react';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../src/theme/tokens';
import { useSettings } from '../../src/contexts/SettingsContext';

export default function TabsLayout() {
  const { settings } = useSettings();
  const insets = useSafeAreaInsets();

  const tapHaptic = () => {
    if (!settings.haptics || Platform.OS === 'web') return;
    Haptics.selectionAsync().catch(() => {});
  };

  // On Android with edge-to-edge enabled, insets.bottom will hold the height
  // of the system navigation bar. We add this to our base height to ensure
  // the tab bar is pushed up correctly.
  const TAB_BAR_BASE_HEIGHT = 64;
  const bottomInset = Platform.OS === 'android' ? insets.bottom : Math.max(insets.bottom, 8);

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
          height: TAB_BAR_BASE_HEIGHT + insets.bottom,
          paddingTop: 8,
          paddingBottom: bottomInset,
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
