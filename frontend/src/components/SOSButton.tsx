import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder } from 'react-native';
import { colors, type, space, radius } from '../theme/tokens';

// Long-press SOS — must be held for 1.2s to trigger.
export function SOSButton({ onTrigger, label = 'HOLD TO SEND SOS', testID = 'sos-trigger-button' }: {
  onTrigger: () => void;
  label?: string;
  testID?: string;
}) {
  const HOLD_MS = 1200;
  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);
  const fired = useRef(false);
  const [active, setActive] = useState(false);

  const start = () => {
    fired.current = false;
    setActive(true);
    Animated.timing(progress, { toValue: 1, duration: HOLD_MS, useNativeDriver: false }).start();
    timer.current = setTimeout(() => {
      fired.current = true;
      onTrigger();
    }, HOLD_MS);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    setActive(false);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => start(),
      onPanResponderRelease: () => cancel(),
      onPanResponderTerminate: () => cancel(),
    })
  ).current;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const fillW = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View testID={testID} style={styles.wrap} {...responder.panHandlers}>
      <Animated.View style={[styles.fill, { width: fillW, backgroundColor: colors.dark.sos }]} />
      <View style={styles.content}>
        <Text style={[type.eyebrow, { color: '#FFFFFF', letterSpacing: 2, fontSize: 12 }]}>
          {active ? 'KEEP HOLDING…' : label}
        </Text>
      </View>
    </View>
  );
}

// "I am safe" cancel — long press to resolve SOS
export function SafeButton({ onConfirm, testID = 'sos-safe-button' }: { onConfirm: () => void; testID?: string }) {
  const HOLD_MS = 2000;
  const progress = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);
  const [active, setActive] = useState(false);

  const start = () => {
    setActive(true);
    Animated.timing(progress, { toValue: 1, duration: HOLD_MS, useNativeDriver: false }).start();
    timer.current = setTimeout(() => { onConfirm(); }, HOLD_MS);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    setActive(false);
  };
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => start(),
    onPanResponderRelease: () => cancel(),
    onPanResponderTerminate: () => cancel(),
  })).current;
  const fillW = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View testID={testID} style={[styles.wrap, { backgroundColor: 'transparent', borderColor: colors.dark.safe, borderWidth: 1 }]} {...responder.panHandlers}>
      <Animated.View style={[styles.fill, { width: fillW, backgroundColor: colors.dark.safe }]} />
      <View style={styles.content}>
        <Text style={[type.eyebrow, { color: '#FFFFFF', letterSpacing: 2, fontSize: 12 }]}>
          {active ? 'KEEP HOLDING…' : 'HOLD — I AM SAFE'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 72,
    borderRadius: radius.sm,
    backgroundColor: '#1a0707',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
  },
  content: {
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
});
