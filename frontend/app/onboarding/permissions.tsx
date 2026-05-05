import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { colors, type, space, radius } from '../../src/theme/tokens';
import { Eyebrow, Button, Rule, Meta } from '../../src/components/ui';
import { CompassIllus } from '../../src/components/illustrations';

type Status = 'pending' | 'granted' | 'denied';

export default function Permissions() {
  const router = useRouter();
  const [loc, setLoc] = useState<Status>('pending');
  const [notif, setNotif] = useState<Status>('pending');
  const [crash, setCrash] = useState<Status>('pending');
  const [busy, setBusy] = useState(false);

  const requestLoc = async () => {
    setBusy(true);
    try {
      if (Platform.OS === 'web') {
        if ('geolocation' in navigator) {
          await new Promise<void>((resolve) => {
            navigator.geolocation.getCurrentPosition(() => { setLoc('granted'); resolve(); }, () => { setLoc('denied'); resolve(); });
          });
        } else { setLoc('denied'); }
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        setLoc(status === 'granted' ? 'granted' : 'denied');
        if (status === 'granted') {
          try { await Location.requestBackgroundPermissionsAsync(); } catch {}
        }
      }
    } finally { setBusy(false); }
  };

  const requestNotif = async () => {
    setBusy(true);
    try {
      if (Platform.OS === 'web') {
        if ('Notification' in window) {
          const r = await (window as any).Notification.requestPermission();
          setNotif(r === 'granted' ? 'granted' : 'denied');
        } else { setNotif('denied'); }
      } else {
        const { status } = await Notifications.requestPermissionsAsync();
        setNotif(status === 'granted' ? 'granted' : 'denied');
      }
    } catch { setNotif('denied'); }
    finally { setBusy(false); }
  };

  const requestCrash = async () => {
    // Crash detection uses accelerometer — no OS prompt on native; we enable silently.
    setCrash('granted');
  };

  // Permissions is now the LAST onboarding step (was first). On done we drop
  // the user into the tabs — there's nothing left to set up.
  const done = () => router.replace('/(tabs)');

  const grantedCount = [loc, notif, crash].filter(s => s === 'granted').length;

  const Item = ({ icon, title, desc, status, onAsk, testID }: any) => (
    <View style={[styles.card, status === 'granted' && styles.cardGranted]}>
      {status === 'granted' && <View style={styles.grantedStripe} />}
      <View style={styles.cardHead}>
        <Feather name={icon} size={18} color={status === 'granted' ? colors.light.success : colors.light.ink} />
        <Eyebrow style={{ marginLeft: 10, color: status === 'granted' ? colors.light.success : colors.light.inkMuted }}>
          {status === 'granted' ? '✓ GRANTED' : status === 'denied' ? 'DENIED · CAN ENABLE LATER' : 'REQUIRED'}
        </Eyebrow>
      </View>
      <Text style={[type.h3, { color: colors.light.ink, marginTop: space.sm }]}>{title}</Text>
      <Text style={[type.body, { color: colors.light.inkMuted, marginTop: 4 }]}>{desc}</Text>
      {status === 'pending' ? (
        <TouchableOpacity testID={testID} onPress={onAsk} disabled={busy} style={styles.askBtn}>
          <Meta style={{ color: colors.light.ink }}>ASK NOW →</Meta>
        </TouchableOpacity>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.md }}>
          <Feather name={status === 'granted' ? 'check' : 'x'} size={14} color={status === 'granted' ? colors.light.success : colors.light.danger} />
          <Meta style={{ marginLeft: 6, color: status === 'granted' ? colors.light.success : colors.light.danger }}>
            {status === 'granted' ? 'ALL SET' : 'YOU CAN GRANT THIS LATER IN SETTINGS'}
          </Meta>
        </View>
      )}
    </View>
  );

  const { width } = useWindowDimensions();

  return (
    <SafeAreaView style={styles.container} testID="permissions-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={styles.illusWrap}>
          <CompassIllus width={width} height={180} />
        </View>
        <View style={styles.header}>
          <Eyebrow>FINAL STEP — {grantedCount}/3 READY</Eyebrow>
          <Text style={[type.h1, { color: colors.light.ink, marginTop: space.xs }]}>One last thing.</Text>
          <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.xs }]}>
            Three permissions wire up the features you just set up. Each is optional — toggle any of them off later from Settings.
          </Text>
          <View style={styles.progressTrack} testID="perm-progress-track">
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={[
                  styles.progressCell,
                  i < grantedCount && styles.progressCellOn,
                ]}
              />
            ))}
          </View>
        </View>
        <Rule />

        <View style={styles.list}>
          <Item
            icon="map-pin"
            title="Location — so your crew sees you"
            desc="Show your dot on the convoy map during a ride. Share live position with friends back home."
            status={loc}
            onAsk={requestLoc}
            testID="perm-location-ask"
          />
          <Item
            icon="bell"
            title="Notifications — for SOS and invites"
            desc="If a crewmate hits SOS you'll hear about it in seconds. Also: ride invites, request approvals, trip-start nudges."
            status={notif}
            onAsk={requestNotif}
            testID="perm-notif-ask"
          />
          <Item
            icon="activity"
            title="Crash detection — optional"
            desc="Uses the accelerometer to fire SOS if the bike takes a hard hit. Off by default — turn on now or later from Settings."
            status={crash}
            onAsk={requestCrash}
            testID="perm-crash-ask"
          />
        </View>
      </ScrollView>

      <View style={styles.cta}>
        <Button label="START RIDING →" onPress={done} testID="perm-continue-btn" />
        <TouchableOpacity onPress={done} style={{ alignItems: 'center', marginTop: space.md }} testID="perm-skip-btn">
          <Meta>SKIP — I'LL ENABLE THESE LATER</Meta>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  illusWrap: { width: '100%', borderBottomWidth: 1, borderBottomColor: colors.light.rule },
  header: { padding: space.lg },
  list: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md },
  card: { borderWidth: 1, borderColor: colors.light.rule, borderRadius: radius.tiny, padding: space.lg, backgroundColor: colors.light.surface, marginBottom: space.md, position: 'relative', overflow: 'hidden' },
  cardGranted: { borderColor: colors.light.success, backgroundColor: colors.light.bg },
  grantedStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: colors.light.success },
  cardHead: { flexDirection: 'row', alignItems: 'center' },
  askBtn: { marginTop: space.md, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.light.ink, borderRadius: radius.tiny },
  progressTrack: { flexDirection: 'row', gap: 6, marginTop: space.md },
  progressCell: { flex: 1, height: 3, backgroundColor: colors.light.rule },
  progressCellOn: { backgroundColor: colors.light.amber },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, backgroundColor: colors.light.bg, borderTopWidth: 1, borderTopColor: colors.light.rule },
});
