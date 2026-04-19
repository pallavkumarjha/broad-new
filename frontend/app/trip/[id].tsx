import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/lib/api';
import { colors, type, space, radius } from '../../src/theme/tokens';
import { Eyebrow, Rule, SpecRow, Button, Meta, Card } from '../../src/components/ui';
import { MapView } from '../../src/components/MapView';

type Role = 'organiser' | 'crew' | 'requester' | 'stranger' | 'declined';

export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [trip, setTrip] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]); // organiser inbox
  const [myRequest, setMyRequest] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState<string | null>(null); // request-id being acted on

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/trips/${id}`);
      setTrip(data);
      const isOrganiser = user && data.user_id === user.id;
      // Organiser sees the inbox
      if (isOrganiser) {
        try {
          const { data: reqs } = await api.get(`/trips/${id}/requests`);
          setRequests(reqs);
        } catch { setRequests([]); }
      }
      // Anyone else: check if they have a request on this trip
      if (user && !isOrganiser) {
        try {
          const { data: mine } = await api.get('/users/me/trip-requests');
          const found = (mine || []).find((r: any) => r.trip_id === id);
          setMyRequest(found || null);
        } catch { setMyRequest(null); }
      }
    } catch {}
  }, [id, user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!trip) {
    return <SafeAreaView style={styles.container}><View style={styles.loading}><ActivityIndicator color={colors.light.ink} /></View></SafeAreaView>;
  }

  const allPoints = [trip.start, ...(trip.waypoints || []), trip.end];
  const isOrganiser = !!user && trip.user_id === user.id;
  const isCrew = !!user && (trip.crew_ids || []).includes(user.id);
  const pendingMine = myRequest && myRequest.status === 'pending';
  const declinedMine = myRequest && myRequest.status === 'declined';
  const role: Role =
    isOrganiser ? 'organiser' :
    isCrew ? 'crew' :
    pendingMine ? 'requester' :
    declinedMine ? 'declined' :
    'stranger';

  const max = trip.max_riders || 8;
  const taken = 1 + (trip.crew_ids?.length || 0);
  const seatsLeft = Math.max(0, max - taken);
  const isFull = seatsLeft <= 0;
  const pendingRequests = requests.filter(r => r.status === 'pending');

  // ---- Actions ----
  const startTrip = async () => {
    setBusy(true);
    try {
      await api.patch(`/trips/${id}`, { status: 'active' });
      router.replace(`/ride/${id}`);
    } catch (e: any) { Alert.alert('Could not start', e?.message || ''); }
    finally { setBusy(false); }
  };

  const deleteTrip = async () => {
    Alert.alert('Delete trip?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.delete(`/trips/${id}`); router.back(); } catch {}
      }},
    ]);
  };

  const requestJoin = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/trips/${id}/request-join`, { note: '' });
      setMyRequest(data);
    } catch (e: any) {
      Alert.alert('Could not send request', e?.response?.data?.detail || e?.message || '');
    } finally { setBusy(false); }
  };

  const withdrawRequest = async () => {
    if (!myRequest) return;
    Alert.alert('Withdraw request?', 'You can request again later if seats are open.', [
      { text: 'Keep request', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: async () => {
        setBusy(true);
        try {
          const { data } = await api.post(`/trips/${id}/requests/${myRequest.id}/cancel`);
          setMyRequest(data);
        } catch (e: any) {
          Alert.alert('Could not withdraw', e?.response?.data?.detail || e?.message || '');
        } finally { setBusy(false); }
      }},
    ]);
  };

  const leaveTrip = async () => {
    Alert.alert('Leave this ride?', 'The organiser will be notified.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
        setBusy(true);
        try {
          await api.post(`/trips/${id}/leave`);
          router.back();
        } catch (e: any) {
          Alert.alert('Could not leave', e?.response?.data?.detail || e?.message || '');
        } finally { setBusy(false); }
      }},
    ]);
  };

  const approve = async (rid: string) => {
    setActing(rid);
    try {
      await api.post(`/trips/${id}/requests/${rid}/approve`);
      await load();
    } catch (e: any) {
      Alert.alert('Could not approve', e?.response?.data?.detail || e?.message || '');
    } finally { setActing(null); }
  };

  const decline = async (rid: string) => {
    setActing(rid);
    try {
      await api.post(`/trips/${id}/requests/${rid}/decline`);
      await load();
    } catch (e: any) {
      Alert.alert('Could not decline', e?.response?.data?.detail || e?.message || '');
    } finally { setActing(null); }
  };

  const removeRider = (uid: string, name: string) => {
    Alert.alert(`Remove ${name || 'this rider'}?`, 'They will be notified.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await api.post(`/trips/${id}/riders/${uid}/remove`); await load(); }
        catch (e: any) { Alert.alert('Could not remove', e?.response?.data?.detail || e?.message || ''); }
      }},
    ]);
  };

  // ---- CTA renderer ----
  const renderCta = () => {
    if (role === 'organiser') {
      if (trip.status === 'planned') return <Button label="START TRIP" onPress={startTrip} loading={busy} testID="trip-start-btn" />;
      if (trip.status === 'active') return <Button label="OPEN INSTRUMENT PANEL" onPress={() => router.push(`/ride/${id}`)} testID="trip-open-ride-btn" />;
      if (trip.status === 'completed') return <Button label="VIEW SUMMARY" variant="ghost" onPress={() => router.push(`/complete/${id}`)} testID="trip-view-summary-btn" />;
      return null;
    }
    if (role === 'crew') {
      return (
        <View>
          {trip.status === 'active' && (
            <Button label="OPEN INSTRUMENT PANEL" onPress={() => router.push(`/ride/${id}`)} testID="trip-open-ride-btn" />
          )}
          <TouchableOpacity testID="trip-leave-btn" style={[styles.dangerBtn, trip.status === 'active' && { marginTop: space.md }]} onPress={leaveTrip} disabled={busy}>
            <Feather name="log-out" size={14} color={colors.light.danger} />
            <Meta style={{ marginLeft: 8, color: colors.light.danger }}>{busy ? 'LEAVING…' : 'LEAVE THIS RIDE'}</Meta>
          </TouchableOpacity>
        </View>
      );
    }
    if (role === 'requester') {
      return (
        <View>
          <View style={styles.pendingBanner} testID="trip-pending-banner">
            <Feather name="clock" size={14} color={colors.light.amber} />
            <Meta style={{ marginLeft: 8, color: colors.light.ink }}>REQUEST PENDING — {trip.user_name?.toUpperCase() || 'THE ORGANISER'} WILL DECIDE</Meta>
          </View>
          <TouchableOpacity testID="trip-withdraw-btn" style={[styles.dangerBtn, { marginTop: space.md }]} onPress={withdrawRequest} disabled={busy}>
            <Feather name="x" size={14} color={colors.light.danger} />
            <Meta style={{ marginLeft: 8, color: colors.light.danger }}>{busy ? 'WITHDRAWING…' : 'WITHDRAW REQUEST'}</Meta>
          </TouchableOpacity>
        </View>
      );
    }
    if (role === 'declined') {
      return (
        <View style={styles.pendingBanner} testID="trip-declined-banner">
          <Feather name="x-circle" size={14} color={colors.light.danger} />
          <Meta style={{ marginLeft: 8, color: colors.light.ink }}>YOUR REQUEST WAS DECLINED</Meta>
        </View>
      );
    }
    // stranger
    if (!trip.is_public) {
      return (
        <View style={styles.pendingBanner}>
          <Feather name="lock" size={14} color={colors.light.inkMuted} />
          <Meta style={{ marginLeft: 8 }}>PRIVATE RIDE — INVITE ONLY</Meta>
        </View>
      );
    }
    if (trip.status !== 'planned' && trip.status !== 'active') {
      return (
        <View style={styles.pendingBanner}>
          <Meta>THIS RIDE IS NO LONGER ACCEPTING RIDERS</Meta>
        </View>
      );
    }
    if (isFull) {
      return (
        <View style={styles.pendingBanner}>
          <Feather name="users" size={14} color={colors.light.danger} />
          <Meta style={{ marginLeft: 8, color: colors.light.danger }}>FULL — NO SEATS LEFT</Meta>
        </View>
      );
    }
    return <Button label={busy ? 'SENDING…' : 'REQUEST TO JOIN'} onPress={requestJoin} loading={busy} testID="trip-request-join-btn" />;
  };

  // Header trash icon only visible to organiser
  const headerRight = isOrganiser
    ? <TouchableOpacity onPress={deleteTrip} testID="trip-delete-btn"><Feather name="trash-2" size={20} color={colors.light.inkMuted} /></TouchableOpacity>
    : <View style={{ width: 20 }} />;

  return (
    <SafeAreaView style={styles.container} testID="trip-detail-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="trip-back-btn"><Feather name="arrow-left" size={22} color={colors.light.ink} /></TouchableOpacity>
        <Eyebrow>{role === 'stranger' || role === 'requester' || role === 'declined' ? 'OPEN RIDE' : 'PRE-RIDE BRIEFING'}</Eyebrow>
        {headerRight}
      </View>
      <Rule />
      <ScrollView contentContainerStyle={{ paddingBottom: 180 }}>
        <View style={styles.titleBlock}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Eyebrow>{(trip.planned_date || '').toUpperCase()}</Eyebrow>
            {trip.is_public && (
              <>
                <Text style={[type.meta, { color: colors.light.inkMuted }]}>·</Text>
                <Eyebrow color={colors.light.amber}>PUBLIC</Eyebrow>
              </>
            )}
          </View>
          <Text style={[type.display, { color: colors.light.ink, marginTop: space.xs }]}>{trip.name}</Text>
          <Meta style={{ marginTop: space.sm }}>
            {(trip.start?.name || '').toUpperCase()} → {(trip.end?.name || '').toUpperCase()}
          </Meta>
        </View>
        <View style={{ alignItems: 'center', backgroundColor: colors.light.surface, paddingVertical: space.md }}>
          <MapView points={allPoints} width={360} height={200} />
        </View>

        {trip.is_public && trip.description ? (
          <View style={styles.section}>
            <Eyebrow>ABOUT THIS RIDE</Eyebrow>
            <Text style={[type.body, { color: colors.light.ink, marginTop: space.sm, lineHeight: 22 }]}>{trip.description}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Eyebrow>ROUTE STATS</Eyebrow>
          <Card style={{ marginTop: space.sm }}>
            <SpecRow label="DISTANCE" value={`${trip.distance_km} KM`} />
            <SpecRow label="ELEVATION" value={`${trip.elevation_m} M`} />
            <SpecRow label="STOPS" value={`${(trip.waypoints?.length || 0) + 2}`} />
            {trip.is_public ? <SpecRow label="SEATS" value={isFull ? 'FULL' : `${seatsLeft} OF ${max} OPEN`} /> : null}
            <SpecRow label="STATUS" value={(trip.status || '').toUpperCase()} last />
          </Card>
        </View>

        {/* Organiser-only: pending requests inbox */}
        {role === 'organiser' && trip.is_public && (
          <View style={styles.section} testID="organiser-requests-section">
            <Eyebrow>JOIN REQUESTS — {pendingRequests.length} PENDING</Eyebrow>
            {pendingRequests.length === 0 ? (
              <Card style={{ marginTop: space.sm }}>
                <Text style={[type.body, { color: colors.light.inkMuted }]}>
                  No pending requests. Riders who tap REQUEST TO JOIN in Discover will land here.
                </Text>
              </Card>
            ) : (
              <View style={{ marginTop: space.sm, gap: space.sm }}>
                {pendingRequests.map((r) => (
                  <View key={r.id} style={styles.reqCard} testID={`req-card-${r.id}`}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={styles.avatar}><Text style={[type.meta, { color: colors.light.ink }]}>{(r.requester_name || '?').charAt(0).toUpperCase()}</Text></View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[type.body, { color: colors.light.ink, fontFamily: 'Fraunces_500Medium' }]}>{r.requester_name}</Text>
                        <Meta style={{ marginTop: 2 }}>{(r.requester_email || '').toUpperCase()}</Meta>
                      </View>
                    </View>
                    {r.note ? (
                      <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.sm, fontStyle: 'italic' }]}>"{r.note}"</Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: space.md }}>
                      <TouchableOpacity
                        testID={`req-approve-${r.id}`}
                        style={[styles.reqBtn, styles.reqBtnApprove, (acting === r.id || isFull) && { opacity: 0.5 }]}
                        onPress={() => approve(r.id)}
                        disabled={acting === r.id || isFull}
                      >
                        <Feather name="check" size={14} color="#FFFFFF" />
                        <Meta style={{ color: '#FFFFFF', marginLeft: 6 }}>{acting === r.id ? '…' : isFull ? 'FULL' : 'APPROVE'}</Meta>
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`req-decline-${r.id}`}
                        style={[styles.reqBtn, styles.reqBtnDecline, acting === r.id && { opacity: 0.5 }]}
                        onPress={() => decline(r.id)}
                        disabled={acting === r.id}
                      >
                        <Feather name="x" size={14} color={colors.light.danger} />
                        <Meta style={{ color: colors.light.danger, marginLeft: 6 }}>DECLINE</Meta>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Eyebrow>WAYPOINTS — {(trip.waypoints?.length || 0) + 2}</Eyebrow>
          <View style={{ marginTop: space.sm }}>
            {allPoints.map((p: any, i: number) => (
              <View key={i} style={styles.wpRow}>
                <View style={[styles.dot, i === 0 || i === allPoints.length - 1 ? { backgroundColor: colors.light.ink } : null]} />
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: colors.light.ink, fontFamily: 'Fraunces_500Medium' }]}>{p.name}</Text>
                  <Meta style={{ marginTop: 2 }}>{p.lat.toFixed(3)}°N {p.lng.toFixed(3)}°E</Meta>
                </View>
              </View>
            ))}
          </View>
        </View>

        {trip.crew?.length > 0 && (
          <View style={styles.section}>
            <Eyebrow>CREW — {trip.crew.length}</Eyebrow>
            {/* M4 — stacked overlapping avatars at a glance */}
            <View style={styles.avatarStack} testID="trip-avatar-stack">
              {trip.crew.slice(0, 5).map((c: string, i: number) => (
                <View
                  key={i}
                  style={[
                    styles.stackAvatar,
                    { marginLeft: i === 0 ? 0 : -12, zIndex: 10 - i },
                  ]}
                >
                  <Text style={[type.meta, { color: colors.light.ink }]}>{c.charAt(0).toUpperCase()}</Text>
                </View>
              ))}
              {trip.crew.length > 5 && (
                <View style={[styles.stackAvatar, styles.stackAvatarMore, { marginLeft: -12 }]}>
                  <Text style={[type.meta, { color: colors.light.ink }]}>+{trip.crew.length - 5}</Text>
                </View>
              )}
            </View>
            <View style={{ marginTop: space.sm }}>
              {trip.crew.map((c: string, i: number) => {
                // crew_ids is a parallel array; use it to enable kick action for organiser
                const cid = trip.crew_ids?.[i];
                return (
                  <View key={i} style={styles.crewRow}>
                    <View style={styles.avatar}><Text style={[type.meta, { color: colors.light.ink }]}>{c.charAt(0).toUpperCase()}</Text></View>
                    <Text style={[type.body, { color: colors.light.ink, flex: 1 }]}>{c}</Text>
                    {role === 'organiser' && cid && cid !== user?.id ? (
                      <TouchableOpacity testID={`crew-remove-${i}`} onPress={() => removeRider(cid, c)} hitSlop={10}>
                        <Feather name="x" size={16} color={colors.light.inkMuted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {trip.notes && (role === 'organiser' || role === 'crew') ? (
          <View style={styles.section}>
            <Eyebrow>NOTES</Eyebrow>
            <Text style={[type.body, { color: colors.light.ink, marginTop: space.sm }]}>{trip.notes}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.cta}>
        {renderCta()}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: space.lg, paddingVertical: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleBlock: { paddingHorizontal: space.lg, paddingVertical: space.lg },
  section: { paddingHorizontal: space.lg, paddingTop: space.xl },
  wpRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.light.rule },
  dot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: colors.light.ink, backgroundColor: colors.light.bg },
  crewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.light.rule },
  avatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.light.ink, alignItems: 'center', justifyContent: 'center' },
  avatarStack: { flexDirection: 'row', alignItems: 'center', marginTop: space.sm },
  stackAvatar: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, borderColor: colors.light.ink,
    backgroundColor: colors.light.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  stackAvatarMore: { backgroundColor: colors.light.surface },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, backgroundColor: colors.light.bg, borderTopWidth: 1, borderTopColor: colors.light.rule },
  // Request inbox
  reqCard: {
    borderWidth: 1, borderColor: colors.light.rule, borderRadius: radius.tiny,
    padding: space.md, backgroundColor: colors.light.surface,
  },
  reqBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: radius.tiny,
  },
  reqBtnApprove: { backgroundColor: colors.light.ink },
  reqBtnDecline: { borderWidth: 1, borderColor: colors.light.danger, backgroundColor: colors.light.bg },
  // Pending / leave
  pendingBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, paddingHorizontal: space.md,
    borderWidth: 1, borderColor: colors.light.rule, borderRadius: radius.tiny,
    backgroundColor: colors.light.surface,
  },
  dangerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12,
    borderWidth: 1, borderColor: colors.light.danger,
    borderRadius: radius.tiny, backgroundColor: colors.light.bg,
  },
});
