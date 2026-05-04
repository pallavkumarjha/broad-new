import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { api } from '../src/lib/api';
import { queryClient } from '../src/lib/queryClient';
import { colors, type, space, radius } from '../src/theme/tokens';
import { Eyebrow, Button, Rule, Meta, ErrorStrip } from '../src/components/ui';
import { MapView } from '../src/components/MapView';

// Curated destination presets for India
const PRESETS = [
  { name: 'Bangalore', lat: 12.9716, lng: 77.5946 },
  { name: 'Mysuru', lat: 12.2958, lng: 76.6394 },
  { name: 'Coorg / Madikeri', lat: 12.4244, lng: 75.7382 },
  { name: 'Manali', lat: 32.2396, lng: 77.1887 },
  { name: 'Leh', lat: 34.1526, lng: 77.5771 },
  { name: 'Spiti — Kaza', lat: 32.2257, lng: 78.0716 },
  { name: 'Goa', lat: 15.2993, lng: 74.1240 },
  { name: 'Pondicherry', lat: 11.9416, lng: 79.8083 },
  { name: 'Shimla', lat: 31.1048, lng: 77.1734 },
];

import { toIsoDate } from '../src/lib/dates';

const DAY_MS = 86400000;

// `startOfDay` here truncates an arbitrary date to local midnight (not just
// today) — kept local because the shared lib only exposes `startOfToday`.
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// Picker-screen-specific UI strings — kept local because they're only used here.
const formatPlannedDate = (d: Date) => d.toLocaleDateString('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const relativeDateLabel = (d: Date) => {
  const today = startOfDay(new Date());
  const diff = Math.round((startOfDay(d).getTime() - today.getTime()) / DAY_MS);
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'TOMORROW';
  if (diff > 1) return `IN ${diff} DAYS`;
  return `${Math.abs(diff)} DAYS AGO`;
};

export default function Plan() {
  const router = useRouter();
  const [name, setName] = useState('Weekend Run');
  const [start, setStart] = useState(PRESETS[0]);
  const [end, setEnd] = useState(PRESETS[2]);
  const [plannedDate, setPlannedDate] = useState(() => startOfDay(new Date(Date.now() + DAY_MS * 3)));
  const [waypoints, setWaypoints] = useState<typeof PRESETS>([]);
  const [crewList, setCrewList] = useState<string[]>([]);
  const [crewIdsList, setCrewIdsList] = useState<string[]>([]); // user IDs for push notifications
  const [crewPickerOpen, setCrewPickerOpen] = useState(false);
  const [crewQuery, setCrewQuery] = useState('');
  const [crewResults, setCrewResults] = useState([]);
  const [crewSearching, setCrewSearching] = useState(false);
  const crewTimer = useRef<any>(null);
  const [notes, setNotes] = useState('');
  const [days, setDays] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [focused, setFocused] = useState<'name' | 'notes' | 'description' | null>(null);
  // ---- Public trip ----
  const [isPublic, setIsPublic] = useState(false);
  const [maxRiders, setMaxRiders] = useState(8);
  const [description, setDescription] = useState('');
  const [pickerFor, setPickerFor] = useState<'start' | 'end' | 'wp' | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<typeof PRESETS>(PRESETS);
  const [searching, setSearching] = useState(false);
  const [elevMax, setElevMax] = useState<number | null>(null);
  const [elevLoading, setElevLoading] = useState(false);
  const elevTimer = useRef<any>(null);
  const searchTimer = useRef<any>(null);

  const allPoints = useMemo(() => [start, ...waypoints, end], [start, end, waypoints]);

  // M3 — spring the STOPS counter when waypoints change
  const stopsAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    stopsAnim.setValue(0.7);
    Animated.spring(stopsAnim, {
      toValue: 1,
      friction: 4,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [waypoints.length, stopsAnim]);

  // M10 — picker translateY spring
  const pickerAnim = useRef(new Animated.Value(0)).current;
  const crewPickerAnim = useRef(new Animated.Value(0)).current;
  const datePickerAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(pickerAnim, {
      toValue: pickerFor ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pickerFor, pickerAnim]);
  useEffect(() => {
    Animated.timing(crewPickerAnim, {
      toValue: crewPickerOpen ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [crewPickerOpen, crewPickerAnim]);
  useEffect(() => {
    Animated.timing(datePickerAnim, {
      toValue: datePickerOpen ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [datePickerAnim, datePickerOpen]);

  // Debounced Nominatim search
  useEffect(() => {
    if (!pickerFor) return;
    if (!query.trim()) { setResults(PRESETS); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get('/places/search', { params: { q: query.trim() } });
        const mapped = (data.results || []).map((r: any) => ({ name: r.name, lat: r.lat, lng: r.lng }));
        setResults(mapped.length ? mapped : []);
      } catch { setResults([]); } finally { setSearching(false); }
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, pickerFor]);

  // Debounced real elevation lookup
  useEffect(() => {
    if (elevTimer.current) clearTimeout(elevTimer.current);
    elevTimer.current = setTimeout(async () => {
      setElevLoading(true);
      try {
        const { data } = await api.post('/places/elevation', { points: allPoints });
        setElevMax(data.max_m || 0);
      } catch { setElevMax(null); } finally { setElevLoading(false); }
    }, 600);
    return () => { if (elevTimer.current) clearTimeout(elevTimer.current); };
  }, [allPoints]);

  const distance = useMemo(() => {
    let total = 0;
    for (let i = 1; i < allPoints.length; i++) {
      const a = allPoints[i - 1], b = allPoints[i];
      const R = 6371;
      const dLat = ((b.lat - a.lat) * Math.PI) / 180;
      const dLng = ((b.lng - a.lng) * Math.PI) / 180;
      const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      total += 2 * R * Math.asin(Math.sqrt(x));
    }
    return Math.round(total * 1.25); // road factor
  }, [allPoints]);

  const dateOptions = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: 60 }, (_, i) => {
      const date = new Date(today.getTime() + i * DAY_MS);
      return {
        key: toIsoDate(date),
        date,
        label: formatPlannedDate(date),
        relative: relativeDateLabel(date),
      };
    });
  }, []);

  // Debounced rider search
  useEffect(() => {
    if (!crewPickerOpen) return;
    if (!crewQuery.trim() || crewQuery.trim().length < 2) { setCrewResults([]); return; }
    if (crewTimer.current) clearTimeout(crewTimer.current);
    crewTimer.current = setTimeout(async () => {
      setCrewSearching(true);
      try {
        const { data } = await api.get('/users/search', { params: { q: crewQuery.trim() } });
        setCrewResults(data.results || []);
      } catch { setCrewResults([]); } finally { setCrewSearching(false); }
    }, 300);
    return () => { if (crewTimer.current) clearTimeout(crewTimer.current); };
  }, [crewQuery, crewPickerOpen]);

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const { data } = await api.post('/trips', {
        name, start, end, waypoints,
        distance_km: distance,
        elevation_m: elevMax ?? Math.round(distance * 3.5),
        planned_date: toIsoDate(plannedDate),
        crew: crewList,
        crew_ids: crewIdsList,
        notes,
        is_public: isPublic,
        max_riders: maxRiders,
        description: isPublic ? description.trim() : '',
        city: isPublic ? (start?.name?.split(',')[0]?.trim() || '') : '',
      });
      // New trip just landed — invalidate list caches so Home/Trips show it.
      queryClient.invalidateQueries({ queryKey: ['trips', 'mine'] });
      queryClient.invalidateQueries({ queryKey: ['trips', 'discover'] });
      router.replace(`/trip/${data.id}`);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || e.message || 'Could not save trip');
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.container} testID="plan-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="plan-back-btn"><Feather name="arrow-left" size={22} color={colors.light.ink} /></TouchableOpacity>
        <Eyebrow>PLOT THE ROUTE</Eyebrow>
        <View style={{ width: 22 }} />
      </View>
      <Rule />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
          <View style={{ alignItems: 'center', paddingVertical: space.md, backgroundColor: colors.light.surface }}>
            <MapView points={allPoints} width={360} height={220} />
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metric}><Meta>DISTANCE</Meta><Text style={[type.h2, { color: colors.light.ink, marginTop: 4 }]}>{distance}<Text style={type.meta}> KM</Text></Text></View>
            <View style={[styles.metric, { borderLeftWidth: 1, borderLeftColor: colors.light.rule, paddingLeft: space.md }]}>
              <Meta>HIGH POINT {elevLoading ? '· …' : ''}</Meta>
              <Text style={[type.h2, { color: colors.light.ink, marginTop: 4 }]}>{elevMax ?? '—'}<Text style={type.meta}> M</Text></Text>
            </View>
            <View style={[styles.metric, { borderLeftWidth: 1, borderLeftColor: colors.light.rule, paddingLeft: space.md }]}>
              <Meta>STOPS</Meta>
              <Animated.Text testID="plan-stops-count" style={[type.h2, { color: colors.light.ink, marginTop: 4, transform: [{ scale: stopsAnim }] }]}>{waypoints.length + 2}</Animated.Text>
            </View>
          </View>
          <Rule />

          <View style={styles.section}>
            <Eyebrow>TRIP NAME</Eyebrow>
            <TextInput testID="plan-name-input" value={name} onChangeText={setName} onFocus={() => setFocused('name')} onBlur={() => setFocused(null)} style={[styles.input, focused === 'name' && styles.inputFocused]} placeholderTextColor={colors.light.inkMuted} />
          </View>

          <View style={styles.section}>
            <Eyebrow>DURATION — {days} DAY{days > 1 ? 'S' : ''}</Eyebrow>
            <View style={styles.daysRow}>
              <TouchableOpacity testID="plan-days-minus" onPress={() => setDays(Math.max(1, days - 1))} style={styles.daysBtn}>
                <Feather name="minus" size={16} color={colors.light.ink} />
              </TouchableOpacity>
              <Text style={[type.h1, { color: colors.light.ink, minWidth: 40, textAlign: 'center' }]}>{days}</Text>
              <TouchableOpacity testID="plan-days-plus" onPress={() => setDays(Math.min(14, days + 1))} style={styles.daysBtn}>
                <Feather name="plus" size={16} color={colors.light.ink} />
              </TouchableOpacity>
              <Meta style={{ marginLeft: space.md }}>{days === 1 ? 'DAY TRIP' : `MULTI-DAY · ~${Math.round(distance / days)} KM/DAY`}</Meta>
            </View>
          </View>

          <View style={styles.section}>
            <Eyebrow>START DATE</Eyebrow>
            <TouchableOpacity testID="plan-pick-date" onPress={() => setDatePickerOpen(true)} style={styles.pickRow} activeOpacity={0.85}>
              <View>
                <Text style={[type.bodyLg, { color: colors.light.ink }]}>{formatPlannedDate(plannedDate)}</Text>
                <Meta style={{ marginTop: 4, color: colors.light.amber }}>{relativeDateLabel(plannedDate)}</Meta>
              </View>
              <Meta>CHANGE</Meta>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Eyebrow>FROM</Eyebrow>
            <TouchableOpacity testID="plan-pick-start" onPress={() => setPickerFor('start')} style={styles.pickRow}>
              <Text style={[type.bodyLg, { color: colors.light.ink }]}>{start.name}</Text>
              <Meta>CHANGE</Meta>
            </TouchableOpacity>
            <Eyebrow style={{ marginTop: space.lg }}>TO</Eyebrow>
            <TouchableOpacity testID="plan-pick-end" onPress={() => setPickerFor('end')} style={styles.pickRow}>
              <Text style={[type.bodyLg, { color: colors.light.ink }]}>{end.name}</Text>
              <Meta>CHANGE</Meta>
            </TouchableOpacity>

            <View style={{ marginTop: space.lg }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Eyebrow>WAYPOINTS — {waypoints.length}</Eyebrow>
                <TouchableOpacity testID="plan-add-waypoint" onPress={() => setPickerFor('wp')}><Meta style={{ color: colors.light.amber }}>+ ADD</Meta></TouchableOpacity>
              </View>
              {waypoints.map((w, i) => (
                <View key={i} style={styles.pickRow}>
                  <Text style={[type.body, { color: colors.light.ink }]}>{i + 1}. {w.name}</Text>
                  <TouchableOpacity onPress={() => setWaypoints(waypoints.filter((_, j) => j !== i))}>
                    <Feather name="x" size={16} color={colors.light.inkMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Eyebrow>CREW — {crewList.length}</Eyebrow>
              <TouchableOpacity testID="plan-crew-add" onPress={() => { setCrewPickerOpen(true); setCrewQuery(''); setCrewResults([]); }}>
                <Meta style={{ color: colors.light.amber }}>+ ADD RIDER</Meta>
              </TouchableOpacity>
            </View>
            {crewList.length === 0 ? (
              <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.sm }]}>Ride alone, or tap ADD RIDER to invite someone.</Text>
            ) : crewList.map((c, i) => (
              <View key={i} style={styles.pickRow}>
                <Text style={[type.body, { color: colors.light.ink }]}>{i + 1}. {c}</Text>
                <TouchableOpacity onPress={() => setCrewList(crewList.filter((_, j) => j !== i))} testID={`plan-crew-remove-${i}`}>
                  <Feather name="x" size={16} color={colors.light.inkMuted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Eyebrow>OPEN INVITE — DISCOVER FEED</Eyebrow>
              <TouchableOpacity
                testID="plan-public-toggle"
                onPress={() => setIsPublic(v => !v)}
                style={[styles.toggle, isPublic && styles.toggleOn]}
                activeOpacity={0.85}
              >
                <View style={[styles.toggleKnob, isPublic && styles.toggleKnobOn]} />
              </TouchableOpacity>
            </View>
            <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.xs }]}>
              {isPublic
                ? "This ride will appear in Discover. Other riders can request to join — you decide who's in."
                : "Private — only the crew you've added will see it."}
            </Text>

            {isPublic && (
              <View testID="plan-public-fields" style={{ marginTop: space.lg }}>
                <Eyebrow>MAX RIDERS — INCLUDING YOU</Eyebrow>
                <View style={styles.daysRow}>
                  <TouchableOpacity
                    testID="plan-max-riders-minus"
                    onPress={() => setMaxRiders(Math.max(2, maxRiders - 1))}
                    style={styles.daysBtn}
                  >
                    <Feather name="minus" size={16} color={colors.light.ink} />
                  </TouchableOpacity>
                  <Text style={[type.h1, { color: colors.light.ink, minWidth: 40, textAlign: 'center' }]}>{maxRiders}</Text>
                  <TouchableOpacity
                    testID="plan-max-riders-plus"
                    onPress={() => setMaxRiders(Math.min(50, maxRiders + 1))}
                    style={styles.daysBtn}
                  >
                    <Feather name="plus" size={16} color={colors.light.ink} />
                  </TouchableOpacity>
                  <Meta style={{ marginLeft: space.md }}>
                    {1 + crewList.length} CONFIRMED · {Math.max(0, maxRiders - 1 - crewList.length)} SEATS LEFT
                  </Meta>
                </View>

                <View style={{ marginTop: space.lg }}>
                  <Eyebrow>WHAT'S THIS RIDE ABOUT</Eyebrow>
                  <TextInput
                    testID="plan-description-input"
                    value={description}
                    onChangeText={setDescription}
                    onFocus={() => setFocused('description')}
                    onBlur={() => setFocused(null)}
                    multiline
                    numberOfLines={3}
                    maxLength={500}
                    placeholder="The pitch — pace, terrain, who'd enjoy it, what to bring."
                    placeholderTextColor={colors.light.inkMuted}
                    style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }, focused === 'description' && styles.inputFocused]}
                  />
                  <Meta style={{ marginTop: 4, color: colors.light.inkMuted }}>{description.length}/500</Meta>
                </View>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Eyebrow>PACKING NOTES</Eyebrow>
            <TextInput
              testID="plan-notes-input"
              value={notes}
              onChangeText={setNotes}
              onFocus={() => setFocused('notes')}
              onBlur={() => setFocused(null)}
              multiline
              numberOfLines={3}
              placeholder="Rain liners, fuel at Mysuru, …"
              placeholderTextColor={colors.light.inkMuted}
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }, focused === 'notes' && styles.inputFocused]}
            />
          </View>

          <View style={[styles.section, { paddingTop: space.xl }]}>
            {err ? (
              <ErrorStrip testID="plan-error" title="COULD NOT SAVE" message={err} style={{ marginBottom: space.md }} />
            ) : null}
            <Button label="SAVE TRIP" onPress={submit} loading={busy} testID="plan-save-button" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {crewPickerOpen && (
        <Animated.View style={[styles.picker, {
          transform: [{ translateY: crewPickerAnim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }) }],
          opacity: crewPickerAnim,
        }]}>
          <View style={styles.pickerHead}>
            <Eyebrow>ADD RIDER — SEARCH OR TYPE NAME</Eyebrow>
            <TouchableOpacity onPress={() => { setCrewPickerOpen(false); setCrewQuery(''); }} testID="plan-crew-picker-close"><Feather name="x" size={20} color={colors.light.ink} /></TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
            <View style={styles.searchRow}>
              <Feather name="search" size={16} color={colors.light.inkMuted} />
              <TextInput
                testID="plan-crew-search"
                value={crewQuery}
                onChangeText={setCrewQuery}
                placeholder="Search by name…"
                placeholderTextColor={colors.light.inkMuted}
                style={styles.searchInput}
                autoFocus
              />
              {crewSearching && <ActivityIndicator size="small" color={colors.light.inkMuted} />}
            </View>
          </View>
          <Rule />
          <ScrollView keyboardShouldPersistTaps="handled">
            {crewQuery.trim().length >= 2 && crewResults.map((r: any, i: number) => (
              <TouchableOpacity key={r.id} testID={`plan-crew-result-${i}`} style={styles.pickerRow} onPress={() => {
                if (!crewList.includes(r.name)) {
                  setCrewList([...crewList, r.name]);
                  setCrewIdsList([...crewIdsList, r.id]); // track user ID for push notifications
                }
                setCrewPickerOpen(false); setCrewQuery('');
              }}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: colors.light.ink }]}>{r.name}</Text>
                  <Meta>REGISTERED RIDER · {r.email.toUpperCase()}</Meta>
                </View>
                <Meta style={{ color: colors.light.amber }}>ADD</Meta>
              </TouchableOpacity>
            ))}
            {crewQuery.trim().length >= 1 && !crewSearching && (
              <TouchableOpacity testID="plan-crew-add-custom" style={[styles.pickerRow, { borderTopWidth: 1, borderTopColor: colors.light.rule }]} onPress={() => {
                const name = crewQuery.trim();
                if (name && !crewList.includes(name)) setCrewList([...crewList, name]);
                setCrewPickerOpen(false); setCrewQuery('');
              }}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: colors.light.ink }]}>Add "{crewQuery.trim()}"</Text>
                  <Meta>NOT ON BROAD YET — ADD AS NAME ONLY</Meta>
                </View>
                <Feather name="plus" size={16} color={colors.light.ink} />
              </TouchableOpacity>
            )}
            {crewQuery.trim().length < 2 && (
              <View style={{ padding: space.lg }}>
                <Text style={[type.body, { color: colors.light.inkMuted }]}>Type at least 2 characters to search registered riders, or add a name for someone not on Broad yet.</Text>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      )}
      {datePickerOpen && (
        <Animated.View style={[styles.picker, {
          transform: [{ translateY: datePickerAnim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }) }],
          opacity: datePickerAnim,
        }]}>
          <View style={styles.pickerHead}>
            <Eyebrow>CHOOSE START DATE</Eyebrow>
            <TouchableOpacity onPress={() => setDatePickerOpen(false)} testID="plan-date-picker-close"><Feather name="x" size={20} color={colors.light.ink} /></TouchableOpacity>
          </View>
          <Rule />
          <ScrollView>
            {dateOptions.map((option, i) => {
              const selected = toIsoDate(plannedDate) === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  testID={`plan-date-option-${i}`}
                  style={styles.pickerRow}
                  activeOpacity={0.85}
                  onPress={() => {
                    setPlannedDate(option.date);
                    setDatePickerOpen(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[type.body, { color: colors.light.ink, fontFamily: selected ? 'Fraunces_500Medium' : 'Fraunces_400Regular' }]}>
                      {option.label}
                    </Text>
                    <Meta style={{ marginTop: 2, color: selected ? colors.light.amber : colors.light.inkMuted }}>
                      {option.relative}
                    </Meta>
                  </View>
                  {selected ? <Feather name="check" size={16} color={colors.light.amber} /> : <Meta>SET</Meta>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Animated.View>
      )}
      {pickerFor && (
        <Animated.View style={[styles.picker, {
          transform: [{ translateY: pickerAnim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }) }],
          opacity: pickerAnim,
        }]}>
          <View style={styles.pickerHead}>
            <Eyebrow>SEARCH ANY PLACE IN INDIA</Eyebrow>
            <TouchableOpacity onPress={() => { setPickerFor(null); setQuery(''); }} testID="plan-picker-close"><Feather name="x" size={20} color={colors.light.ink} /></TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
            <View style={styles.searchRow}>
              <Feather name="search" size={16} color={colors.light.inkMuted} />
              <TextInput
                testID="plan-picker-search"
                value={query}
                onChangeText={setQuery}
                placeholder="Hampi, Tawang, Munnar…"
                placeholderTextColor={colors.light.inkMuted}
                style={styles.searchInput}
                autoFocus
              />
              {searching && <ActivityIndicator size="small" color={colors.light.inkMuted} />}
            </View>
          </View>
          <Rule />
          <ScrollView keyboardShouldPersistTaps="handled">
            {results.length === 0 && !searching ? (
              <View style={{ padding: space.lg }}>
                <Text style={[type.body, { color: colors.light.inkMuted }]}>Nothing found. Try a nearby town.</Text>
              </View>
            ) : results.map((p, i) => (
              <TouchableOpacity key={i} testID={`plan-picker-option-${i}`} style={styles.pickerRow} onPress={() => {
                const point = { name: p.name, lat: p.lat, lng: p.lng };
                if (pickerFor === 'start') setStart(point);
                else if (pickerFor === 'end') setEnd(point);
                else setWaypoints([...waypoints, point]);
                setPickerFor(null);
                setQuery('');
              }}>
                <Text style={[type.body, { color: colors.light.ink }]} numberOfLines={1}>{p.name}</Text>
                <Meta>{p.lat.toFixed(2)}°N {p.lng.toFixed(2)}°E</Meta>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  header: { paddingHorizontal: space.lg, paddingVertical: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricsRow: { flexDirection: 'row', paddingHorizontal: space.lg, paddingVertical: space.lg, gap: space.lg, alignItems: 'center' },
  metric: { flex: 1 },
  section: { paddingHorizontal: space.lg, paddingTop: space.lg },
  input: {
    borderWidth: 1, borderColor: colors.light.rule, marginTop: space.xs,
    paddingHorizontal: space.md, paddingVertical: space.md,
    fontFamily: 'Fraunces_400Regular', fontSize: 16, color: colors.light.ink,
    backgroundColor: '#FFFFFF', borderRadius: radius.tiny,
  },
  inputFocused: { borderColor: colors.light.amber, borderWidth: 1.5 },
  pickRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.light.rule,
  },
  picker: {
    position: 'absolute', left: 0, right: 0, bottom: 0, top: '30%',
    backgroundColor: colors.light.bg, borderTopWidth: 1, borderTopColor: colors.light.ink,
  },
  pickerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: space.lg },
  pickerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.light.rule, gap: 12,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: colors.light.rule, borderRadius: radius.tiny,
    paddingHorizontal: space.md, backgroundColor: '#FFFFFF',
  },
  searchInput: {
    flex: 1, paddingVertical: space.md,
    fontFamily: 'Fraunces_400Regular', fontSize: 16, color: colors.light.ink,
  },
  daysRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.sm, gap: 12 },
  daysBtn: { borderWidth: 1, borderColor: colors.light.ink, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.tiny },
  toggle: {
    width: 44, height: 26, borderRadius: 13,
    borderWidth: 1, borderColor: colors.light.rule,
    backgroundColor: colors.light.surface,
    justifyContent: 'center', paddingHorizontal: 2,
  },
  toggleOn: { backgroundColor: colors.light.amber, borderColor: colors.light.amber },
  toggleKnob: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.light.ink,
  },
  toggleKnobOn: { backgroundColor: '#FFFFFF', alignSelf: 'flex-end' },
});
