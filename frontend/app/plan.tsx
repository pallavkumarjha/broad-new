import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { api } from '../src/lib/api';
import { colors, type, space, radius } from '../src/theme/tokens';
import { Eyebrow, Button, Rule, Meta } from '../src/components/ui';
import { TopoMap } from '../src/components/TopoMap';

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

export default function Plan() {
  const router = useRouter();
  const [name, setName] = useState('Weekend Run');
  const [start, setStart] = useState(PRESETS[0]);
  const [end, setEnd] = useState(PRESETS[2]);
  const [waypoints, setWaypoints] = useState<typeof PRESETS>([]);
  const [crewInput, setCrewInput] = useState('Rhea, Kabir');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickerFor, setPickerFor] = useState<'start' | 'end' | 'wp' | null>(null);

  const allPoints = useMemo(() => [start, ...waypoints, end], [start, end, waypoints]);

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

  const submit = async () => {
    setBusy(true);
    try {
      const crew = crewInput.split(',').map(s => s.trim()).filter(Boolean);
      const { data } = await api.post('/trips', {
        name, start, end, waypoints,
        distance_km: distance,
        elevation_m: Math.round(distance * 3.5),
        planned_date: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
        crew, notes, is_public: false,
      });
      router.replace(`/trip/${data.id}`);
    } catch (e: any) {
      alert(e?.response?.data?.detail || e.message);
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
            <TopoMap points={allPoints} width={360} height={220} />
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metric}><Meta>DISTANCE</Meta><Text style={[type.h2, { color: colors.light.ink, marginTop: 4 }]}>{distance}<Text style={type.meta}> KM</Text></Text></View>
            <View style={[styles.metric, { borderLeftWidth: 1, borderLeftColor: colors.light.rule, paddingLeft: space.md }]}>
              <Meta>ELEV ESTIMATE</Meta><Text style={[type.h2, { color: colors.light.ink, marginTop: 4 }]}>{Math.round(distance * 3.5)}<Text style={type.meta}> M</Text></Text>
            </View>
            <View style={[styles.metric, { borderLeftWidth: 1, borderLeftColor: colors.light.rule, paddingLeft: space.md }]}>
              <Meta>STOPS</Meta><Text style={[type.h2, { color: colors.light.ink, marginTop: 4 }]}>{waypoints.length + 2}</Text>
            </View>
          </View>
          <Rule />

          <View style={styles.section}>
            <Eyebrow>TRIP NAME</Eyebrow>
            <TextInput testID="plan-name-input" value={name} onChangeText={setName} style={styles.input} placeholderTextColor={colors.light.inkMuted} />
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
            <Eyebrow>CREW — comma separated names</Eyebrow>
            <TextInput testID="plan-crew-input" value={crewInput} onChangeText={setCrewInput} style={styles.input} />
          </View>

          <View style={styles.section}>
            <Eyebrow>PACKING NOTES</Eyebrow>
            <TextInput
              testID="plan-notes-input"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              placeholder="Rain liners, fuel at Mysuru, …"
              placeholderTextColor={colors.light.inkMuted}
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
            />
          </View>

          <View style={[styles.section, { paddingTop: space.xl }]}>
            <Button label="SAVE TRIP" onPress={submit} loading={busy} testID="plan-save-button" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {pickerFor && (
        <View style={styles.picker}>
          <View style={styles.pickerHead}>
            <Eyebrow>PICK A POINT</Eyebrow>
            <TouchableOpacity onPress={() => setPickerFor(null)} testID="plan-picker-close"><Feather name="x" size={20} color={colors.light.ink} /></TouchableOpacity>
          </View>
          <Rule />
          <ScrollView>
            {PRESETS.map((p, i) => (
              <TouchableOpacity key={i} testID={`plan-picker-option-${i}`} style={styles.pickerRow} onPress={() => {
                if (pickerFor === 'start') setStart(p);
                else if (pickerFor === 'end') setEnd(p);
                else setWaypoints([...waypoints, p]);
                setPickerFor(null);
              }}>
                <Text style={[type.body, { color: colors.light.ink }]}>{p.name}</Text>
                <Meta>{p.lat.toFixed(2)}°N {p.lng.toFixed(2)}°E</Meta>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
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
    paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.light.rule,
  },
});
