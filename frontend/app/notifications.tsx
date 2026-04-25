import React, { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../src/lib/api';
import { colors, type, space, radius } from '../src/theme/tokens';
import { Eyebrow, Meta, Rule } from '../src/components/ui';

type NotificationItem = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  data: Record<string, any>;
  read: boolean;
  created_at: string;
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(1, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}S AGO`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}M AGO`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}H AGO`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}D AGO`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }).toUpperCase();
}

function iconFor(type: string | undefined): { name: keyof typeof Feather.glyphMap; tint: string } {
  switch (type) {
    case 'sos': return { name: 'alert-octagon', tint: colors.dark.sos };
    case 'trip_started': return { name: 'play-circle', tint: colors.light.amber };
    case 'trip_request': return { name: 'user-plus', tint: colors.light.amber };
    case 'trip_request_approved': return { name: 'check-circle', tint: '#2D6A4F' };
    case 'trip_request_declined': return { name: 'x-circle', tint: colors.light.inkMuted };
    case 'trip_left': return { name: 'log-out', tint: colors.light.inkMuted };
    case 'trip_removed': return { name: 'user-x', tint: colors.light.inkMuted };
    default: return { name: 'bell', tint: colors.light.ink };
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const list = useQuery<NotificationItem[]>({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get('/notifications')).data,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });

  const readAll = useMutation({
    mutationFn: async () => api.post('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const onPressItem = useCallback((n: NotificationItem) => {
    if (!n.read) markRead.mutate(n.id);
    const t = n.data?.type;
    const tripId = n.data?.trip_id;
    const sosId = n.data?.sos_id;
    if (t === 'sos' && sosId) {
      router.push(`/sos/${sosId}` as any);
    } else if (tripId) {
      router.push(`/trip/${tripId}` as any);
    }
  }, [markRead, router]);

  const onLongPressItem = useCallback((n: NotificationItem) => {
    Alert.alert('Delete notification?', n.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(n.id) },
    ]);
  }, [remove]);

  const items = list.data ?? [];
  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="notifications-screen">
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} testID="notifications-back">
          <Feather name="chevron-left" size={22} color={colors.light.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Eyebrow>INBOX</Eyebrow>
          <Text style={[type.h2, { color: colors.light.ink, marginTop: 2 }]}>Notifications</Text>
        </View>
        <TouchableOpacity
          onPress={() => readAll.mutate()}
          style={styles.iconBtn}
          disabled={unreadCount === 0 || readAll.isPending}
          testID="notifications-read-all"
        >
          <Feather
            name="check-square"
            size={20}
            color={unreadCount === 0 ? colors.light.rule : colors.light.ink}
          />
        </TouchableOpacity>
      </View>
      <Rule />

      <ScrollView
        contentContainerStyle={{ paddingBottom: space.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefetching && !list.isLoading}
            onRefresh={() => list.refetch()}
            tintColor={colors.light.ink}
          />
        }
      >
        {list.isLoading ? (
          <View style={styles.empty}>
            <Meta>LOADING…</Meta>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.empty} testID="notifications-empty">
            <Feather name="bell-off" size={32} color={colors.light.inkMuted} />
            <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.md, textAlign: 'center' }]}>
              No notifications yet.{'\n'}You'll hear from us when something happens.
            </Text>
          </View>
        ) : (
          items.map((n) => {
            const { name, tint } = iconFor(n.data?.type);
            return (
              <TouchableOpacity
                key={n.id}
                testID={`notification-${n.id}`}
                activeOpacity={0.75}
                onPress={() => onPressItem(n)}
                onLongPress={() => onLongPressItem(n)}
                style={[styles.row, !n.read && styles.rowUnread]}
              >
                <View style={[styles.iconWrap, { borderColor: tint }]}>
                  <Feather name={name} size={16} color={tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowHead}>
                    <Text
                      style={[type.h3, { color: colors.light.ink, flex: 1 }]}
                      numberOfLines={1}
                    >
                      {n.title}
                    </Text>
                    {!n.read && <View style={styles.dot} testID={`notification-dot-${n.id}`} />}
                  </View>
                  <Text
                    style={[type.body, { color: colors.light.inkMuted, marginTop: 2 }]}
                    numberOfLines={2}
                  >
                    {n.body}
                  </Text>
                  <Meta style={{ marginTop: 6 }}>{timeAgo(n.created_at)}</Meta>
                </View>
                <Feather name="chevron-right" size={18} color={colors.light.inkMuted} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { paddingTop: space.xxl, alignItems: 'center', paddingHorizontal: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.rule,
    gap: space.md,
  },
  rowUnread: { backgroundColor: '#FDF6EC' },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.tiny,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.light.surface,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.light.amber,
  },
});
