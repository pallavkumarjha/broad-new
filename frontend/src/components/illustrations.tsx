import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Rect, Circle, Line, G, Defs, Pattern, Text as SvgText } from 'react-native-svg';
import { colors } from '../theme/tokens';

type Props = { width?: number; height?: number; dark?: boolean };

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

// ─── Dawn — auth screens (login / register) ───────────────────────────────
export function DawnIllus({ width = 360, height = 200 }: Props) {
  const ink   = colors.light.ink;
  const amber = colors.light.amber;
  const muted = '#B8B3A6';
  const cx = 400, cy = 265; // sun center

  // 6 rays above the horizon, alternating lengths
  const rays = [225, 248, 270, 292, 315].map((deg, i) => {
    const rad = (deg * Math.PI) / 180;
    const r1 = 55, r2 = i % 2 === 0 ? 90 : 78;
    return {
      x1: cx + Math.cos(rad) * r1,
      y1: cy + Math.sin(rad) * r1,
      x2: cx + Math.cos(rad) * r2,
      y2: cy + Math.sin(rad) * r2,
    };
  });

  return (
    <View style={[styles.wrap, { width, height }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <PaperBg />
        {/* Sun corona */}
        <Circle cx={cx} cy={cy} r={100} fill={amber} opacity={0.07} />
        <Circle cx={cx} cy={cy} r={72}  fill={amber} opacity={0.11} />
        <Circle cx={cx} cy={cy} r={50}  fill="none" stroke={amber} strokeWidth={1.2} opacity={0.5} />
        {/* Rays */}
        {rays.map((r, i) => (
          <Line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
            stroke={amber} strokeWidth={1.5} opacity={0.7} />
        ))}
        {/* Sun disc */}
        <Circle cx={cx} cy={cy} r={36} fill={amber} opacity={0.25} />
        <Circle cx={cx} cy={cy} r={22} fill={amber} />
        {/* Far hills — muted */}
        <Path
          d="M 0 265 Q 100 245 210 258 Q 310 270 400 265 Q 490 260 590 252 Q 700 244 800 262 L 800 400 L 0 400 Z"
          fill="#E0DCD2" stroke={muted} strokeWidth={0.8}
        />
        {/* Near ridge — ink */}
        <Path
          d="M 0 315 Q 90 295 170 308 Q 280 325 355 298 Q 400 285 445 298 Q 525 318 630 300 Q 720 288 800 310 L 800 400 L 0 400 Z"
          fill={ink}
        />
        {/* Road lane */}
        <Path
          d="M 305 400 L 388 265 L 412 265 L 495 400 Z"
          fill="#E8E4DB" stroke={ink} strokeWidth={1}
        />
        {/* Amber road dashes */}
        {[0, 1, 2, 3].map((i) => {
          const y = 300 + i * 24;
          const hw = 2 + i * 1.5;
          return <Rect key={i} x={400 - hw} y={y} width={hw * 2} height={10} fill={amber} opacity={0.9} />;
        })}
      </Svg>
    </View>
  );
}

// ─── Compass — onboarding / permissions screen ────────────────────────────
export function CompassIllus({ width = 360, height = 200 }: Props) {
  const ink   = colors.light.ink;
  const amber = colors.light.amber;
  const muted = '#C8C4BB';
  const cx = 400, cy = 200;

  // 8 bearing lines
  const bearings = Array.from({ length: 8 }, (_, i) => {
    const deg = i * 45;
    const rad = (deg * Math.PI) / 180;
    const isCardinal = deg % 90 === 0;
    return { rad, isCardinal };
  });

  // Topo rings at these radii
  const rings = [52, 90, 128, 168, 210];

  return (
    <View style={[styles.wrap, { width, height }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <PaperBg />
        {/* Subtle grid */}
        {Array.from({ length: 10 }, (_, i) => (
          <Line key={`v${i}`} x1={i * 90} y1={0} x2={i * 90} y2={H} stroke={muted} strokeWidth={0.4} opacity={0.5} />
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <Line key={`h${i}`} x1={0} y1={i * 80} x2={W} y2={i * 80} stroke={muted} strokeWidth={0.4} opacity={0.5} />
        ))}
        {/* Topo rings */}
        {rings.map((r) => (
          <Circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke={muted} strokeWidth={0.9} />
        ))}
        {/* Tick marks on outermost ring at 8 directions */}
        {bearings.map(({ rad, isCardinal }, i) => {
          const rOuter = 212, rTick = isCardinal ? 224 : 218;
          return (
            <Line key={i}
              x1={cx + Math.cos(rad) * rOuter} y1={cy + Math.sin(rad) * rOuter}
              x2={cx + Math.cos(rad) * rTick}  y2={cy + Math.sin(rad) * rTick}
              stroke={ink} strokeWidth={isCardinal ? 1.5 : 0.8} opacity={0.6}
            />
          );
        })}
        {/* Bearing lines */}
        {bearings.map(({ rad, isCardinal }, i) => (
          <Line key={i}
            x1={cx} y1={cy}
            x2={cx + Math.cos(rad) * 210} y2={cy + Math.sin(rad) * 210}
            stroke={ink} strokeWidth={isCardinal ? 0.9 : 0.5} opacity={isCardinal ? 0.35 : 0.2}
          />
        ))}
        {/* Compass rose — S / E / W pointers (ink) */}
        <Path d={`M ${cx} ${cy} L ${cx + 7} ${cy + 24} L ${cx} ${cy + 44} L ${cx - 7} ${cy + 24} Z`} fill={ink} opacity={0.7} />
        <Path d={`M ${cx} ${cy} L ${cx + 24} ${cy + 7} L ${cx + 44} ${cy} L ${cx + 24} ${cy - 7} Z`} fill={ink} opacity={0.7} />
        <Path d={`M ${cx} ${cy} L ${cx - 24} ${cy + 7} L ${cx - 44} ${cy} L ${cx - 24} ${cy - 7} Z`} fill={ink} opacity={0.7} />
        {/* Compass rose — N pointer (amber) */}
        <Path d={`M ${cx} ${cy} L ${cx + 7} ${cy - 24} L ${cx} ${cy - 52} L ${cx - 7} ${cy - 24} Z`} fill={amber} />
        {/* N label */}
        <SvgText x={cx} y={cy - 62} textAnchor="middle" fontSize={14} fontFamily="monospace" fill={amber} fontWeight="600">N</SvgText>
        {/* Center circles */}
        <Circle cx={cx} cy={cy} r={10} fill={colors.light.bg} stroke={ink} strokeWidth={1} />
        <Circle cx={cx} cy={cy} r={4}  fill={amber} />
      </Svg>
    </View>
  );
}

// ─── Empty Road — blank states (trips / home / discover) ──────────────────
export function EmptyRoadIllus({ width = 360, height = 160, dark = false }: Props) {
  const ink       = dark ? colors.dark.ink   : colors.light.ink;
  const amber     = dark ? colors.dark.amber : colors.light.amber;
  const muted     = dark ? '#3A3A38'         : '#B8B3A6';
  const hillFill  = dark ? '#1A1A19'         : '#E8E4DB';
  const roadFill  = dark ? '#222220'         : '#E0DCD2';
  const wrapBg    = dark ? colors.dark.surface : colors.light.surface;
  return (
    <View style={[styles.wrap, { width, height, backgroundColor: wrapBg }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <PaperBg dark={dark} />
        {/* Horizon */}
        <Line x1={0} y1={240} x2={800} y2={240} stroke={muted} strokeWidth={0.8} />
        {/* Faint distant hills */}
        <Path
          d="M 0 240 Q 120 224 240 236 Q 340 245 400 240 Q 460 235 560 230 Q 680 224 800 238 L 800 400 L 0 400 Z"
          fill={hillFill} stroke="none"
        />
        {/* Road surface */}
        <Path
          d="M 240 400 L 374 240 L 426 240 L 560 400 Z"
          fill={roadFill} stroke={ink} strokeWidth={1.2}
        />
        {/* Amber center dashes */}
        {[0, 1, 2, 3, 4].map((i) => {
          const y = 260 + i * 32;
          const hw = 2.5 + i * 1.8;
          return <Rect key={i} x={400 - hw} y={y} width={hw * 2} height={14} fill={amber} opacity={0.85} />;
        })}
        {/* Shoulder lines */}
        <Line x1={240} y1={400} x2={374} y2={240} stroke={muted} strokeWidth={0.8} />
        <Line x1={560} y1={400} x2={426} y2={240} stroke={muted} strokeWidth={0.8} />
        {/* Horizon glow */}
        <Circle cx={400} cy={240} r={30} fill={amber} opacity={0.06} />
        {/* Vanishing point dot */}
        <Circle cx={400} cy={240} r={3} fill={amber} opacity={0.5} />
      </Svg>
    </View>
  );
}

// ─── Sunrise Ride — home screen hero ─────────────────────────────────────────
// Bike silhouette heading toward a dawn horizon. Adapted from DawnIllus;
// the motorcycle grounds the editorial scene in the product's purpose.
export function SunriseRideIllus({ width = 360, height = 180 }: Props) {
  const ink   = colors.light.ink;
  const amber = colors.light.amber;
  const muted = '#B8B3A6';
  const cx = 400, cy = 265;

  const rays = [225, 248, 270, 292, 315].map((deg, i) => {
    const rad = (deg * Math.PI) / 180;
    const r1 = 55, r2 = i % 2 === 0 ? 90 : 78;
    return {
      x1: cx + Math.cos(rad) * r1, y1: cy + Math.sin(rad) * r1,
      x2: cx + Math.cos(rad) * r2, y2: cy + Math.sin(rad) * r2,
    };
  });

  return (
    <View style={[styles.wrap, { width, height }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <PaperBg />
        {/* Sun corona */}
        <Circle cx={cx} cy={cy} r={100} fill={amber} opacity={0.07} />
        <Circle cx={cx} cy={cy} r={72}  fill={amber} opacity={0.11} />
        <Circle cx={cx} cy={cy} r={50}  fill="none" stroke={amber} strokeWidth={1.2} opacity={0.5} />
        {rays.map((r, i) => (
          <Line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={amber} strokeWidth={1.5} opacity={0.7} />
        ))}
        <Circle cx={cx} cy={cy} r={36} fill={amber} opacity={0.25} />
        <Circle cx={cx} cy={cy} r={22} fill={amber} />
        {/* Far hills */}
        <Path d="M 0 265 Q 100 245 210 258 Q 310 270 400 265 Q 490 260 590 252 Q 700 244 800 262 L 800 400 L 0 400 Z" fill="#E0DCD2" stroke={muted} strokeWidth={0.8} />
        {/* Near ridge */}
        <Path d="M 0 315 Q 90 295 170 308 Q 280 325 355 298 Q 400 285 445 298 Q 525 318 630 300 Q 720 288 800 310 L 800 400 L 0 400 Z" fill={ink} />
        {/* Road */}
        <Path d="M 305 400 L 388 265 L 412 265 L 495 400 Z" fill="#E8E4DB" stroke={ink} strokeWidth={1} />
        {/* Amber centre dashes */}
        {[0, 1, 2, 3].map((i) => {
          const y = 300 + i * 24, hw = 2 + i * 1.5;
          return <Rect key={i} x={400 - hw} y={y} width={hw * 2} height={10} fill={amber} opacity={0.9} />;
        })}
        {/* ── Motorcycle silhouette — heading toward the sun ── */}
        {/* Rear wheel */}
        <Circle cx={372} cy={364} r={22} fill="none" stroke={ink} strokeWidth={3} />
        <Circle cx={372} cy={364} r={6}  fill={ink} />
        {/* Front wheel */}
        <Circle cx={428} cy={364} r={22} fill="none" stroke={ink} strokeWidth={3} />
        <Circle cx={428} cy={364} r={6}  fill={ink} />
        {/* Main frame / engine block */}
        <Path d="M 387 364 L 381 333 L 402 320 L 430 327 L 441 353 L 441 364 Z" fill={ink} />
        {/* Tank — amber accent */}
        <Path d="M 388 333 L 415 326 L 412 316 L 387 320 Z" fill={amber} />
        {/* Rider torso */}
        <Path d="M 394 328 L 422 322 L 424 310 L 400 314 Z" fill={ink} />
        {/* Helmet */}
        <Circle cx={412} cy={302} r={13} fill={ink} />
        {/* Handlebar */}
        <Line x1={422} y1={324} x2={440} y2={318} stroke={ink} strokeWidth={2.5} strokeLinecap="round" />
        {/* Exhaust */}
        <Path d="M 387 356 L 354 364 L 354 370 L 389 364 Z" fill={muted} />
        {/* Front fork */}
        <Line x1={434} y1={344} x2={428} y2={344} stroke={ink} strokeWidth={1.5} />
      </Svg>
    </View>
  );
}

// ─── Desert — Rajasthan / flat terrain ────────────────────────────────────────
export function DesertIllus({ width = 360, height = 180 }: Props) {
  const ink   = colors.light.ink;
  const amber = colors.light.amber;
  const muted = '#B8B3A6';
  const sand  = '#DDD5C0';

  return (
    <View style={[styles.wrap, { width, height }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <PaperBg />
        {/* Sun — high and hot */}
        <Circle cx={680} cy={80} r={58} fill={amber} opacity={0.08} />
        <Circle cx={680} cy={80} r={40} fill={amber} opacity={0.14} />
        <Circle cx={680} cy={80} r={26} fill={amber} />
        {/* Horizon */}
        <Line x1={0} y1={200} x2={800} y2={200} stroke={muted} strokeWidth={0.8} />
        {/* Sandy floor */}
        <Rect x={0} y={200} width={800} height={200} fill={sand} />
        {/* Far dune layer */}
        <Path d="M 0 280 Q 100 245 200 268 Q 260 282 300 262 Q 350 242 400 270 Q 450 298 520 268 Q 600 240 700 274 L 800 260 L 800 400 L 0 400 Z" fill="#D4C9B0" stroke="none" />
        {/* Near dune / foreground */}
        <Path d="M 0 338 Q 90 314 180 330 Q 250 342 320 320 Q 380 304 450 328 Q 530 350 620 330 Q 710 312 800 336 L 800 400 L 0 400 Z" fill={ink} />
        {/* Arrow-straight desert road */}
        <Path d="M 352 400 L 392 200 L 408 200 L 448 400 Z" fill="#C8BFA8" stroke={muted} strokeWidth={0.8} />
        {/* Road dashes */}
        {[0, 1, 2, 3, 4].map((i) => {
          const y = 218 + i * 36, hw = 2 + i * 2.2;
          return <Rect key={i} x={400 - hw} y={y} width={hw * 2} height={14} fill={amber} opacity={0.7} />;
        })}
        {/* Acacia tree — flat-topped, classic Rajasthan */}
        <Line x1={155} y1={268} x2={148} y2={202} stroke={ink} strokeWidth={2} />
        <Path d="M 96 210 Q 152 178 208 210" stroke={ink} strokeWidth={1.6} fill={sand} />
        <Path d="M 110 204 Q 152 186 194 204" stroke={ink} strokeWidth={1} fill="none" />
        {/* Distant scrub */}
        <Line x1={590} y1={276} x2={590} y2={258} stroke={ink} strokeWidth={1.2} />
        <Path d="M 572 263 Q 590 254 608 263" stroke={ink} strokeWidth={1} fill="none" />
        {/* Heat shimmer above road */}
        {[1, 2, 3].map((i) => (
          <Path key={i} d={`M ${393 - i * 3} ${212 + i * 5} Q 400 ${207 + i * 5} ${407 + i * 3} ${212 + i * 5}`} stroke={muted} strokeWidth={0.6} fill="none" opacity={0.45} />
        ))}
        {/* Distant fort outline */}
        <Rect x={574} y={186} width={9}  height={14} fill={muted} opacity={0.45} />
        <Rect x={587} y={189} width={20} height={11} fill={muted} opacity={0.45} />
        <Rect x={612} y={186} width={9}  height={14} fill={muted} opacity={0.45} />
      </Svg>
    </View>
  );
}

// ─── Summit — achievement / last ride recap ───────────────────────────────────
// Single dramatic peak with amber flag and a dashed trail of waypoints.
export function SummitIllus({ width = 360, height = 180 }: Props) {
  const ink   = colors.light.ink;
  const amber = colors.light.amber;
  const muted = '#B8B3A6';

  return (
    <View style={[styles.wrap, { width, height }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <PaperBg />
        {/* Stars */}
        {[[110,55],[215,38],[325,76],[485,48],[590,68],[695,44],[750,86]].map(([x,y],i) => (
          <Circle key={i} cx={x} cy={y} r={2} fill={muted} opacity={0.55} />
        ))}
        {/* Far ridge */}
        <Path d="M 0 220 L 100 145 L 185 198 L 285 122 L 370 182 L 455 138 L 535 192 L 610 110 L 710 178 L 800 132 L 800 400 L 0 400 Z" fill="none" stroke={muted} strokeWidth={0.9} />
        {/* Main peak */}
        <Path d="M 0 325 L 400 78 L 800 325 L 800 400 L 0 400 Z" fill="#E0DCD2" stroke={ink} strokeWidth={1.4} />
        {/* Snow cap */}
        <Path d="M 400 78 L 462 162 L 338 162 Z" fill={ink} />
        {/* Summit flagpole + amber flag */}
        <Line x1={400} y1={78} x2={400} y2={42} stroke={ink} strokeWidth={1.8} />
        <Path d="M 400 42 L 436 56 L 400 70 Z" fill={amber} />
        {/* Winding trail with amber dashes */}
        <Path d="M 155 400 Q 195 360 225 332 Q 258 302 282 278 Q 314 250 342 238 Q 370 226 388 205 Q 396 190 400 174" stroke={amber} strokeWidth={1.8} fill="none" strokeDasharray="6 5" />
        {/* Waypoint dots on trail */}
        {[[218,340],[275,284],[334,242],[390,207]].map(([x,y],i) => (
          <Circle key={i} cx={x} cy={y} r={5} fill={colors.light.bg} stroke={amber} strokeWidth={1.5} />
        ))}
        {/* Foreground ridge */}
        <Path d="M 0 365 Q 155 336 305 358 Q 455 380 610 352 Q 730 330 800 362 L 800 400 L 0 400 Z" fill={ink} />
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
  if (/jaipur|rajasthan|jaisalmer|bikaner|jodhpur|pushkar|desert|rann/.test(text)) return 'desert';
  return 'road';
}

export function TripIllus({ trip, width, height }: { trip: any; width?: number; height?: number }) {
  const kind = trackIllus(trip);
  if (kind === 'himalaya') return <MountainIllus width={width} height={height} />;
  if (kind === 'ghats')    return <GhatsIllus    width={width} height={height} />;
  if (kind === 'coast')    return <CoastIllus    width={width} height={height} />;
  if (kind === 'desert')   return <DesertIllus   width={width} height={height} />;
  return <RoadIllus width={width} height={height} />;
}

// ──────────────────────────────────────────────────────────────────────────
// HelmetIllus — the Broad brand mark. Full-face helmet in side profile,
// facing right. Matte black body, orange concentric vent accent, white
// pinstripe trim, tinted visor. Designed to match the paper/ink aesthetic
// of the other illustrations so it reads as part of the same system.
// ──────────────────────────────────────────────────────────────────────────
export function HelmetIllus({
  width = 220,
  height = 220,
  showPaper = true,
  dark = false,
}: Props & { showPaper?: boolean }) {
  const amber = colors.light.amber;
  const body = '#1C1C1C';       // matte black shell
  const visor = '#2E2E34';      // tinted visor
  const trim = '#FFFFFF';       // pinstripe
  const bg = dark ? '#141414' : '#EFECE5';
  // Tight square viewBox — helmet fills ~90% for strong presence.
  const VB = 200;
  return (
    <View style={[styles.wrap, { width, height, backgroundColor: bg }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${VB} ${VB}`} preserveAspectRatio="xMidYMid meet">
        {showPaper && (
          <>
            {/* Subtle paper hatching just like the other illustrations */}
            <Defs>
              <Pattern id="helmet-hatch" width={8} height={8} patternUnits="userSpaceOnUse">
                <Line x1={0} y1={8} x2={8} y2={0} stroke={dark ? '#1f1f1f' : '#E0DCD2'} strokeWidth={0.5} />
              </Pattern>
            </Defs>
            <Rect x={0} y={0} width={VB} height={VB} fill={bg} />
            <Rect x={0} y={0} width={VB} height={VB} fill="url(#helmet-hatch)" opacity={0.4} />
          </>
        )}

        {/* Helmet shell — full-face profile facing right. The path sketches:
            crown over to the back, down the rear with a small intake notch,
            around the jaw/chin bar, up the chin, across the visor mouth line,
            and over the brow back to the crown. */}
        <Path
          d="
            M 55 78
            Q 55 38 100 32
            Q 155 32 165 78
            L 165 118
            Q 165 138 150 150
            L 140 160
            Q 130 168 112 168
            L 70 168
            Q 56 168 52 154
            Q 48 140 50 120
            L 42 116
            L 50 108
            Z
          "
          fill={body}
          stroke={body}
          strokeWidth={1}
          strokeLinejoin="round"
        />

        {/* Back-top intake notch — small triangular cutout signature detail */}
        <Path
          d="M 62 62 L 55 72 L 68 70 Z"
          fill={bg}
        />

        {/* Visor opening — dark tinted glass on the right/front */}
        <Path
          d="
            M 104 66
            Q 160 68 162 98
            L 162 112
            Q 160 122 150 124
            L 108 124
            Q 100 124 100 116
            L 100 74
            Q 100 66 104 66
            Z
          "
          fill={visor}
        />

        {/* Visor top reflection hint — very subtle */}
        <Path
          d="M 112 74 Q 148 74 156 92"
          fill="none"
          stroke="#3A3A42"
          strokeWidth={1}
          strokeLinecap="round"
        />

        {/* White pinstripe — runs along the lower edge of the shell */}
        <Path
          d="
            M 50 130
            Q 56 156 72 162
            L 138 162
            Q 152 158 160 142
          "
          fill="none"
          stroke={trim}
          strokeWidth={1.2}
          strokeLinecap="round"
        />

        {/* White pinstripe — runs along the top edge of the visor */}
        <Path
          d="M 104 64 Q 138 64 160 94"
          fill="none"
          stroke={trim}
          strokeWidth={1}
          strokeLinecap="round"
        />

        {/* Orange vent — concentric circles over a filled amber disc. This is
            the signature accent of the mark, sitting just ahead of the crown
            on the side of the shell. */}
        <Circle cx={96} cy={82} r={20} fill={amber} />
        <Circle cx={96} cy={82} r={20} fill="none" stroke={trim} strokeWidth={0.6} />
        <Circle cx={96} cy={82} r={12} fill="#B35A1C" />
        <Circle cx={96} cy={82} r={12} fill="none" stroke={trim} strokeWidth={0.5} />
        <Circle cx={96} cy={82} r={5} fill="#7A3A10" />
        <Circle cx={96} cy={82} r={5} fill="none" stroke={trim} strokeWidth={0.4} />
        {/* tiny swirl tail — echoes the reference without going fussy */}
        <Path d="M 78 84 Q 84 92 92 88" fill="none" stroke={amber} strokeWidth={1.2} strokeLinecap="round" />
      </Svg>
    </View>
  );
}
