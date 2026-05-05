import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { storage } from '../src/lib/api';
import { colors, type, space, radius } from '../src/theme/tokens';
import { Eyebrow, Button, Meta } from '../src/components/ui';
import {
  SunriseRideIllus,
  RoadIllus,
  GhatsIllus,
  SummitIllus,
} from '../src/components/illustrations';

/** Local-storage flag set after the user has seen (or skipped) the welcome
 * carousel. Read by app/index.tsx splash to decide whether to route to
 * /welcome or /(auth)/login on cold open without an auth token. */
export const WELCOME_SEEN_KEY = 'broad_welcome_seen_v1';

type SlideKind = 'hero' | 'plan' | 'convoy' | 'safety';

type Slide = {
  kind: SlideKind;
  eyebrow: string;
  title: string;
  body: string;
};

// Slide copy is editorial, in line with the rest of the app's voice.
// Four slides tested as the sweet spot — three felt rushed, five overstayed.
const SLIDES: Slide[] = [
  {
    kind: 'hero',
    eyebrow: 'EST. 2026 — INDIA',
    title: 'The rider\'s companion.',
    body: 'Plan rides. Roll out together. Get home safe.',
  },
  {
    kind: 'plan',
    eyebrow: 'PLOT THE ROUTE',
    title: 'Plan it once.\nPick your crew.',
    body: 'Curate India\'s roads. Invite friends, or open the ride to Discover and let strangers join.',
  },
  {
    kind: 'convoy',
    eyebrow: 'LIVE CONVOY',
    title: 'See the crew,\nin real time.',
    body: 'Live location of every rider on the map. No more "where are you?" calls at every fuel stop.',
  },
  {
    kind: 'safety',
    eyebrow: 'SAFETY NET',
    title: 'If the road bites back,\nwe\'re here.',
    body: 'One long press triggers SOS to your crew + emergency contact. Crash detection, watching when you want it.',
  },
];

function Illustration({ kind, width, height }: { kind: SlideKind; width: number; height: number }) {
  // Each slide pulls a distinct illustration from the existing library so the
  // welcome flow ties into the rest of the app's visual system instead of
  // introducing a new aesthetic just for onboarding.
  switch (kind) {
    case 'hero':    return <SunriseRideIllus width={width} height={height} />;
    case 'plan':    return <RoadIllus       width={width} height={height} />;
    case 'convoy':  return <GhatsIllus      width={width} height={height} />;
    case 'safety':  return <SummitIllus     width={width} height={height} />;
  }
}

export default function Welcome() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / width);
    if (i !== index) setIndex(i);
  };

  const goNext = () => {
    if (index < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: width * (index + 1), animated: true });
    } else {
      finish('register');
    }
  };

  const finish = async (dest: 'register' | 'login') => {
    // Persist the flag BEFORE navigating so a fast back-tap on the auth screen
    // doesn't bounce the user back into the carousel. AsyncStorage write is
    // fire-and-forget — failure here is harmless (we'd just show the carousel
    // one more time on next cold open).
    try { await storage.setItem(WELCOME_SEEN_KEY, '1'); } catch {}
    if (dest === 'register') router.replace('/(auth)/register');
    else router.replace('/(auth)/login');
  };

  const isLast = index === SLIDES.length - 1;
  const illusH = 220;

  return (
    <SafeAreaView style={styles.container} testID="welcome-screen">
      {/* Top bar — Skip pinned right, brand pinned centre */}
      <View style={styles.topBar}>
        <View style={{ width: 60 }} />
        <Text style={[type.eyebrow, { color: colors.light.inkMuted, letterSpacing: 4 }]}>BROAD</Text>
        <TouchableOpacity onPress={() => finish('register')} testID="welcome-skip-btn">
          <Meta>SKIP</Meta>
        </TouchableOpacity>
      </View>

      {/* Paged scroll — one slide per screen width */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={[styles.slide, { width }]} testID={`welcome-slide-${i}`}>
            <View style={[styles.illusWrap, { width, height: illusH }]}>
              <Illustration kind={s.kind} width={width} height={illusH} />
            </View>
            <View style={styles.copyWrap}>
              <Eyebrow>{s.eyebrow}</Eyebrow>
              <Text style={[type.display, styles.title]}>{s.title}</Text>
              <Text style={[type.bodyLg, styles.body]}>{s.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Pagination dots — amber for current, rule colour for the rest */}
      <View style={styles.dots} testID="welcome-dots">
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === index && styles.dotActive]}
            testID={`welcome-dot-${i}${i === index ? '-active' : ''}`}
          />
        ))}
      </View>

      {/* CTAs — Next on slides 1-3, Get Started + Sign In on the last slide */}
      <View style={styles.cta}>
        {!isLast ? (
          <Button label="NEXT" onPress={goNext} testID="welcome-next-btn" />
        ) : (
          <>
            <Button label="GET STARTED" onPress={() => finish('register')} testID="welcome-get-started-btn" />
            <TouchableOpacity
              onPress={() => finish('login')}
              style={styles.signInRow}
              testID="welcome-sign-in-btn"
            >
              <Meta>I HAVE AN ACCOUNT — </Meta>
              <Meta style={{ color: colors.light.amber }}>SIGN IN</Meta>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.md,
  },
  slide: { flex: 1 },
  illusWrap: {
    borderBottomWidth: 1, borderBottomColor: colors.light.rule,
    overflow: 'hidden',
  },
  copyWrap: {
    paddingHorizontal: space.lg, paddingTop: space.xl,
  },
  title: {
    color: colors.light.ink, marginTop: space.md, fontSize: 36, lineHeight: 42,
  },
  body: {
    color: colors.light.inkMuted, marginTop: space.md, lineHeight: 26,
  },
  dots: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 8, paddingVertical: space.md,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: colors.light.rule,
  },
  dotActive: {
    width: 24, backgroundColor: colors.light.amber,
  },
  cta: {
    paddingHorizontal: space.lg, paddingBottom: space.lg, paddingTop: space.sm,
    borderTopWidth: 1, borderTopColor: colors.light.rule,
    backgroundColor: colors.light.bg,
  },
  signInRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingTop: space.md,
  },
});
