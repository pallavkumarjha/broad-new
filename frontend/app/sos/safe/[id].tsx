import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, type, space } from '../../../src/theme/tokens';
import { Eyebrow, Button, Rule } from '../../../src/components/ui';

export default function SosSafe() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => { router.replace('/(tabs)'); }, 6000);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <SafeAreaView style={styles.container} testID="sos-safe-screen">
      <View style={styles.center}>
        <Eyebrow color={colors.dark.safe}>● ALL CLEAR — RESOLVED</Eyebrow>
        <Text style={[type.display, { color: colors.dark.ink, marginTop: space.md }]}>Stay safe.</Text>
        <View style={styles.rule} />
        <Text style={[type.bodyLg, { color: colors.dark.inkMuted, marginTop: space.md, textAlign: 'center', maxWidth: 320 }]}>
          Your convoy and contacts have been notified that you're okay.{'\n'}Take a breath. Drink water. Then ride on.
        </Text>
      </View>
      <View style={{ padding: space.lg }}>
        <Button label="BACK TO HOME" dark onPress={() => router.replace('/(tabs)')} testID="sos-safe-home-btn" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  rule: { width: 80, height: 1, backgroundColor: colors.dark.safe, marginTop: space.md },
});
