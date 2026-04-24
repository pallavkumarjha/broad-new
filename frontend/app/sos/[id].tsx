import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, describeError } from '../../src/lib/api';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, type, space, fonts } from '../../src/theme/tokens';
import { Eyebrow, Meta, SpecRow, ErrorStrip, Button } from '../../src/components/ui';
import { SafeButton } from '../../src/components/SOSButton';

const fmtCoord = (value: number, pos: string, neg: string) => `${Math.abs(value).toFixed(3)}°${value >= 0 ? pos : neg}`;

export default function SOS() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [event, setEvent] = useState<any>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveErr, setResolveErr] = useState('');
  const [loadErr, setLoadErr] = useState('');
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

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.4] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0.55, 0.05, 0] });

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoadErr('');
        // Fetch by ID so crew members arriving via notification tap see correct data.
        // GET /sos/{id} is accessible to the sender AND any crew member on the trip.
        const { data } = await api.get(`/sos/${id}`);
        setEvent(data);
      } catch (e: any) {
        setLoadErr(describeError(e, 'Could not load SOS details.'));
      }
    })();
  }, [id]);

  const resolve = async () => {
    if (!id || resolving) return;
    setResolveErr('');
    setResolving(true);
    try {
      await api.post(`/sos/${id}/resolve`, undefined, { timeout: 8000 });
      router.replace(`/sos/safe/${id}`);
    } catch (e: any) {
      setResolveErr(describeError(e, 'Could not mark you safe. Check your connection and try again.'));
      setResolving(false);
    }
  };

  const locationText = event?.lat != null ? `${fmtCoord(event.lat, 'N', 'S')} ${fmtCoord(event.lng, 'E', 'W')}` : '— —';
  const showLoading = !event && !loadErr;
  const showLoadError = !event && !!loadErr;
  // Crew members see who triggered SOS; only the sender gets the resolve button.
  const isSender = !!user && event?.user_id === user.id;
  const senderName: string = event?.sender_name || 'A rider';

  return (
    <View style={styles.container} testID="sos-active-screen">
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <View style={styles.dotWrap}>
            <Animated.View
              style={[styles.pulseRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
            />
            <Animated.View style={[styles.bigDot, { opacity: blink }]} />
          </View>
          <Eyebrow color={colors.dark.sos}>SOS — BROADCASTING</Eyebrow>
        </View>

        <View style={styles.body}>
          {showLoading ? (
            <View style={styles.loadingBlock}>
              <Text style={[type.bodyLg, { color: colors.dark.inkMuted }]}>Loading SOS details…</Text>
            </View>
          ) : showLoadError ? (
            <View style={styles.loadingBlock}>
              <ErrorStrip
                testID="sos-load-error"
                title="COULD NOT LOAD SOS"
                message={loadErr}
                style={{ width: '100%' }}
              />
              <Button
                dark
                variant="ghost"
                label="BACK TO RIDE"
                onPress={() => router.back()}
                style={{ marginTop: space.lg, alignSelf: 'stretch' }}
                testID="sos-load-back-btn"
              />
            </View>
          ) : (
            <>
              {isSender ? (
                <>
                  <Text style={[type.display, { color: colors.dark.ink }]}>Help is on the way.</Text>
                  <Text style={[type.bodyLg, { color: colors.dark.inkMuted, marginTop: space.sm }]}>
                    Your location, heading and speed are being broadcast to your convoy.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[type.display, { color: colors.dark.ink }]}>SOS — {senderName}.</Text>
                  <Text style={[type.bodyLg, { color: colors.dark.inkMuted, marginTop: space.sm }]}>
                    {senderName} triggered an SOS. Their location is being broadcast. Check on them.
                  </Text>
                </>
              )}

              <View style={styles.statBlock}>
                <SpecRow dark label="STATUS" value="ACTIVE" />
                <SpecRow dark label="LOCATION" value={locationText} />
                <SpecRow dark label="SPEED" value={event ? `${Math.round(event.speed_kmh)} KM/H` : '0 KM/H'} />
                {!isSender && <SpecRow dark label="RIDER" value={senderName.toUpperCase()} />}
                <SpecRow dark label="SENT TO" value="CONVOY" last />
              </View>

              <View style={styles.list}>
                <Meta style={{ color: colors.dark.inkMuted }}>BROADCAST LOG</Meta>
                <Text style={[type.body, { color: colors.dark.ink, fontFamily: fonts.mono, marginTop: space.sm }]}>
                  {`> CONVOY ALERT  ✓`}
                </Text>
              </View>
            </>
          )}

          {resolveErr ? (
            <ErrorStrip
              testID="sos-resolve-error"
              title="COULD NOT MARK SAFE"
              message={resolveErr}
              style={{ marginTop: space.lg }}
            />
          ) : null}
        </View>

        <View style={styles.footer}>
          {isSender ? (
            <SafeButton onConfirm={resolve} busy={resolving} />
          ) : (
            <Button
              dark
              variant="ghost"
              label="BACK TO RIDE"
              onPress={() => router.back()}
              testID="sos-crew-back-btn"
            />
          )}
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
  loadingBlock: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statBlock: { marginTop: space.xl, borderTopWidth: 1, borderColor: colors.dark.rule },
  list: { marginTop: space.xl },
  footer: { padding: space.lg, borderTopWidth: 1, borderColor: colors.dark.rule },
});
