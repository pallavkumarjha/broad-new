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
  /** km/h — used for the in-WebView popup body. */
  speed_kmh?: number;
  /** ISO timestamp of last fix — used to compute "x seconds ago" in popup. */
  updated_at?: string;
  // Visual modifiers — picked to keep the WebView CSS small.
  isSelf?: boolean;     // bigger amber pulse, "you are here"
  isSOS?: boolean;      // red pulse, takes priority over isSelf
  stale?: boolean;      // grayscale, half opacity (last fix > 30s ago)
};

/** Camera follow strategy.
 * - `self`: re-pan to the local rider's marker on every update (default in
 *   live ride). Switches to `free` automatically if the rider drags the map.
 * - `centroid`: re-pan to the average of all live markers — useful for
 *   organisers who want to see the whole convoy at once.
 * - `free`: never auto-pan. Rider has full manual control. */
export type FollowMode = 'self' | 'centroid' | 'free';

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
    /* Heading chevron — small triangle that orbits the pin and rotates to
       point in the rider's travel direction. Positioned absolutely against
       the marker wrapper so the chevron rotates without affecting the dot. */
    .marker-wrap{position:relative;width:30px;height:30px;display:flex;align-items:center;justify-content:center;}
    .chevron{position:absolute;top:0;left:50%;width:0;height:0;
      border-left:5px solid transparent;border-right:5px solid transparent;
      border-bottom:8px solid ${route};
      transform-origin:5px 23px;transform:translateX(-5px) rotate(0deg);
      filter:drop-shadow(0 0 1px ${bg});pointer-events:none;}
    .chevron.sos{border-bottom-color:${sosColor};}
    .pin.stale + .chevron, .marker-wrap.stale .chevron{opacity:0.55;}
    /* Popup styling — in-WebView Leaflet popup overridden to match Broad's
       editorial aesthetic. Leaflet's defaults are harshly white-rounded;
       these match the dark/light theme tokens. */
    .leaflet-popup-content-wrapper{
      background:${bg};color:${ink};border:1px solid ${ink}33;border-radius:2px;
      box-shadow:0 4px 12px rgba(0,0,0,${dark ? '0.6' : '0.15'});
    }
    .leaflet-popup-content{margin:8px 12px;font-family:'JetBrains Mono', monospace;font-size:11px;line-height:1.4;}
    .leaflet-popup-tip{background:${bg};border:1px solid ${ink}33;}
    .popup-name{font-family:'Fraunces', serif;font-size:14px;font-weight:600;color:${ink};margin-bottom:2px;}
    .popup-row{color:${dark ? '#bbb' : '#666'};font-size:10px;letter-spacing:0.5px;}
    .popup-row.stale{color:${sosColor};}
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
    // Latest data per marker. Held outside Leaflet so popup HTML can read
    // fresh values when re-bound on each setMarkers run.
    const liveData = {};
    // Camera follow strategy. Mutated via 'follow' message from parent.
    // Auto-flips to 'free' when the rider manually drags the map so we don't
    // fight their finger.
    let followMode = 'self';
    // Set true while we're auto-panning, so the dragstart listener doesn't
    // misread our own pan as the rider grabbing the map.
    let autoPanning = false;

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
      // We wrap the pin in a square so the chevron can be positioned around
      // it and rotated to indicate direction of travel without rotating the
      // pin itself (rotating a circle is invisible). Chevron is hidden when
      // we don't have a meaningful heading (heading=0 with no movement).
      const showChevron = heading !== 0 || m.isSelf;
      const chevronCls = 'chevron' + (m.isSOS ? ' sos' : '');
      const chevron = showChevron
        ? '<div class="'+chevronCls+'" style="transform:translateX(-5px) rotate('+heading+'deg);"></div>'
        : '';
      const wrapCls = 'marker-wrap' + (m.stale ? ' stale' : '');
      const html = '<div class="'+wrapCls+'">'+chevron+'<div class="'+classFor(m)+'"></div></div>'+label;
      return L.divIcon({ className:'', html, iconSize:[30,30], iconAnchor:[15,15] });
    }

    function buildPopupHtml(m) {
      const name = escapeHtml(m.name || (m.isSelf ? 'You' : 'Rider'));
      const speed = Math.round(m.speed_kmh || 0);
      let ageStr = '';
      if (m.updated_at) {
        const t = Date.parse(m.updated_at);
        if (!isNaN(t)) {
          const ageS = Math.max(0, Math.round((Date.now() - t) / 1000));
          if (ageS < 60)        ageStr = ageS + 's ago';
          else if (ageS < 3600) ageStr = Math.floor(ageS / 60) + 'm ago';
          else                  ageStr = Math.floor(ageS / 3600) + 'h ago';
        }
      }
      const staleCls = m.stale ? ' stale' : '';
      const sosLine = m.isSOS ? '<div class="popup-row stale">● SOS ACTIVE</div>' : '';
      const ageLine = ageStr ? '<div class="popup-row'+staleCls+'">LAST FIX · '+ageStr+'</div>' : '';
      return '<div class="popup-name">'+name+'</div>'
        + '<div class="popup-row">SPEED · '+speed+' KM/H</div>'
        + ageLine + sosLine;
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    /** Send a structured message back to the React Native host. Handles
     *  iOS RN, Android RN, and the iframe-on-web case. */
    function postToHost(msg) {
      const json = JSON.stringify(msg);
      try { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(json); } catch(e) {}
      try { if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*'); } catch(e) {}
    }

    function applyFollow() {
      // No-op for 'free'. For 'self' / 'centroid' we re-pan after each marker
      // update. Anchored to autoPanning flag so we don't trigger our own
      // dragstart listener and flip to free.
      const ids = Object.keys(liveData);
      if (followMode === 'free' || ids.length === 0) return;
      let target = null;
      if (followMode === 'self') {
        const selfId = ids.find(id => liveData[id] && liveData[id].isSelf);
        if (selfId) target = [liveData[selfId].lat, liveData[selfId].lng];
      } else if (followMode === 'centroid') {
        let lat = 0, lng = 0, n = 0;
        ids.forEach(id => {
          const m = liveData[id];
          if (m && m.lat != null && m.lng != null) { lat += m.lat; lng += m.lng; n++; }
        });
        if (n > 0) target = [lat / n, lng / n];
      }
      if (target) {
        autoPanning = true;
        map.panTo(target, { animate: true, duration: 0.5 });
        setTimeout(() => { autoPanning = false; }, 600);
      }
    }

    // If the rider drags the map themselves, drop into 'free' so we stop
    // fighting them. Notify the host so the UI pill flips too.
    map.on('dragstart', () => {
      if (autoPanning) return;
      if (followMode !== 'free') {
        followMode = 'free';
        postToHost({ type: 'follow-mode', mode: 'free' });
      }
    });

    function setMarkers(list) {
      const seen = new Set();
      list.forEach(m => {
        if (m == null || m.lat == null || m.lng == null) return;
        seen.add(m.id);
        liveData[m.id] = m;
        const existing = live[m.id];
        const popupHtml = buildPopupHtml(m);
        if (existing) {
          existing.setLatLng([m.lat, m.lng]);
          existing.setIcon(buildIcon(m));
          // setPopupContent only works if popup is already bound; safe path:
          if (existing.getPopup()) existing.setPopupContent(popupHtml);
          else existing.bindPopup(popupHtml, { offset: [0, -10] });
        } else {
          const mk = L.marker([m.lat, m.lng], { icon: buildIcon(m) });
          mk.bindPopup(popupHtml, { offset: [0, -10] });
          // Marker tap → notify host (so the member-list/popup overlay stays
          // in sync if anyone else cares). Leaflet's own popup pops up too.
          mk.on('click', () => { postToHost({ type: 'marker-tap', id: m.id }); });
          mk.addTo(map);
          live[m.id] = mk;
        }
      });
      // Remove markers that disappeared from the latest snapshot.
      Object.keys(live).forEach(id => {
        if (!seen.has(id)) {
          try { map.removeLayer(live[id]); } catch(e) {}
          delete live[id];
          delete liveData[id];
        }
      });
      applyFollow();
    }

    function panToId(id) {
      const m = liveData[id];
      if (!m || m.lat == null || m.lng == null) return;
      autoPanning = true;
      map.flyTo([m.lat, m.lng], Math.max(map.getZoom(), 13), { duration: 0.6 });
      // Open popup once the fly settles so the pin and popup land together.
      setTimeout(() => {
        autoPanning = false;
        try { if (live[id]) live[id].openPopup(); } catch(e) {}
      }, 700);
    }

    function handle(raw) {
      try {
        const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!d) return;
        if (d.type === 'markers') setMarkers(d.list || []);
        else if (d.type === 'follow') {
          const mode = d.mode === 'self' || d.mode === 'centroid' || d.mode === 'free' ? d.mode : 'free';
          followMode = mode;
          // Snap-pan immediately when the rider switches to a follow mode
          // rather than waiting for the next marker tick.
          if (mode !== 'free') applyFollow();
        }
        else if (d.type === 'pan-to' && d.id) panToId(d.id);
        // Back-compat: legacy single-marker callers (Plan screen etc).
        else if (d.type === 'live') setMarkers([{ id:'__legacy__', lat:d.lat, lng:d.lng, isSelf:true }]);
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
  followMode,
  panToMarkerId,
  onMarkerPress,
  onFollowModeChange,
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
  /** Camera follow strategy. Defaults to `'free'` so non-ride callers
   *  (Plan, Discover, Trip detail) keep their current behaviour. Live Ride
   *  passes `'self'` initially. */
  followMode?: FollowMode;
  /** Setting this to a marker id pans the camera to that marker and opens
   *  its popup. Treat as a one-shot — bump the value (or set then clear)
   *  to fire a fresh pan, otherwise we'd re-pan on every re-render. */
  panToMarkerId?: string | null;
  /** Fires when the rider taps a live marker. Receives the marker id. */
  onMarkerPress?: (id: string) => void;
  /** Fires when the WebView auto-flips follow mode (eg. rider drags the
   *  map). Lets the parent UI (toggle pill) stay in sync. */
  onFollowModeChange?: (mode: FollowMode) => void;
}) {
  // HTML only depends on points + dark + routeCoords (stable during Live Ride);
  // markers are pushed in via postMessage so we never re-render the whole map.
  const html = useMemo(() => buildHtml(points, dark, routeCoords), [points, dark, routeCoords]);
  const t = dark ? colors.dark : colors.light;
  const iframeRef = useRef<any>(null);
  const webViewRef = useRef<any>(null);
  const initialPushedRef = useRef(false);
  // Refs so the message-handler closures see the latest props without
  // re-binding (which would require re-rendering the whole WebView).
  const onMarkerPressRef = useRef(onMarkerPress);
  const onFollowModeChangeRef = useRef(onFollowModeChange);
  useEffect(() => { onMarkerPressRef.current = onMarkerPress; }, [onMarkerPress]);
  useEffect(() => { onFollowModeChangeRef.current = onFollowModeChange; }, [onFollowModeChange]);

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

  // Push the follow strategy any time the parent flips it. Cheap (a single
  // setState on the WebView side) so we don't bother debouncing.
  useEffect(() => {
    if (!followMode) return;
    pushToView({
      iframe: iframeRef.current,
      webView: webViewRef.current,
      payload: { type: 'follow', mode: followMode },
    });
  }, [followMode]);

  // One-shot pan: every time `panToMarkerId` becomes a non-null value, fly
  // to that marker. Caller is responsible for changing the value — useEffect
  // won't re-fire on identical references. We accept an optional `#nonce`
  // suffix on the id (e.g. `user-123#7`) so the caller can re-fire the pan
  // for the same rider by bumping the nonce. Anything before the `#` is
  // treated as the actual marker id when posting to the WebView.
  useEffect(() => {
    if (!panToMarkerId) return;
    const realId = panToMarkerId.split('#')[0];
    pushToView({
      iframe: iframeRef.current,
      webView: webViewRef.current,
      payload: { type: 'pan-to', id: realId },
    });
  }, [panToMarkerId]);

  // Push initial state once the map HTML has actually loaded — `useEffect`
  // alone fires before Leaflet has mounted on first render.
  const onLoaded = () => {
    initialPushedRef.current = true;
    if (effectiveMarkers.length) {
      pushToView({
        iframe: iframeRef.current,
        webView: webViewRef.current,
        payload: { type: 'markers', list: effectiveMarkers },
      });
    }
    // Replay follow mode after load — first-render effect fires before the
    // WebView is ready to receive messages, so the initial push gets dropped.
    if (followMode) {
      pushToView({
        iframe: iframeRef.current,
        webView: webViewRef.current,
        payload: { type: 'follow', mode: followMode },
      });
    }
  };

  // Handle messages coming back FROM the WebView: marker taps, auto-flips
  // to free-pan when the rider drags. Single dispatch keeps the API surface
  // thin even as the WebView starts emitting more events.
  const handleHostMessage = (raw: string) => {
    try {
      const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!d) return;
      if (d.type === 'marker-tap' && typeof d.id === 'string') {
        onMarkerPressRef.current?.(d.id);
      } else if (d.type === 'follow-mode' && (d.mode === 'self' || d.mode === 'centroid' || d.mode === 'free')) {
        onFollowModeChangeRef.current?.(d.mode);
      }
    } catch {}
  };

  // For web (iframe) we need to subscribe globally — there's no onMessage
  // prop. Origin check: srcDoc iframes have a `null` origin so we accept
  // messages whose source matches our iframe's contentWindow.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onWindowMessage = (e: MessageEvent) => {
      if (!iframeRef.current) return;
      if (e.source !== iframeRef.current.contentWindow) return;
      handleHostMessage(e.data);
    };
    window.addEventListener('message', onWindowMessage);
    return () => window.removeEventListener('message', onWindowMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        onMessage={(e) => handleHostMessage(e.nativeEvent?.data)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderWidth: 1, overflow: 'hidden' },
});
