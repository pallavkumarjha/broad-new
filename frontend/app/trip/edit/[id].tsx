import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { api } from '../../../src/lib/api';
import { queryClient } from '../../../src/lib/queryClient';
import { colors, type, space, radius } from '../../../src/theme/tokens';
import { Eyebrow, Button, Rule, Meta, ErrorStrip } from '../../../src/components/ui';

// ── Date helpers (mirrors plan.tsx) ──────────────────────────────────────────
const DAY_MS = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const toIsoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const formatPlannedDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const relativeDateLabel = (d: Date) => {
  const today = startOfDay(new Date());
  const diff = Math.round((startOfDay(d).getTime() - today.getTime()) / DAY_MS);
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'TOMORROW';
  if (diff > 1) return `IN ${diff} DAYS`;
  return `${Math.abs(diff)} DAYS AGO`;
};
/** Parse an ISO date string "YYYY-MM-DD" to a local-midnight Date. */
const parseIsoDate = (s: string): Date => {
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? startOfDay(new Date()) : d;
};

const invalidateTripCaches = () => {
  queryClient.invalidateQueries({ queryKey: ['trips', 'mine'] });
  queryClient.invalidateQueries({ queryKey: ['trips', 'discover'] });
};

export default function EditTrip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [trip, setTrip] = useState<any>(null);

  // Editable fields — seeded from loaded trip
  const [name, setName] = useState('');
  const [plannedDate, setPlannedDate] = useState<Date>(startOfDay(new Date()));
  const [notes, setNotes] = useState('');
  const [description, setDescription] = useState('');
  const [maxRiders, setMaxRiders] = useState(8);

  const [focused, setFocused] = useState<'name' | 'notes' | 'description' | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const datePickerAnim = useRef(new Animated.Value(0)).current;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await api.get(`/trips/${id}`);
        if (!active) return;
        setTrip(data);
        setName(data.name || '');
        setNotes(data.notes || '');
        setDescription(data.description || '');
        setMaxRiders(data.max_riders ?? 8);
        if (data.planned_date) setPlannedDate(parseIsoDate(data.planned_date));
      } catch {
        Alert.alert('Could not load trip');
        router.back();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id, router]));

  useEffect(() => {
    Animated.timing(datePickerAnim, {
      toValue: datePickerOpen ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [datePickerOpen, datePickerAnim]);

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

  const save = async () => {
    if (!name.trim()) { setErr('Trip name cannot be empty.'); return; }
    setErr(''); setBusy(true);
    try {
      await api.patch(`/trips/${id}`, {
        name: name.trim(),
        planned_date: toIsoDate(plannedDate),
        notes: notes.trim(),
        ...(trip?.is_public ? {
          description: description.trim(),
          max_riders: maxRiders,
        } : {}),
      });
      invalidateTripCaches();
      router.back();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || e?.message || 'Could not save changes');
    } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.light.ink} />
        </View>
      </SafeAreaView>
    );
  }

  const isPublic = trip?.is_public;
  const crewCount = (trip?.crew_ids?.length || 0) + 1; // crew + organiser

  return (
    <SafeAreaView style={styles.container} testID="edit-trip-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="edit-trip-back-btn">
          <Feather name="arrow-left" size={22} color={colors.light.ink} />
        </TouchableOpacity>
        <Eyebrow>EDIT TRIP</Eyebrow>
        <View style={{ width: 22 }} />
      </View>
      <Rule />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 180 }}>

          {/* Trip Name */}
          <View style={styles.section}>
            <Eyebrow>TRIP NAME</Eyebrow>
            <TextInput
              testID="edit-name-input"
              value={name}
              onChangeText={setName}
              onFocus={() => setFocused('name')}
              onBlur={() => setFocused(null)}
              style={[styles.input, focused === 'name' && styles.inputFocused]}
              placeholderTextColor={colors.light.inkMuted}
              placeholder="Name this ride"
            />
          </View>

          {/* Start Date */}
          <View style={styles.section}>
            <Eyebrow>START DATE</Eyebrow>
            <TouchableOpacity
              testID="edit-pick-date"
              onPress={() => setDatePickerOpen(true)}
              style={styles.pickRow}
              activeOpacity={0.85}
            >
              <View>
                <Text style={[type.bodyLg, { color: colors.light.ink }]}>{formatPlannedDate(plannedDate)}</Text>
                <Meta style={{ marginTop: 4, color: colors.light.amber }}>{relativeDateLabel(plannedDate)}</Meta>
              </View>
              <Meta>CHANGE</Meta>
            </TouchableOpacity>
          </View>

          {/* Packing Notes */}
          <View style={styles.section}>
            <Eyebrow>PACKING NOTES</Eyebrow>
            <TextInput
              testID="edit-notes-input"
              value={notes}
              onChangeText={setNotes}
              onFocus={() => setFocused('notes')}
              onBlur={() => setFocused(null)}
              multiline
              numberOfLines={3}
              placeholder="Rain liners, fuel stops, things to bring…"
              placeholderTextColor={colors.light.inkMuted}
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }, focused === 'notes' && styles.inputFocused]}
            />
          </View>

          {/* Public-trip fields */}
          {isPublic && (
            <>
              <View style={styles.section}>
                <Eyebrow>MAX RIDERS — INCLUDING YOU</Eyebrow>
                <View style={styles.daysRow}>
                  <TouchableOpacity
                    testID="edit-max-riders-minus"
                    onPress={() => setMaxRiders(Math.max(crewCount, maxRiders - 1))}
                    style={styles.daysBtn}
                  >
                    <Feather name="minus" size={16} color={colors.light.ink} />
                  </TouchableOpacity>
                  <Text style={[type.h1, { color: colors.light.ink, minWidth: 40, textAlign: 'center' }]}>{maxRiders}</Text>
                  <TouchableOpacity
                    testID="edit-max-riders-plus"
                    onPress={() => setMaxRiders(Math.min(50, maxRiders + 1))}
                    style={styles.daysBtn}
                  >
                    <Feather name="plus" size={16} color={colors.light.ink} />
                  </TouchableOpacity>
                  <Meta style={{ marginLeft: space.md }}>
                    {crewCount} CONFIRMED · {Math.max(0, maxRiders - crewCount)} SEATS LEFT
                  </Meta>
                </View>
              </View>

              <View style={styles.section}>
                <Eyebrow>WHAT'S THIS RIDE ABOUT</Eyebrow>
                <TextInput
                  testID="edit-description-input"
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
            </>
          )}

          <View style={[styles.section, { paddingTop: space.xl }]}>
            {err ? (
              <ErrorStrip testID="edit-error" title="COULD NOT SAVE" message={err} style={{ marginBottom: space.md }} />
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky save CTA */}
      <View style={styles.cta}>
        <Button label={busy ? 'SAVING…' : 'SAVE CHANGES'} onPress={save} loading={busy} testID="edit-save-btn" />
      </View>

      {/* Date picker sheet */}
      {datePickerOpen && (
        <Animated.View style={[styles.picker, {
          transform: [{ translateY: datePickerAnim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }) }],
          opacity: datePickerAnim,
        }]}>
          <View style={styles.pickerHead}>
            <Eyebrow>CHOOSE START DATE</Eyebrow>
            <TouchableOpacity onPress={() => setDatePickerOpen(false)} testID="edit-date-picker-close">
              <Feather name="x" size={20} color={colors.light.ink} />
            </TouchableOpacity>
          </View>
          <Rule />
          <ScrollView>
            {dateOptions.map((option, i) => {
              const selected = toIsoDate(plannedDate) === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  testID={`edit-date-option-${i}`}
                  style={styles.pickerRow}
                  activeOpacity={0.85}
                  onPress={() => { setPlannedDate(option.date); setDatePickerOpen(false); }}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  header: {
    paddingHorizontal: space.lg, paddingVertical: space.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
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
  daysRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.sm, gap: 12 },
  daysBtn: {
    borderWidth: 1, borderColor: colors.light.ink, width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center', borderRadius: radius.tiny,
  },
  cta: {
    position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg,
    backgroundColor: colors.light.bg, borderTopWidth: 1, borderTopColor: colors.light.rule,
  },
  picker: {
    position: 'absolute', left: 0, right: 0, bottom: 0, top: '30%',
    backgroundColor: colors.light.bg, borderTopWidth: 1, borderTopColor: colors.light.ink,
  },
  pickerHead: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: space.lg,
  },
  pickerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: space.lg, paddingVertical: space.md,
    borderBottomWidth: 1, borderBottomColor: colors.light.rule, gap: 12,
  },
});
