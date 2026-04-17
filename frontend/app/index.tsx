import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/contexts/AuthContext';
import { colors, type, space } from '../src/theme/tokens';

export default function Splash() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      if (user) router.replace('/(tabs)');
      else router.replace('/(auth)/login');
    }, 600);
    return () => clearTimeout(t);
  }, [user, loading, router]);

  return (
    <SafeAreaView style={styles.container} testID="splash-screen">
      <View style={styles.center}>
        <Text style={[type.eyebrow, { color: colors.light.inkMuted, marginBottom: space.sm }]}>EST. 2026 — INDIA</Text>
        <Text style={[type.display, { color: colors.light.ink, marginBottom: space.xs }]}>Broad</Text>
        <View style={styles.rule} />
        <Text style={[type.bodyLg, { color: colors.light.inkMuted, marginTop: space.md, textAlign: 'center', maxWidth: 280 }]}>
          The rider's companion.{'\n'}Plan, ride together, stay safe.
        </Text>
      </View>
      <View style={styles.footer}>
        <ActivityIndicator color={colors.light.amber} size="small" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  rule: { width: 64, height: 1, backgroundColor: colors.light.ink, marginTop: space.md },
  footer: { paddingBottom: space.xl, alignItems: 'center' },
});
