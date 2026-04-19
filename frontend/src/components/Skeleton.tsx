// Skeleton placeholders.
//
// Why: a spinner on a blank screen reads as "broken" or "stuck". A skeleton
// that matches the final layout reads as "loading, nearly there" even when
// the wait is identical. Perceived latency, not actual latency.
//
// Design: Reanimated-free. Uses an Animated.Value opacity loop — works in
// Expo Go, bare RN, and web with no native module hassles.

import React, { useEffect, useRef } from 'react';
import { Animated, View, ViewStyle, StyleSheet } from 'react-native';
import { colors, space, radius } from '../theme/tokens';

export function SkeletonBlock({
  width,
  height = 14,
  style,
  testID,
}: {
  width?: number | `${number}%` | 'auto';
  height?: number;
  style?: ViewStyle;
  testID?: string;
}) {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.75, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      testID={testID}
      style={[
        {
          width: width ?? '100%',
          height,
          backgroundColor: colors.light.rule,
          borderRadius: 2,
          opacity,
        },
        style,
      ]}
    />
  );
}

// ---- Card-sized skeleton that matches the Discover trip card layout ----
export function SkeletonTripCard({ testID }: { testID?: string }) {
  return (
    <View testID={testID} style={styles.card}>
      <SkeletonBlock height={180} style={{ borderRadius: 0 }} />
      <View style={styles.cardBody}>
        <SkeletonBlock width={90} height={10} />
        <SkeletonBlock width={220} height={22} style={{ marginTop: 8 }} />
        <SkeletonBlock width={180} height={10} style={{ marginTop: 12 }} />
        <View style={{ flexDirection: 'row', gap: 32, marginTop: 16 }}>
          <SkeletonBlock width={48} height={22} />
          <SkeletonBlock width={48} height={22} />
          <SkeletonBlock width={48} height={22} />
        </View>
        <SkeletonBlock height={40} style={{ marginTop: 16 }} />
      </View>
    </View>
  );
}

// ---- Row-sized skeleton for Home's upcoming list and Trips list ----
export function SkeletonTripRow({ testID }: { testID?: string }) {
  return (
    <View testID={testID} style={styles.row}>
      <View style={{ flex: 1 }}>
        <SkeletonBlock width={70} height={10} />
        <SkeletonBlock width={200} height={20} style={{ marginTop: 6 }} />
        <SkeletonBlock width={160} height={10} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.lg,
    marginTop: space.lg,
    borderWidth: 1,
    borderColor: colors.light.rule,
    borderRadius: radius.tiny,
    overflow: 'hidden',
    backgroundColor: colors.light.surface,
  },
  cardBody: { padding: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.rule,
  },
});
