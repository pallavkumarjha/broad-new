import React from 'react';
import Svg, { Path, Circle, Line, G, Rect, Defs, Pattern } from 'react-native-svg';
import { View, StyleSheet, Text } from 'react-native';
import { colors, type } from '../theme/tokens';

type Pt = { lat: number; lng: number; name?: string };

// Topographic SVG-based "map" — works on iOS/Android/web.
// Projects given lat/lng points to fit the canvas, draws a route line, waypoints.
export function TopoMap({
  points,
  width = 360,
  height = 240,
  dark = false,
  liveMarker,
  showRider,
}: {
  points: Pt[];
  width?: number;
  height?: number;
  dark?: boolean;
  liveMarker?: Pt;
  showRider?: boolean;
}) {
  const t = dark ? colors.dark : colors.light;
  const pts = points.length > 0 ? points : [{ lat: 0, lng: 0 }];

  // Project lat/lng into SVG coords
  const lats = pts.map(p => p.lat);
  const lngs = pts.map(p => p.lng);
  const minLat = Math.min(...lats) - 0.05;
  const maxLat = Math.max(...lats) + 0.05;
  const minLng = Math.min(...lngs) - 0.05;
  const maxLng = Math.max(...lngs) + 0.05;
  const padX = 24, padY = 24;
  const W = width - padX * 2, H = height - padY * 2;

  const project = (p: Pt) => {
    const x = padX + ((p.lng - minLng) / Math.max(0.0001, maxLng - minLng)) * W;
    const y = padY + (1 - (p.lat - minLat) / Math.max(0.0001, maxLat - minLat)) * H;
    return { x, y };
  };

  const projected = pts.map(project);
  const path = projected.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');

  const gridColor = dark ? '#1c1c1c' : '#E8E4DB';
  const contourColor = dark ? '#1f1f1f' : '#E0DCD2';
  const routeColor = dark ? colors.dark.amber : colors.light.amber;
  const labelColor = dark ? colors.dark.inkMuted : colors.light.inkMuted;

  return (
    <View style={{ width, height, backgroundColor: t.bg, borderWidth: 1, borderColor: t.rule, overflow: 'hidden' }}>
      <Svg width={width} height={height}>
        <Defs>
          <Pattern id="grid" width={24} height={24} patternUnits="userSpaceOnUse">
            <Path d="M 24 0 L 0 0 0 24" fill="none" stroke={gridColor} strokeWidth={0.5} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#grid)" />
        {/* contour-like ellipses */}
        {[0.15, 0.3, 0.5, 0.7].map((r, i) => (
          <Circle key={i} cx={width * 0.7} cy={height * 0.4} r={width * r} fill="none" stroke={contourColor} strokeWidth={0.6} />
        ))}
        {[0.1, 0.2, 0.35].map((r, i) => (
          <Circle key={`b${i}`} cx={width * 0.25} cy={height * 0.75} r={width * r} fill="none" stroke={contourColor} strokeWidth={0.6} />
        ))}
        {/* compass */}
        <G x={width - 38} y={28}>
          <Circle cx={0} cy={0} r={12} fill="none" stroke={t.rule} strokeWidth={1} />
          <Line x1={0} y1={-10} x2={0} y2={10} stroke={t.inkMuted} strokeWidth={0.6} />
          <Line x1={-10} y1={0} x2={10} y2={0} stroke={t.inkMuted} strokeWidth={0.6} />
          <Path d="M 0 -8 L 3 0 L 0 -2 L -3 0 Z" fill={routeColor} />
        </G>
        {/* route */}
        {projected.length > 1 && (
          <Path d={path} stroke={routeColor} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        )}
        {/* waypoints */}
        {projected.map((p, i) => {
          const isStart = i === 0, isEnd = i === projected.length - 1;
          return (
            <G key={i}>
              <Circle cx={p.x} cy={p.y} r={isStart || isEnd ? 6 : 4} fill={t.bg} stroke={t.ink} strokeWidth={1.5} />
              {(isStart || isEnd) && <Circle cx={p.x} cy={p.y} r={2.5} fill={t.ink} />}
            </G>
          );
        })}
        {/* live rider marker */}
        {liveMarker && (() => {
          const lp = project(liveMarker);
          return (
            <G>
              <Circle cx={lp.x} cy={lp.y} r={14} fill={routeColor} opacity={0.18} />
              <Circle cx={lp.x} cy={lp.y} r={6} fill={routeColor} stroke={dark ? '#000' : '#fff'} strokeWidth={2} />
            </G>
          );
        })()}
      </Svg>
      {/* corner coords label */}
      <View style={styles.coord}>
        <Text style={[type.eyebrow, { color: labelColor, fontSize: 9 }]}>
          {pts[0].lat.toFixed(3)}°N {pts[0].lng.toFixed(3)}°E
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  coord: { position: 'absolute', left: 8, bottom: 6 },
});
