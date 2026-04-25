import React, { useEffect, useMemo, useRef } from 'react';
import { Platform, View, StyleSheet, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, type } from '../theme/tokens';

type Pt = { lat: number; lng: number; name?: string };

// Marker rendered on top of the route polyline. `id` must be stable across
// renders so the WebView can diff (move existing marker) instead of recreating.
export type LiveMarker = {
  id: string;
  lat: number;
  lng: number;
  name?: string;
  heading_deg?: number;
  // Visual modifiers — picked to keep the WebView CSS small.
  isSelf?: boolean;     // bigger amber pulse, "you are here"
  isSOS?: boolean;      // red pulse, takes priority over isSelf
  stale?: boolean;      // grayscale, half opacity (last fix > 30s ago)
};

function buildHtml(points: Pt[], dark: boolean, routeCoords?: [number, number][]) {
  const tile = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
  const labelTile = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png';
  const route = dark ? '#FF8C00' : '#D96606';
  const ink = dark ? '#FFFFFF' : '#1C1B1A';
  const bg = dark ? '#0A0A0A' : '#F7F5F0';
  const sosColor = '#E0533D';
  const ptsJson = JSON.stringify(points);
  // routeCoords (when provided) draws the actual road path returned by OSRM;
  // we still keep the straight-line polyline so even without geometry the
  // viewer sees something meaningful.
  const routeJson = JSON.stringify(routeCoords || []);
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
    /* Crew member marker — small amber dot, no pulse. */
    .pin.crew{background:${route};border:2px solid ${bg};width:14px;height:14px;}
    /* Self marker — bigger, with halo so the rider can find themselves. */
    .pin.self{background:${route};border:3px solid ${bg};box-shadow:0 0 0 8px ${route}33;width:18px;height:18px;}
    /* SOS — red, animated pulse to grab attention even at small zoom. */
    .pin.sos{background:${sosColor};border:3px solid ${bg};box-shadow:0 0 0 0 ${sosColor}aa;width:20px;height:20px;animation:sos 1.4s ease-out infinite;}
    .pin.stale{filter:grayscale(0.85);opacity:0.55;}
    @keyframes sos{0%{box-shadow:0 0 0 0 ${sosColor}aa;}70%{box-shadow:0 0 0 16px ${sosColor}00;}100%{box-shadow:0 0 0 0 ${sosColor}00;}}
    .name-tag{font-family:'JetBrains Mono', monospace;font-size:9px;color:${ink};background:${bg}cc;padding:1px 4px;border:1px solid ${ink}33;border-radius:2px;white-space:nowrap;transform:translate(10px,-8px);pointer-events:none;}
  </style></head>
  <body><div id="m"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const pts = ${ptsJson};
    const map = L.map('m', { zoomControl:false, attributionControl:true, dragging:true, tap:false }).setView([20.5,78.9], 5);
    L.tileLayer('${tile}', { subdomains:'abcd', maxZoom:19, attribution:'© OSM · CartoDB' }).addTo(map);
    L.tileLayer('${labelTile}', { subdomains:'abcd', maxZoom:19, opacity:0.8 }).addTo(map);
    if (pts.length) {
      const latlngs = pts.map(p => [p.lat, p.lng]);
      const roadCoords = ${routeJson};
      // Prefer the road-following geometry if we have it. Falling back to the
      // waypoint polyline keeps the map populated even if OSRM is down.
      const lineCoords = (roadCoords && roadCoords.length >= 2) ? roadCoords : latlngs;
      L.polyline(lineCoords, { color:'${route}', weight:3, opacity:0.9 }).addTo(map);
      pts.forEach((p,i) => {
        const isEnd = (i===0 || i===pts.length-1);
        const icon = L.divIcon({ className:'', html:'<div class="pin'+(isEnd?'':' way')+'"></div>', iconSize:[14,14], iconAnchor:[7,7] });
        L.marker([p.lat, p.lng], { icon }).addTo(map);
      });
      // Fit to whichever polyline we drew so the camera frames the actual
      // road (which may bow significantly outside the straight-line bbox).
      map.fitBounds(lineCoords, { padding:[28,28], maxZoom:11 });
    }

    // Live marker registry — keyed by id so we can diff updates instead of
    // recreating markers every tick (which would also drop any open popups
    // and cause a flicker on the map).
    const live = {};

    function classFor(m) {
      // SOS wins over self wins over crew. Stale modifier stacks on top.
      let cls = 'pin ';
      if (m.isSOS) cls += 'sos';
      else if (m.isSelf) cls += 'self';
      else cls += 'crew';
      if (m.stale) cls += ' stale';
      return cls;
    }

    function buildIcon(m) {
      const heading = (m.heading_deg ?? 0) | 0;
      const label = m.name ? '<span class="name-tag">'+escapeHtml(m.name)+'</span>' : '';
      // The pin itself doesn't rotate — rotating a circle is invisible. We
      // keep heading available for a future arrow/chevron icon; today it's a
      // no-op visual but the data flows through end-to-end.
      const html = '<div class="'+classFor(m)+'" data-heading="'+heading+'"></div>'+label;
      return L.divIcon({ className:'', html, iconSize:[18,18], iconAnchor:[9,9] });
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function setMarkers(list) {
      const seen = new Set();
      list.forEach(m => {
        if (m == null || m.lat == null || m.lng == null) return;
        seen.add(m.id);
        const existing = live[m.id];
        if (existing) {
          existing.setLatLng([m.lat, m.lng]);
          existing.setIcon(buildIcon(m));
        } else {
          live[m.id] = L.marker([m.lat, m.lng], { icon: buildIcon(m) }).addTo(map);
        }
      });
      // Remove markers that disappeared from the latest snapshot.
      Object.keys(live).forEach(id => {
        if (!seen.has(id)) {
          try { map.removeLayer(live[id]); } catch(e) {}
          delete live[id];
        }
      });
    }

    function handle(raw) {
      try {
        const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!d) return;
        if (d.type === 'markers') setMarkers(d.list || []);
        // Back-compat: legacy single-marker callers (Plan screen etc).
        if (d.type === 'live') setMarkers([{ id:'__legacy__', lat:d.lat, lng:d.lng, isSelf:true }]);
      } catch(e) {}
    }
    window.addEventListener('message', (e) => handle(e.data));
    document.addEventListener('message', (e) => handle(e.data)); // RN WebView
  </script></body></html>`;
}

// Push a payload into the WebView, hitting both message channels so it works
// across iOS RN, Android RN, and the iframe-based web build. Cheap to call;
// the WebView de-dupes via the marker registry.
function pushToView(opts: { iframe: any; webView: any; payload: object }) {
  const { iframe, webView, payload } = opts;
  const json = JSON.stringify(payload);
  if (Platform.OS === 'web') {
    try { iframe?.contentWindow?.postMessage(payload, '*'); } catch {}
    return;
  }
  try { webView?.postMessage?.(json); } catch {}
  try { webView?.injectJavaScript?.(`window.dispatchEvent(new MessageEvent('message',{data:${json}}));true;`); } catch {}
}

export function MapView({
  points,
  width = 360,
  height = 240,
  dark = false,
  liveMarker,
  markers,
  routeCoords,
}: {
  points: Pt[];
  width?: number;
  height?: number;
  dark?: boolean;
  /** @deprecated pass `markers` instead. Kept so Plan/Discover screens keep working. */
  liveMarker?: Pt;
  /** Crew + self markers. Diffed by `id` inside the WebView. */
  markers?: LiveMarker[];
  /** Road-following geometry — `[[lat, lng], ...]`. Replaces the straight-line
   *  polyline between waypoints when present. Fetched lazily from the backend. */
  routeCoords?: [number, number][];
}) {
  // HTML only depends on points + dark + routeCoords (stable during Live Ride);
  // markers are pushed in via postMessage so we never re-render the whole map.
  const html = useMemo(() => buildHtml(points, dark, routeCoords), [points, dark, routeCoords]);
  const t = dark ? colors.dark : colors.light;
  const iframeRef = useRef<any>(null);
  const webViewRef = useRef<any>(null);
  const initialPushedRef = useRef(false);

  // Resolve which marker payload to use. Prefer `markers` (multi); fall back
  // to legacy `liveMarker` so we don't break Plan/Discover screens that still
  // pass a single point.
  const effectiveMarkers: LiveMarker[] = useMemo(() => {
    if (markers && markers.length) return markers;
    if (liveMarker) return [{ id: '__legacy__', lat: liveMarker.lat, lng: liveMarker.lng, isSelf: true }];
    return [];
  }, [markers, liveMarker]);

  // Serialize for the dependency check — avoids re-pushing when the array
  // reference changes but the contents are equivalent.
  const markersKey = useMemo(
    () => effectiveMarkers.map(m => `${m.id}:${m.lat.toFixed(5)}:${m.lng.toFixed(5)}:${m.heading_deg ?? 0}:${m.isSelf?'s':''}${m.isSOS?'!':''}${m.stale?'~':''}`).join('|'),
    [effectiveMarkers],
  );

  useEffect(() => {
    if (!effectiveMarkers.length) return;
    pushToView({
      iframe: iframeRef.current,
      webView: webViewRef.current,
      payload: { type: 'markers', list: effectiveMarkers },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markersKey]);

  // Push initial state once the map HTML has actually loaded — `useEffect`
  // alone fires before Leaflet has mounted on first render.
  const onLoaded = () => {
    initialPushedRef.current = true;
    if (!effectiveMarkers.length) return;
    pushToView({
      iframe: iframeRef.current,
      webView: webViewRef.current,
      payload: { type: 'markers', list: effectiveMarkers },
    });
  };

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
        <iframe ref={iframeRef} srcDoc={html} onLoad={onLoaded} style={{ width, height, border: 0, display: 'block', background: t.bg }} />
      </View>
    );
  }

  return (
    <View style={[styles.frame, { width, height, borderColor: t.rule, backgroundColor: t.bg }]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html }}
        style={{ width, height, backgroundColor: t.bg }}
        scrollEnabled={false}
        javaScriptEnabled
        onLoadEnd={onLoaded}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: 1, overflow: 'hidden' },
});
