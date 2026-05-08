import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth, RiderType } from '../../src/contexts/AuthContext';
import { api } from '../../src/lib/api';
import { queryClient } from '../../src/lib/queryClient';
import { colors, type as t, space, radius, fonts } from '../../src/theme/tokens';
import { Eyebrow, Rule, Button, Meta } from '../../src/components/ui';

// ---------- Selectable option catalogues ---------------------------------

const RIDER_TYPES: { value: RiderType; label: string; hint: string }[] = [
  { value: 'solo',      label: 'Solo',      hint: 'Mostly ride alone' },
  { value: 'crew',      label: 'Crew',      hint: 'Group rides' },
  { value: 'commuter',  label: 'Commuter',  hint: 'Daily city use' },
  { value: 'mixed',     label: 'Mixed',     hint: 'A bit of everything' },
];

const MAKES = [
  'Royal Enfield', 'Bajaj', 'KTM', 'Honda', 'Yamaha',
  'Suzuki', 'TVS', 'Hero', 'Kawasaki', 'BMW',
  'Triumph', 'Harley-Davidson', 'Ducati', 'Jawa', 'Other',
];

const MODEL_SUGGESTIONS: Record<string, string[]> = {
  'Royal Enfield':   ['Himalayan 450', 'Classic 350', 'Hunter 350', 'Meteor 350', 'Interceptor 650', 'Continental GT 650'],
  'Bajaj':           ['Pulsar NS200', 'Pulsar 220F', 'Dominar 400', 'Avenger 220'],
  'KTM':             ['Duke 200', 'Duke 390', 'RC 390', 'Adventure 390'],
  'Honda':           ['CB350', 'CB350RS', 'Hornet 2.0', 'CBR250R'],
  'Yamaha':          ['MT-15', 'R15 V4', 'FZ-X', 'FZ-S'],
  'Suzuki':          ['Gixxer 250', 'V-Strom SX', 'Hayabusa'],
  'TVS':             ['Apache RTR 200', 'Apache RR 310', 'Ronin'],
  'Hero':            ['Xpulse 200', 'Karizma XMR', 'Xtreme 160R'],
  'Kawasaki':        ['Ninja 300', 'Z900', 'Versys 650'],
  'BMW':             ['G 310 R', 'G 310 GS', 'F 850 GS', 'R 1250 GS'],
  'Triumph':         ['Speed 400', 'Scrambler 400X', 'Tiger 900'],
  'Harley-Davidson': ['X440', 'Street 750', 'Sportster S'],
  'Ducati':          ['Scrambler', 'Monster', 'Multistrada'],
  'Jawa':            ['42', 'Perak', 'Forty Two'],
};

const RELATIONS = ['Spouse', 'Parent', 'Sibling', 'Child', 'Friend', 'Crew', 'Doctor', 'Other'];

const ODO_STEPS = [100, 500, 1000, 5000];

// ---------- Chip primitive ------------------------------------------------

function Chip({ label, active, onPress, testID }: { label: string; active?: boolean; onPress?: () => void; testID?: string }) {
  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        chipStyles.base,
        active ? chipStyles.active : chipStyles.idle,
      ]}
    >
      <Text style={[t.meta, { color: active ? colors.light.bg : colors.light.ink }]}>
        {label.toUpperCase()}
      </Text>
    </TouchableOpacity>
  );
}

const chipStyles = StyleSheet.create({
  base: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: radius.tiny,
    marginRight: space.xs, marginBottom: space.xs,
  },
  idle:   { borderWidth: 1, borderColor: colors.light.rule, backgroundColor: colors.light.bg },
  active: { backgroundColor: colors.light.ink, borderWidth: 1, borderColor: colors.light.ink },
});

function ChipGroup({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: space.sm }}>{children}</View>;
}

// ---------- Screen --------------------------------------------------------

export default function ProfileEdit() {
  const { user, refresh } = useAuth();
  const router = useRouter();

  const [name, setName] = useState(user?.name || '');
  const [riderType, setRiderType] = useState<RiderType | null>(user?.rider_type || null);
  const [bike, setBike] = useState({
    make: user?.bike?.make || '',
    model: user?.bike?.model || '',
    registration: user?.bike?.registration || '',
    odometer_km: user?.bike?.odometer_km || 0,
  });
  const [contacts, setContacts] = useState(
    user?.emergency_contacts?.length
      ? user.emergency_contacts
      : [{ name: '', phone: '', relation: '' }]
  );
  const [busy, setBusy] = useState(false);

  const isOtherMake = bike.make === 'Other' || (bike.make !== '' && !MAKES.includes(bike.make));
  const knownMakeSelected = bike.make && MAKES.includes(bike.make) && bike.make !== 'Other';
  const modelSuggestions = useMemo(
    () => (knownMakeSelected ? (MODEL_SUGGESTIONS[bike.make] || []) : []),
    [bike.make, knownMakeSelected]
  );

  const updateContact = (i: number, patch: any) => {
    setContacts(contacts.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };
  const addContact = () => setContacts([...contacts, { name: '', phone: '', relation: '' }]);
  const removeContact = (i: number) => setContacts(contacts.filter((_, idx) => idx !== i));

  const bumpOdo = (delta: number) => setBike(b => ({ ...b, odometer_km: Math.max(0, (b.odometer_km || 0) + delta) }));

  const submit = async () => {
    setBusy(true);
    try {
      const cleanContacts = contacts.filter(c => c.name.trim() && c.phone.trim());
      await api.patch('/users/me', {
        name: name.trim() || 'Rider',
        rider_type: riderType,
        bike: { ...bike, odometer_km: Number(bike.odometer_km) || 0 },
        emergency_contacts: cleanContacts,
      });
      await refresh();
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e?.response?.data?.detail || e?.message || '');
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.container} testID="profile-edit-screen">
      {/* Editorial header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="edit-back-btn" hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.light.ink} />
        </TouchableOpacity>
        <Eyebrow>EDIT PROFILE</Eyebrow>
        <View style={{ width: 22 }} />
      </View>
      <Rule />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">

          {/* IDENTITY ----------------------------------------------------- */}
          <View style={styles.section}>
            <Eyebrow>RIDER NAME</Eyebrow>
            <TextInput
              testID="edit-name-input"
              value={name}
              onChangeText={setName}
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={colors.light.inkMuted}
            />
          </View>

          {/* RIDER TYPE — selectable -------------------------------------- */}
          <View style={styles.section}>
            <Eyebrow>RIDER TYPE</Eyebrow>
            <Meta style={{ marginTop: 4, color: colors.light.inkMuted }}>HOW DO YOU MOSTLY RIDE?</Meta>
            <ChipGroup>
              {RIDER_TYPES.map(rt => (
                <Chip
                  key={rt.value}
                  testID={`edit-ridertype-${rt.value}`}
                  label={rt.label}
                  active={riderType === rt.value}
                  onPress={() => setRiderType(riderType === rt.value ? null : rt.value)}
                />
              ))}
            </ChipGroup>
            {riderType && (
              <Meta style={{ marginTop: space.xs }}>
                {RIDER_TYPES.find(r => r.value === riderType)?.hint.toUpperCase()}
              </Meta>
            )}
          </View>

          {/* BIKE — make chips, model suggestions ------------------------- */}
          <View style={styles.section}>
            <Eyebrow>THE BIKE — MAKE</Eyebrow>
            <ChipGroup>
              {MAKES.map(m => (
                <Chip
                  key={m}
                  testID={`edit-make-${m.toLowerCase().replace(/\W+/g, '-')}`}
                  label={m}
                  active={bike.make === m || (m === 'Other' && isOtherMake && bike.make !== '')}
                  onPress={() => {
                    if (m === 'Other') { setBike({ ...bike, make: 'Other', model: '' }); }
                    else { setBike({ ...bike, make: m, model: '' }); }
                  }}
                />
              ))}
            </ChipGroup>

            {isOtherMake && (
              <View style={{ marginTop: space.md }}>
                <Eyebrow>CUSTOM MAKE</Eyebrow>
                <TextInput
                  testID="edit-bike-make-custom"
                  value={bike.make === 'Other' ? '' : bike.make}
                  onChangeText={text => setBike({ ...bike, make: text })}
                  style={styles.input}
                  placeholder="Type make"
                  placeholderTextColor={colors.light.inkMuted}
                />
              </View>
            )}
          </View>

          {bike.make !== '' && (
            <View style={styles.section}>
              <Eyebrow>MODEL</Eyebrow>
              {modelSuggestions.length > 0 && (
                <ChipGroup>
                  {modelSuggestions.map(mod => (
                    <Chip
                      key={mod}
                      testID={`edit-model-${mod.toLowerCase().replace(/\W+/g, '-')}`}
                      label={mod}
                      active={bike.model === mod}
                      onPress={() => setBike({ ...bike, model: bike.model === mod ? '' : mod })}
                    />
                  ))}
                </ChipGroup>
              )}
              <TextInput
                testID="edit-bike-model"
                value={bike.model}
                onChangeText={text => setBike({ ...bike, model: text })}
                style={[styles.input, { marginTop: modelSuggestions.length > 0 ? space.sm : space.xs }]}
                placeholder={modelSuggestions.length > 0 ? "Or type your model" : "Your model"}
                placeholderTextColor={colors.light.inkMuted}
              />
            </View>
          )}

          {/* REGISTRATION ------------------------------------------------- */}
          <View style={styles.section}>
            <Eyebrow>REGISTRATION</Eyebrow>
            <TextInput
              testID="edit-bike-reg"
              value={bike.registration}
              onChangeText={text => setBike({ ...bike, registration: text.toUpperCase() })}
              autoCapitalize="characters"
              style={[styles.input, { fontFamily: fonts.mono, letterSpacing: 1 }]}
              placeholder="DL 4S AB 2024"
              placeholderTextColor={colors.light.inkMuted}
            />
          </View>

          {/* ODOMETER + steppers ----------------------------------------- */}
          <View style={styles.section}>
            <Eyebrow>ODOMETER</Eyebrow>
            <View style={styles.odoRow}>
              <TextInput
                testID="edit-bike-odo"
                value={String(bike.odometer_km || '')}
                onChangeText={text => setBike({ ...bike, odometer_km: Number(text.replace(/\D/g, '')) || 0 })}
                keyboardType="number-pad"
                style={[styles.input, { flex: 1, fontFamily: fonts.mono, fontSize: 20, letterSpacing: 0.5 }]}
                placeholder="0"
                placeholderTextColor={colors.light.inkMuted}
              />
              <Text style={[t.meta, { color: colors.light.inkMuted, marginLeft: space.md }]}>KM</Text>
            </View>
            <ChipGroup>
              {ODO_STEPS.map(step => (
                <Chip
                  key={step}
                  testID={`edit-odo-add-${step}`}
                  label={`+${step.toLocaleString()}`}
                  onPress={() => bumpOdo(step)}
                />
              ))}
            </ChipGroup>
          </View>

          {/* EMERGENCY CONTACTS ------------------------------------------- */}
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Eyebrow>EMERGENCY CONTACTS · {contacts.length}</Eyebrow>
              <TouchableOpacity onPress={addContact} testID="edit-add-contact" hitSlop={8}>
                <Text style={[t.meta, { color: colors.light.amber }]}>+ ADD</Text>
              </TouchableOpacity>
            </View>

            {contacts.map((c, i) => (
              <View key={i} style={styles.contactBlock}>
                <View style={styles.contactBlockHead}>
                  <Meta>CONTACT {i + 1}</Meta>
                  {contacts.length > 1 && (
                    <TouchableOpacity onPress={() => removeContact(i)} testID={`edit-remove-contact-${i}`} hitSlop={8}>
                      <Feather name="x" size={16} color={colors.light.inkMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                <Eyebrow style={{ marginTop: space.sm }}>NAME</Eyebrow>
                <TextInput
                  testID={`edit-contact-name-${i}`}
                  value={c.name}
                  onChangeText={text => updateContact(i, { name: text })}
                  style={styles.input}
                  placeholder="Priya Mehra"
                  placeholderTextColor={colors.light.inkMuted}
                />

                <Eyebrow style={{ marginTop: space.md }}>PHONE</Eyebrow>
                <TextInput
                  testID={`edit-contact-phone-${i}`}
                  value={c.phone}
                  onChangeText={text => updateContact(i, { phone: text })}
                  keyboardType="phone-pad"
                  style={[styles.input, { fontFamily: fonts.mono, letterSpacing: 0.5 }]}
                  placeholder="+91 98765 43210"
                  placeholderTextColor={colors.light.inkMuted}
                />

                <Eyebrow style={{ marginTop: space.md }}>RELATION</Eyebrow>
                <ChipGroup>
                  {RELATIONS.map(rel => (
                    <Chip
                      key={rel}
                      testID={`edit-contact-rel-${i}-${rel.toLowerCase()}`}
                      label={rel}
                      active={(c.relation || '').toLowerCase() === rel.toLowerCase()}
                      onPress={() => updateContact(i, { relation: c.relation === rel ? '' : rel })}
                    />
                  ))}
                </ChipGroup>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* STICKY SAVE BAR */}
      <View style={styles.cta}>
        <View style={{ flex: 1 }}>
          <Button label="CANCEL" variant="ghost" onPress={() => router.back()} testID="edit-cancel-btn" />
        </View>
        <View style={{ width: space.sm }} />
        <View style={{ flex: 2 }}>
          <Button label="SAVE" onPress={submit} loading={busy} testID="edit-save-btn" />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  header: { paddingHorizontal: space.lg, paddingVertical: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { paddingHorizontal: space.lg, paddingTop: space.xl },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: {
    borderWidth: 1, borderColor: colors.light.rule, marginTop: space.xs,
    paddingHorizontal: space.md, paddingVertical: space.md,
    fontFamily: fonts.serif, fontSize: 16, color: colors.light.ink,
    backgroundColor: '#FFFFFF', borderRadius: radius.tiny,
  },
  odoRow: { flexDirection: 'row', alignItems: 'center' },
  contactBlock: {
    marginTop: space.md, padding: space.lg,
    borderWidth: 1, borderColor: colors.light.rule, borderRadius: radius.tiny,
    backgroundColor: colors.light.surface,
  },
  contactBlockHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cta: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    padding: space.lg,
    backgroundColor: colors.light.bg,
    borderTopWidth: 1, borderTopColor: colors.light.rule,
  },
});
