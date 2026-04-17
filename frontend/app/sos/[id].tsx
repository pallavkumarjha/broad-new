import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../src/lib/api';
import { colors, type, space, fonts } from '../../src/theme/tokens';
import { Eyebrow, Meta, SpecRow } from '../../src/components/ui';
import { SafeButton } from '../../src/components/SOSButton';

export default function SOS() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<any>(null);
  const blink = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 0.25, duration: 700, useNativeDriver: true }),
      ])
    ).start();
  }, [blink]);

  useEffect(() => {
    (async () => {
      try {
        // get the active SOS by id (mocked via my-active-sos)
        const { data } = await api.get('/sos/active');
        setEvent(data);
      } catch {}
    })();
  }, [id]);

  const resolve = async () => {
    try { await api.post(`/sos/${id}/resolve`); } catch {}
    router.replace(`/sos/safe/${id}`);
  };

  return (
    <View style={styles.container} testID="sos-active-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <Animated.View style={[styles.bigDot, { opacity: blink }]} />
          <Eyebrow color={colors.dark.sos}>SOS — BROADCASTING</Eyebrow>
        </View>

        <View style={styles.body}>
          <Text style={[type.display, { color: colors.dark.ink }]}>Help is on the way.</Text>
          <Text style={[type.bodyLg, { color: colors.dark.inkMuted, marginTop: space.sm }]}>
            Your location, heading and speed are being broadcast to your convoy and emergency contacts.
          </Text>

          <View style={styles.statBlock}>
            <SpecRow dark label="STATUS" value="ACTIVE" />
            <SpecRow dark label="LOCATION" value={event ? `${event.lat.toFixed(3)}°N ${event.lng.toFixed(3)}°E` : '— —'} />
            <SpecRow dark label="SPEED" value={event ? `${Math.round(event.speed_kmh)} KM/H` : '0 KM/H'} />
            <SpecRow dark label="SENT TO" value="CONVOY · CONTACTS" last />
          </View>

          <View style={styles.list}>
            <Meta style={{ color: colors.dark.inkMuted }}>BROADCAST LOG</Meta>
            <Text style={[type.body, { color: colors.dark.ink, fontFamily: fonts.mono, marginTop: space.sm }]}>
              {`> CONVOY ALERT  ✓\n> EMERGENCY CONTACTS  ✓\n> NEAREST HOSPITAL  PENDING\n> SMS FALLBACK  QUEUED`}
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <SafeButton onConfirm={resolve} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0303' },
  header: { paddingHorizontal: space.lg, paddingTop: space.lg, flexDirection: 'row', alignItems: 'center', gap: 10 },
  bigDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.dark.sos },
  body: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.xl },
  statBlock: { marginTop: space.xl, borderTopWidth: 1, borderColor: colors.dark.rule },
  list: { marginTop: space.xl },
  footer: { padding: space.lg, borderTopWidth: 1, borderColor: colors.dark.rule },
});
