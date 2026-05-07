import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Platform, Alert, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { colors, type, space, radius, fonts } from '../src/theme/tokens';
import { Eyebrow, Meta, Rule, Button } from '../src/components/ui';

// ─────────────────────────────────────────────────────────
// Storage keys
// ─────────────────────────────────────────────────────────
// Note: an earlier version of this screen also supported attaching photos
// and PDFs and persisted them under broad_glovebox_<doc>_attach_v1 plus a
// glovebox/ subdirectory in documentDirectory. The attachment pipeline was
// brittle on Android (legacy expo-file-system kept tripping over dev-client
// version drift), and the value vs maintenance cost wasn't there — the screen
// is now text-only. Existing attachment SecureStore entries and on-disk files
// from older app versions are intentionally left in place so a downgrade
// would still find them; they consume a few KB each and aren't read here.
const KEYS = {
  rc:        'broad_glovebox_rc_v1',
  insurance: 'broad_glovebox_insurance_v1',
  dl:        'broad_glovebox_dl_v1',
  medical:   'broad_glovebox_medical_v1',
} as const;

type DocKey = keyof typeof KEYS;

// ─────────────────────────────────────────────────────────
// Document text schemas
// ─────────────────────────────────────────────────────────
type RCDoc        = { reg_number: string; chassis: string; engine: string; owner: string; valid_until: string; notes: string };
type InsuranceDoc = { policy_number: string; insurer: string; valid_until: string; emergency_phone: string; notes: string };
type DLDoc        = { dl_number: string; valid_until: string; vehicle_class: string; notes: string };
type MedicalDoc   = { blood_group: string; allergies: string; conditions: string; notes: string };

type AllDocs = { rc: RCDoc; insurance: InsuranceDoc; dl: DLDoc; medical: MedicalDoc };

const EMPTY_DOCS: AllDocs = {
  rc:        { reg_number: '', chassis: '', engine: '', owner: '', valid_until: '', notes: '' },
  insurance: { policy_number: '', insurer: '', valid_until: '', emergency_phone: '', notes: '' },
  dl:        { dl_number: '', valid_until: '', vehicle_class: '', notes: '' },
  medical:   { blood_group: '', allergies: '', conditions: '', notes: '' },
};

// ─────────────────────────────────────────────────────────
// Field definitions
// ─────────────────────────────────────────────────────────
const FIELDS: Record<DocKey, Array<{ key: string; label: string; placeholder: string; mono?: boolean }>> = {
  rc: [
    { key: 'reg_number',  label: 'REGISTRATION NUMBER', placeholder: 'KA-01-AB-2024', mono: true },
    { key: 'chassis',     label: 'CHASSIS NUMBER',       placeholder: 'ME3TB942…',     mono: true },
    { key: 'engine',      label: 'ENGINE NUMBER',        placeholder: 'TB94E…',        mono: true },
    { key: 'owner',       label: 'REGISTERED OWNER',     placeholder: 'Full name as on RC' },
    { key: 'valid_until', label: 'VALID UNTIL',          placeholder: '31 Dec 2034',   mono: true },
    { key: 'notes',       label: 'NOTES',                placeholder: 'Hypothecation, RTO remarks…' },
  ],
  insurance: [
    { key: 'policy_number',   label: 'POLICY NUMBER',    placeholder: '2311/123456789', mono: true },
    { key: 'insurer',         label: 'INSURER',          placeholder: 'HDFC Ergo / ICICI Lombard…' },
    { key: 'valid_until',     label: 'VALID UNTIL',      placeholder: '31 Dec 2025',    mono: true },
    { key: 'emergency_phone', label: 'INSURER HELPLINE', placeholder: '1800-xxx-xxxx',  mono: true },
    { key: 'notes',           label: 'NOTES',            placeholder: 'IDV, add-on covers…' },
  ],
  dl: [
    { key: 'dl_number',     label: 'DL NUMBER',     placeholder: 'KA0120001234567', mono: true },
    { key: 'valid_until',   label: 'VALID UNTIL',   placeholder: '31 Dec 2043',     mono: true },
    { key: 'vehicle_class', label: 'VEHICLE CLASS', placeholder: 'MCWG, LMV…',     mono: true },
    { key: 'notes',         label: 'NOTES',         placeholder: 'Badge, endorsements…' },
  ],
  medical: [
    { key: 'blood_group', label: 'BLOOD GROUP',        placeholder: 'B+',                     mono: true },
    { key: 'allergies',   label: 'ALLERGIES',          placeholder: 'Penicillin, NSAIDs…' },
    { key: 'conditions',  label: 'MEDICAL CONDITIONS', placeholder: 'Hypertension, diabetes…' },
    { key: 'notes',       label: 'EMERGENCY NOTES',    placeholder: 'Info for first responders' },
  ],
};

const DOC_META: Record<DocKey, { title: string; icon: keyof typeof Feather.glyphMap; peek: (d: any) => string }> = {
  rc:        { title: 'RC Book',         icon: 'truck',       peek: (d) => d.reg_number    || 'Tap to add' },
  insurance: { title: 'Insurance',       icon: 'shield',      peek: (d) => d.policy_number || 'Tap to add' },
  dl:        { title: 'Driving Licence', icon: 'credit-card', peek: (d) => d.dl_number     || 'Tap to add' },
  medical:   { title: 'Medical Info',    icon: 'heart',       peek: (d) => d.blood_group ? `Blood: ${d.blood_group}` : 'Tap to add' },
};

// ─────────────────────────────────────────────────────────
// Secure storage helpers (web → localStorage)
// ─────────────────────────────────────────────────────────
async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') { try { return localStorage.getItem(key); } catch { return null; } }
  return SecureStore.getItemAsync(key);
}
async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') { try { localStorage.setItem(key, value); } catch {} return; }
  return SecureStore.setItemAsync(key, value);
}

// ─────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────
type ScreenState = 'locked' | 'unlocking' | 'unlocked';

export default function Glovebox() {
  const router = useRouter();

  const [screen, setScreen] = useState<ScreenState>('locked');
  const [docs, setDocs]     = useState<AllDocs>(EMPTY_DOCS);
  const [editing, setEditing] = useState<DocKey | null>(null);
  const [draft, setDraft]     = useState<Record<string, string>>({});
  const [saving, setSaving]   = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Face ID / Fingerprint');

  // Re-lock on every navigation away
  useFocusEffect(
    useCallback(() => {
      setScreen('locked');
      setEditing(null);
      setDocs(EMPTY_DOCS);
      if (Platform.OS !== 'web') {
        LocalAuthentication.supportedAuthenticationTypesAsync().then(types => {
          if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) setBiometricLabel('Face ID');
          else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT))   setBiometricLabel('Fingerprint');
          else setBiometricLabel('Device PIN');
        });
      }
      return () => {};
    }, [])
  );

  // ── Auth ──────────────────────────────────────────────
  const unlock = async () => {
    if (Platform.OS === 'web') { await loadAll(); setScreen('unlocked'); return; }

    const hasHw    = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHw || !enrolled) {
      Alert.alert('No device authentication', 'Set up a PIN, fingerprint, or Face ID in device Settings first.');
      return;
    }

    setScreen('unlocking');
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock your Glovebox',
      cancelLabel:   'Cancel',
      disableDeviceFallback: false,
    });

    if (result.success) {
      await loadAll();
      setScreen('unlocked');
    } else {
      setScreen('locked');
      if (result.error !== 'user_cancel' && result.error !== 'system_cancel') {
        Alert.alert('Authentication failed', 'Could not verify your identity.');
      }
    }
  };

  const lock = () => { setScreen('locked'); setEditing(null); setDocs(EMPTY_DOCS); };

  // ── Load from storage ──────────────────────────────────
  const loadAll = async () => {
    const d = { ...EMPTY_DOCS };
    for (const k of Object.keys(KEYS) as DocKey[]) {
      try { const raw = await secureGet(KEYS[k]); if (raw) (d as any)[k] = JSON.parse(raw); } catch {}
    }
    setDocs(d);
  };

  // ── Edit helpers ───────────────────────────────────────
  const startEdit = (key: DocKey) => {
    setDraft({ ...(docs[key] as any) });
    setEditing(key);
  };

  const cancelEdit = () => { setEditing(null); setDraft({}); };

  const saveDoc = async (docKey: DocKey) => {
    setSaving(true);
    try {
      const updated = { ...docs[docKey], ...draft } as any;
      await secureSet(KEYS[docKey], JSON.stringify(updated));
      setDocs(prev => ({ ...prev, [docKey]: updated }));
      setEditing(null);
    } catch {
      Alert.alert('Save failed', 'Could not write to device storage.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render: locked ────────────────────────────────────
  const renderLocked = () => (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.navRow}>
        <TouchableOpacity onPress={() => router.back()} style={s.navBtn}>
          <Feather name="arrow-left" size={20} color={colors.light.ink} />
        </TouchableOpacity>
        <Eyebrow>GLOVEBOX</Eyebrow>
        <View style={{ width: 40 }} />
      </View>
      <Rule />

      <View style={s.lockedBody}>
        <View style={s.lockCircle}>
          <Feather name="lock" size={40} color={colors.light.ink} />
        </View>
        <Text style={[type.h1, { color: colors.light.ink, textAlign: 'center', marginTop: space.lg }]}>
          Your documents.
        </Text>
        <Text style={[type.body, { color: colors.light.inkMuted, textAlign: 'center', marginTop: space.sm }]}>
          RC · Insurance · Licence · Medical
        </Text>

        {/* Device-only notice — shown before every unlock */}
        <View style={s.noticeCard}>
          <View style={s.noticeRow}>
            <Feather name="smartphone" size={14} color={colors.light.amber} />
            <Eyebrow style={{ marginLeft: 8, color: colors.light.amber }}>STORED ON THIS DEVICE ONLY</Eyebrow>
          </View>
          <Text style={[type.body, { color: colors.light.ink, marginTop: space.sm, lineHeight: 22 }]}>
            Your documents are saved on this device only, protected by your device authentication.{'\n\n'}
            Broad has <Text style={{ fontFamily: fonts.serifSemi }}>no access</Text> to these details.
            They are <Text style={{ fontFamily: fonts.serifSemi }}>not uploaded</Text> to any server
            and <Text style={{ fontFamily: fonts.serifSemi }}>not backed up</Text>. Uninstalling the
            app permanently deletes them.
          </Text>
        </View>

        {Platform.OS === 'web' && (
          <View style={[s.noticeCard, { borderColor: colors.light.rule, marginTop: space.md }]}>
            <View style={s.noticeRow}>
              <Feather name="alert-triangle" size={14} color={colors.light.inkMuted} />
              <Eyebrow style={{ marginLeft: 8 }}>WEB — REDUCED SECURITY</Eyebrow>
            </View>
            <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.sm }]}>
              On web, documents are stored in browser localStorage without biometric protection.
              Use the iOS or Android app for full security.
            </Text>
          </View>
        )}

        <Button
          label={screen === 'unlocking' ? 'VERIFYING…' : `UNLOCK WITH ${biometricLabel.toUpperCase()}`}
          onPress={unlock}
          disabled={screen === 'unlocking'}
          loading={screen === 'unlocking'}
          style={{ marginTop: space.xl, width: '100%' }}
          icon={<Feather name="unlock" size={16} color="#fff" />}
        />
      </View>
    </SafeAreaView>
  );

  // ── Render: doc card (unlocked list) ──────────────────
  const renderDocCard = (docKey: DocKey) => {
    const meta  = DOC_META[docKey];
    const doc   = (docs[docKey] as any);
    const empty = Object.values(doc).every(v => !v);

    return (
      <TouchableOpacity key={docKey} onPress={() => startEdit(docKey)} style={s.docCard} testID={`glovebox-${docKey}`}>
        <View style={s.docCardHead}>
          <View style={s.docIconCircle}>
            <Feather name={meta.icon} size={16} color={colors.light.ink} />
          </View>
          <View style={{ flex: 1, marginLeft: space.md }}>
            <Text style={[type.h3, { color: colors.light.ink }]}>{meta.title}</Text>
            <Meta style={{ marginTop: 2, color: empty ? colors.light.rule : colors.light.inkMuted }}>
              {meta.peek(doc).toUpperCase()}
            </Meta>
          </View>
          <Feather name="edit-2" size={14} color={colors.light.inkMuted} />
        </View>
      </TouchableOpacity>
    );
  };

  // ── Render: unlocked list ─────────────────────────────
  const renderUnlocked = () => (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.navRow}>
        <TouchableOpacity onPress={() => router.back()} style={s.navBtn}>
          <Feather name="arrow-left" size={20} color={colors.light.ink} />
        </TouchableOpacity>
        <Eyebrow>GLOVEBOX</Eyebrow>
        <TouchableOpacity onPress={lock} style={s.lockBtn}>
          <Feather name="lock" size={14} color={colors.light.inkMuted} />
          <Meta style={{ marginLeft: 4 }}>LOCK</Meta>
        </TouchableOpacity>
      </View>
      <Rule />

      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
        <View style={{ padding: space.lg }}>
          <Text style={[type.h1, { color: colors.light.ink }]}>Your documents.</Text>
          <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.xs }]}>
            Stored on this device. Tap any card to edit.
          </Text>
        </View>
        <Rule />
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm }}>
          {(Object.keys(KEYS) as DocKey[]).map(renderDocCard)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  // ── Render: edit view ─────────────────────────────────
  const renderEditing = (docKey: DocKey) => {
    const meta   = DOC_META[docKey];
    const fields = FIELDS[docKey];

    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.navRow}>
            <TouchableOpacity onPress={cancelEdit} style={s.navBtn}>
              <Feather name="x" size={20} color={colors.light.ink} />
            </TouchableOpacity>
            <View style={s.noticeRow}>
              <Feather name={meta.icon} size={14} color={colors.light.ink} />
              <Eyebrow style={{ marginLeft: 6 }}>{meta.title.toUpperCase()}</Eyebrow>
            </View>
            <View style={{ width: 40 }} />
          </View>
          <Rule />

          <ScrollView contentContainerStyle={s.editBody} keyboardShouldPersistTaps="handled">

            {/* Text fields */}
            {fields.map(({ key, label, placeholder, mono }, idx) => (
              <View key={key} style={[s.fieldWrap, idx < fields.length - 1 && s.fieldDivider]}>
                <Eyebrow>{label}</Eyebrow>
                <TextInput
                  style={[s.input, { fontFamily: mono ? fonts.mono : fonts.serif, letterSpacing: mono ? 1 : 0 }]}
                  value={draft[key] ?? ''}
                  onChangeText={v => setDraft(prev => ({ ...prev, [key]: v }))}
                  placeholder={placeholder}
                  placeholderTextColor={colors.light.rule}
                  autoCapitalize={mono ? 'characters' : 'sentences'}
                  autoCorrect={false}
                  testID={`glovebox-field-${key}`}
                />
              </View>
            ))}

            {/* Actions */}
            <View style={s.editActions}>
              <Button label="SAVE" onPress={() => saveDoc(docKey)} loading={saving} style={{ flex: 1 }} testID="glovebox-save-btn" />
              <Button label="CANCEL" variant="ghost" onPress={cancelEdit} style={{ flex: 1 }} testID="glovebox-cancel-btn" />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  };

  // ── State machine ──────────────────────────────────────
  if (editing)               return renderEditing(editing);
  if (screen === 'unlocked') return renderUnlocked();
  return renderLocked();
}

// ─────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: colors.light.bg },

  navRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md },
  navBtn:      { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  lockBtn:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, paddingVertical: space.xs, borderWidth: 1, borderColor: colors.light.rule, borderRadius: radius.tiny },

  // locked
  lockedBody:  { flex: 1, paddingHorizontal: space.lg, paddingTop: space.xl, alignItems: 'center' },
  lockCircle:  { width: 80, height: 80, borderRadius: 40, borderWidth: 1, borderColor: colors.light.rule, backgroundColor: colors.light.surface, alignItems: 'center', justifyContent: 'center' },
  noticeCard:  { width: '100%', marginTop: space.xl, borderWidth: 1, borderColor: colors.light.amber, borderRadius: radius.tiny, padding: space.lg, backgroundColor: colors.light.surface },
  noticeRow:   { flexDirection: 'row', alignItems: 'center' },

  // doc cards (unlocked)
  docCard:      { borderWidth: 1, borderColor: colors.light.rule, borderRadius: radius.tiny, backgroundColor: colors.light.surface, overflow: 'hidden' },
  docCardHead:  { flexDirection: 'row', alignItems: 'center', padding: space.lg },
  docIconCircle:{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.light.rule, alignItems: 'center', justifyContent: 'center' },

  // edit
  editBody:     { padding: space.lg, paddingBottom: space.xxl },
  fieldWrap:    { paddingVertical: space.md },
  fieldDivider: { borderBottomWidth: 1, borderBottomColor: colors.light.rule },
  input:        { marginTop: space.sm, fontSize: 16, color: colors.light.ink, paddingVertical: Platform.OS === 'ios' ? space.sm : space.xs },
  editActions:  { flexDirection: 'row', gap: space.md, marginTop: space.xl },
});
