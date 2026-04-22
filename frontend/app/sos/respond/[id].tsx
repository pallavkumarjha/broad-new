import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, describeError } from '../../../src/lib/api';
import { colors, type, space } from '../../../src/theme/tokens';
import { Eyebrow, Meta, SpecRow, ErrorStrip, Card, Button } from '../../../src/components/ui';

const fmtCoord = (value: number, pos: string, neg: string) => `${Math.abs(value).toFixed(3)}°${value >= 0 ? pos : neg}`;

export default function SosResponder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<any>(null);
  const [err, setErr] = useState('');
  const blink = useRef(new Animated.Value(0.3)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 0.25, duration: 700, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true })
    ).start();
  }, [blink, pulse]);

  useEffect(() => {
    (async () => {
      try {
        setErr('');
        const { data } = await api.get(`/sos/${id}`);
        setEvent(data);
      } catch (e: any) {
        setErr(describeError(e, 'Could not load SOS details.'));
      }
    })();
  }, [id]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.4] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0.55, 0.05, 0] });
  const locationText = event?.lat != null ? `${fmtCoord(event.lat, 'N', 'S')} ${fmtCoord(event.lng, 'E', 'W')}` : '— —';
  const primaryContact = event?.emergency_contact || null;

  return (
    <View style={styles.container} testID="sos-responder-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <View style={styles.dotWrap}>
            <Animated.View
              style={[styles.pulseRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
            />
            <Animated.View style={[styles.bigDot, { opacity: blink }]} />
          </View>
          <Eyebrow color={colors.dark.sos}>SOS — CONVOY ALERT</Eyebrow>
        </View>

        <View style={styles.body}>
          {!event && !err ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.dark.amber} />
              <Text style={[type.bodyLg, { color: colors.dark.inkMuted, marginTop: space.md }]}>Loading SOS details…</Text>
            </View>
          ) : err ? (
            <View style={styles.loadingWrap}>
              <ErrorStrip title="COULD NOT LOAD SOS" message={err} testID="sos-respond-error" style={{ width: '100%' }} />
            </View>
          ) : (
            <View style={styles.dialogWrap}>
              <Card dark style={styles.dialogCard}>
                <Eyebrow color={colors.dark.sos}>RIDER IN DISTRESS</Eyebrow>
                <Text style={[type.h1, styles.dialogTitle]}>{event?.sender_name || 'A rider'} needs help.</Text>
                <Text style={[type.bodyLg, styles.dialogDeck]}>
                  This SOS came from your convoy. Reach them, coordinate the group, and call the listed contact if needed.
                </Text>

                <View style={styles.section}>
                  <SpecRow dark label="RIDER" value={event?.sender_name || '—'} valueMono={false} />
                  <SpecRow dark label="LOCATION" value={locationText} />
                  <SpecRow dark label="SPEED" value={event ? `${Math.round(event.speed_kmh)} KM/H` : '0 KM/H'} last />
                </View>

                <View style={styles.section}>
                  <Meta style={{ color: colors.dark.inkMuted }}>EMERGENCY CONTACT</Meta>
                  {primaryContact ? (
                    <View style={styles.contactCard}>
                      <Text style={[type.h3, { color: colors.dark.ink }]}>{primaryContact.name}</Text>
                      <Meta style={{ marginTop: 6, color: colors.dark.amber }}>
                        {(primaryContact.relation || 'CONTACT').toUpperCase()}
                      </Meta>
                      <Text style={[type.bodyLg, { color: colors.dark.ink, marginTop: space.sm }]}>{primaryContact.phone}</Text>
                    </View>
                  ) : (
                    <Text style={[type.body, { color: colors.dark.inkMuted, marginTop: space.sm }]}>No emergency contact on file.</Text>
                  )}
                </View>
              </Card>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <Button dark variant="ghost" label="BACK TO RIDE" onPress={() => router.back()} testID="sos-respond-back-btn" />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0303' },
  header: { paddingHorizontal: space.lg, paddingTop: space.lg, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dotWrap: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  bigDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.dark.sos },
  pulseRing: {
    position: 'absolute', width: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.dark.sos,
  },
  body: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.xl },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dialogWrap: { flex: 1, justifyContent: 'center' },
  dialogCard: { backgroundColor: colors.dark.surface, borderColor: colors.dark.rule },
  dialogTitle: { color: colors.dark.ink, marginTop: space.md },
  dialogDeck: { color: colors.dark.inkMuted, marginTop: space.sm },
  section: { marginTop: space.xl },
  contactCard: {
    marginTop: space.sm,
    borderWidth: 1,
    borderColor: colors.dark.rule,
    borderRadius: 2,
    padding: space.md,
    backgroundColor: colors.dark.bg,
  },
  footer: { padding: space.lg, borderTopWidth: 1, borderColor: colors.dark.rule },
});
