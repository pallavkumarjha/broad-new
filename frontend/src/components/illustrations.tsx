import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Rect, Circle, Line, G, Defs, Pattern, LinearGradient, Stop } from 'react-native-svg';
import { colors } from '../theme/tokens';

type Props = { width?: number; height?: number };

const W = 800, H = 400; // viewBox

// Common paper pattern + sun/moon motif
function PaperBg({ dark = false }: { dark?: boolean }) {
  const c = dark ? '#141414' : '#EFECE5';
  const l = dark ? '#1f1f1f' : '#E0DCD2';
  return (
    <G>
      <Rect x={0} y={0} width={W} height={H} fill={c} />
      <Defs>
        <Pattern id="hatch" width={8} height={8} patternUnits="userSpaceOnUse">
          <Line x1={0} y1={8} x2={8} y2={0} stroke={l} strokeWidth={0.5} />
        </Pattern>
      </Defs>
    </G>
  );
}

export function MountainIllus({ width = 360, height = 180 }: Props) {
  const ink = colors.light.ink;
  const amber = colors.light.amber;
  const muted = '#B8B3A6';
  return (
    <View style={[styles.wrap, { width, height }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <PaperBg />
        {/* Sun */}
        <Circle cx={640} cy={120} r={44} fill="none" stroke={amber} strokeWidth={2} />
        <Circle cx={640} cy={120} r={28} fill={amber} opacity={0.15} />
        {/* Far peaks */}
        <Path d="M 0 260 L 120 160 L 200 220 L 310 120 L 420 210 L 530 150 L 640 230 L 760 140 L 800 200 L 800 400 L 0 400 Z" fill="none" stroke={muted} strokeWidth={1.2} />
        {/* Mid peaks */}
        <Path d="M 0 310 L 90 220 L 170 280 L 260 200 L 360 290 L 470 210 L 580 300 L 680 230 L 800 320 L 800 400 L 0 400 Z" fill="#E0DCD2" stroke={ink} strokeWidth={1.2} />
        {/* Snow caps */}
        <Path d="M 260 200 L 285 235 L 245 235 Z" fill={ink} />
        <Path d="M 470 210 L 495 245 L 450 245 Z" fill={ink} />
        <Path d="M 680 230 L 705 260 L 660 260 Z" fill={ink} />
        {/* Foreground ridge */}
        <Path d="M 0 350 L 160 280 L 320 350 L 520 290 L 700 360 L 800 330 L 800 400 L 0 400 Z" fill={ink} />
        {/* Contour line */}
        <Path d="M 0 380 Q 200 360 400 380 T 800 370" stroke={amber} strokeWidth={1.2} fill="none" strokeDasharray="4 4" />
      </Svg>
    </View>
  );
}

export function GhatsIllus({ width = 360, height = 180 }: Props) {
  const ink = colors.light.ink;
  const amber = colors.light.amber;
  const muted = '#B8B3A6';
  return (
    <View style={[styles.wrap, { width, height }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <PaperBg />
        {/* Soft rolling hills */}
        <Path d="M 0 300 Q 100 240 200 290 Q 300 340 400 280 Q 500 220 600 290 Q 700 340 800 270 L 800 400 L 0 400 Z" fill="none" stroke={muted} strokeWidth={1.2} />
        <Path d="M 0 330 Q 120 280 240 320 Q 360 360 480 310 Q 600 260 720 320 Q 790 360 800 340 L 800 400 L 0 400 Z" fill="#E0DCD2" stroke={ink} strokeWidth={1.2} />
        <Path d="M 0 370 Q 150 340 300 360 Q 450 380 600 350 Q 720 330 800 360 L 800 400 L 0 400 Z" fill={ink} />
        {/* Winding road */}
        <Path d="M 40 395 Q 200 320 360 370 Q 520 420 680 340 Q 760 300 800 320" stroke={amber} strokeWidth={2.4} fill="none" strokeDasharray="8 6" />
        {/* Mist circles */}
        <Circle cx={250} cy={220} r={50} fill="#E8E4DB" opacity={0.7} />
        <Circle cx={560} cy={230} r={38} fill="#E8E4DB" opacity={0.6} />
        {/* Lone coffee plant marker */}
        <Line x1={680} y1={360} x2={680} y2={330} stroke={ink} strokeWidth={1.2} />
        <Circle cx={680} cy={325} r={4} fill={ink} />
      </Svg>
    </View>
  );
}

export function CoastIllus({ width = 360, height = 180 }: Props) {
  const ink = colors.light.ink;
  const amber = colors.light.amber;
  const muted = '#B8B3A6';
  return (
    <View style={[styles.wrap, { width, height }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <PaperBg />
        {/* Sun low */}
        <Circle cx={600} cy={180} r={52} fill={amber} opacity={0.18} />
        <Circle cx={600} cy={180} r={36} fill="none" stroke={amber} strokeWidth={1.5} />
        {/* Horizon */}
        <Line x1={0} y1={220} x2={800} y2={220} stroke={ink} strokeWidth={1.2} />
        {/* Wave lines */}
        {[240, 260, 280, 300, 320, 340].map((y, i) => (
          <Path key={i} d={`M 0 ${y} Q 100 ${y - 4} 200 ${y} T 400 ${y} T 600 ${y} T 800 ${y}`} stroke={muted} strokeWidth={0.8} fill="none" />
        ))}
        {/* Foreground curve shoreline */}
        <Path d="M 0 360 Q 200 330 400 360 T 800 350 L 800 400 L 0 400 Z" fill={ink} />
        {/* Distant sail */}
        <Path d="M 150 200 L 150 175 L 170 200 Z" fill={ink} />
        <Line x1={150} y1={200} x2={150} y2={210} stroke={ink} strokeWidth={1.2} />
        {/* Palm on right */}
        <Line x1={740} y1={360} x2={720} y2={300} stroke={ink} strokeWidth={1.6} />
        <Path d="M 720 300 Q 690 290 680 308" stroke={ink} strokeWidth={1.4} fill="none" />
        <Path d="M 720 300 Q 750 280 770 295" stroke={ink} strokeWidth={1.4} fill="none" />
        <Path d="M 720 300 Q 710 270 720 260" stroke={ink} strokeWidth={1.4} fill="none" />
        <Path d="M 720 300 Q 740 270 755 270" stroke={ink} strokeWidth={1.4} fill="none" />
      </Svg>
    </View>
  );
}

export function RoadIllus({ width = 360, height = 180 }: Props) {
  const ink = colors.light.ink;
  const amber = colors.light.amber;
  const muted = '#B8B3A6';
  return (
    <View style={[styles.wrap, { width, height }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <PaperBg />
        {/* Horizon band */}
        <Line x1={0} y1={220} x2={800} y2={220} stroke={muted} strokeWidth={0.8} />
        {/* Perspective road */}
        <Path d="M 360 220 L 440 220 L 620 400 L 180 400 Z" fill="#E0DCD2" stroke={ink} strokeWidth={1.2} />
        {/* Road dashes */}
        {[0, 1, 2, 3, 4].map((i) => {
          const y1 = 230 + i * 34, y2 = y1 + 14;
          const w1 = 4 + i * 2, w2 = w1 + 2;
          return <Rect key={i} x={400 - w1 / 2} y={y1} width={w1} height={14} fill={amber} />;
        })}
        {/* Telegraph poles */}
        <Line x1={600} y1={220} x2={600} y2={180} stroke={ink} strokeWidth={1.2} />
        <Line x1={580} y1={195} x2={620} y2={195} stroke={ink} strokeWidth={1.2} />
        <Line x1={200} y1={220} x2={200} y2={170} stroke={ink} strokeWidth={1.2} />
        <Line x1={175} y1={185} x2={225} y2={185} stroke={ink} strokeWidth={1.2} />
        {/* Mountains behind */}
        <Path d="M 0 220 L 80 180 L 160 215 L 260 175 L 360 220" fill="none" stroke={ink} strokeWidth={1.2} />
        <Path d="M 440 220 L 540 180 L 640 215 L 740 180 L 800 210 L 800 220 Z" fill="none" stroke={ink} strokeWidth={1.2} />
        {/* Milestone stub */}
        <Rect x={640} y={370} width={20} height={24} fill={ink} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: colors.light.surface },
});

// Pick one by trip
export function trackIllus(trip: any) {
  const text = `${trip?.name || ''} ${trip?.start?.name || ''} ${trip?.end?.name || ''}`.toLowerCase();
  if (/leh|manali|spiti|himalay|ladakh|sarchu|kaza|pang|shimla|tawang/.test(text)) return 'himalaya';
  if (/coorg|mysuru|mysore|nilgiri|wayanad|chikmagalur|ooty|munnar/.test(text)) return 'ghats';
  if (/goa|pondi|kerala|konkan|mangalore|coast|vizag|gokarna/.test(text)) return 'coast';
  return 'road';
}

export function TripIllus({ trip, width, height }: { trip: any; width?: number; height?: number }) {
  const kind = trackIllus(trip);
  if (kind === 'himalaya') return <MountainIllus width={width} height={height} />;
  if (kind === 'ghats') return <GhatsIllus width={width} height={height} />;
  if (kind === 'coast') return <CoastIllus width={width} height={height} />;
  return <RoadIllus width={width} height={height} />;
}
