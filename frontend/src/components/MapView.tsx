import React, { useMemo } from 'react';
import { Platform, View, StyleSheet, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, type } from '../theme/tokens';

type Pt = { lat: number; lng: number; name?: string };

function buildHtml(points: Pt[], dark: boolean, liveMarker?: Pt) {
  const tile = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
  const labelTile = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png';
  const route = dark ? '#FF8C00' : '#D96606';
  const ink = dark ? '#FFFFFF' : '#1C1B1A';
  const bg = dark ? '#0A0A0A' : '#F7F5F0';
  const ptsJson = JSON.stringify(points);
  const liveJson = JSON.stringify(liveMarker || null);
  return `<!doctype html><html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <style>
    html,body,#m{margin:0;padding:0;height:100%;width:100%;background:${bg};}
    .leaflet-container{background:${bg} !important;}
    .leaflet-control-attribution{font-family:'JetBrains Mono', monospace; font-size:8px; background:transparent !important; color:${dark ? '#666' : '#999'} !important;}
    .leaflet-control-zoom{display:none;}
    .pin{background:${ink};border:2px solid ${bg};border-radius:50%;width:14px;height:14px;box-shadow:0 0 0 1px ${ink};}
    .pin.way{background:${bg};border:2px solid ${ink};width:10px;height:10px;}
    .pin.live{background:${route};border:3px solid ${bg};box-shadow:0 0 0 8px ${route}33;width:18px;height:18px;}
  </style></head>
  <body><div id="m"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const pts = ${ptsJson};
    const live = ${liveJson};
    const map = L.map('m', { zoomControl:false, attributionControl:true, dragging:true, tap:false }).setView([20.5,78.9], 5);
    L.tileLayer('${tile}', { subdomains:'abcd', maxZoom:19, attribution:'© OSM · CartoDB' }).addTo(map);
    L.tileLayer('${labelTile}', { subdomains:'abcd', maxZoom:19, opacity:0.8 }).addTo(map);
    if (pts.length) {
      const latlngs = pts.map(p => [p.lat, p.lng]);
      L.polyline(latlngs, { color:'${route}', weight:3, opacity:0.9 }).addTo(map);
      pts.forEach((p,i) => {
        const isEnd = (i===0 || i===pts.length-1);
        const icon = L.divIcon({ className:'', html:'<div class="pin'+(isEnd?'':' way')+'"></div>', iconSize:[14,14], iconAnchor:[7,7] });
        L.marker([p.lat, p.lng], { icon }).addTo(map);
      });
      if (live) {
        const licon = L.divIcon({ className:'', html:'<div class="pin live"></div>', iconSize:[18,18], iconAnchor:[9,9] });
        L.marker([live.lat, live.lng], { icon: licon }).addTo(map);
      }
      map.fitBounds(latlngs, { padding:[28,28], maxZoom:11 });
    }
  </script></body></html>`;
}

export function MapView({
  points,
  width = 360,
  height = 240,
  dark = false,
  liveMarker,
}: {
  points: Pt[];
  width?: number;
  height?: number;
  dark?: boolean;
  liveMarker?: Pt;
}) {
  const html = useMemo(() => buildHtml(points, dark, liveMarker), [points, dark, liveMarker]);
  const t = dark ? colors.dark : colors.light;

  if (!points || points.length === 0) {
    return (
      <View style={{ width, height, backgroundColor: t.bg, borderWidth: 1, borderColor: t.rule, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[type.meta, { color: t.inkMuted }]}>NO ROUTE</Text>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.frame, { width, height, borderColor: t.rule }]}>
        {/* @ts-ignore - iframe is a valid web tag */}
        <iframe srcDoc={html} style={{ width, height, border: 0, display: 'block', background: t.bg }} />
      </View>
    );
  }

  return (
    <View style={[styles.frame, { width, height, borderColor: t.rule, backgroundColor: t.bg }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={{ width, height, backgroundColor: t.bg }}
        scrollEnabled={false}
        javaScriptEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: 1, overflow: 'hidden' },
});
