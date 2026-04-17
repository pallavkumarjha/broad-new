import React from 'react';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, fonts } from '../../src/theme/tokens';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.light.ink,
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
            index: 'compass',
            trips: 'map',
            discover: 'globe',
            profile: 'user',
          };
          const name = map[route.name] || 'circle';
          return <Feather name={name} size={20} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="trips" options={{ title: 'Trips' }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
