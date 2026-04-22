import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/lib/api';
import { queryClient } from '../../src/lib/queryClient';
import { colors, type, space, radius } from '../../src/theme/tokens';
import { Eyebrow, Rule, Button, Card, Meta } from '../../src/components/ui';

export default function ProfileEdit() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  // The `onboarding` param is no longer used since we have a separate flow.
  // This screen is now only for editing profile from settings.

  const [name, setName] = useState(user?.name || '');
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

  const updateContact = (i: number, patch: any) => {
    setContacts(contacts.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  };
  const addContact = () => setContacts([...contacts, { name: '', phone: '', relation: '' }]);
  const removeContact = (i: number) => setContacts(contacts.filter((_, idx) => idx !== i));

  const submit = async () => {
    setBusy(true);
    try {
      const cleanContacts = contacts.filter(c => c.name.trim() && c.phone.trim());
      await api.patch('/users/me', {
        name: name.trim() || 'Rider',
        bike: { ...bike, odometer_km: Number(bike.odometer_km) || 0 },
        emergency_contacts: cleanContacts,
      });
      await refresh();
      // User profile changed — invalidate /auth/me cache used by Discover's
      // home_city filter and anything else that reads the me query.
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e?.response?.data?.detail || e?.message || '');
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.container} testID="profile-edit-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="edit-back-btn"><Feather name="arrow-left" size={22} color={colors.light.ink} /></TouchableOpacity>
        <Eyebrow>EDIT PROFILE</Eyebrow>
        <View style={{ width: 22 }} />
      </View>
      <Rule />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <View style={styles.section}>
            <Eyebrow>RIDER NAME</Eyebrow>
            <TextInput testID="edit-name-input" value={name} onChangeText={setName} style={styles.input} placeholder="Your name" placeholderTextColor={colors.light.inkMuted} />
          </View>

          <View style={styles.section}>
            <Eyebrow>THE BIKE</Eyebrow>
            <Card style={{ marginTop: space.sm }}>
              <Eyebrow style={{ marginBottom: 4 }}>MAKE</Eyebrow>
              <TextInput testID="edit-bike-make" value={bike.make} onChangeText={t => setBike({ ...bike, make: t })} style={styles.inputCard} placeholder="Royal Enfield" placeholderTextColor={colors.light.inkMuted} />
              <Eyebrow style={{ marginTop: space.md, marginBottom: 4 }}>MODEL</Eyebrow>
              <TextInput testID="edit-bike-model" value={bike.model} onChangeText={t => setBike({ ...bike, model: t })} style={styles.inputCard} placeholder="Himalayan 450" placeholderTextColor={colors.light.inkMuted} />
              <Eyebrow style={{ marginTop: space.md, marginBottom: 4 }}>REGISTRATION</Eyebrow>
              <TextInput testID="edit-bike-reg" value={bike.registration} onChangeText={t => setBike({ ...bike, registration: t.toUpperCase() })} autoCapitalize="characters" style={styles.inputCard} placeholder="KA-01-AB-2024" placeholderTextColor={colors.light.inkMuted} />
              <Eyebrow style={{ marginTop: space.md, marginBottom: 4 }}>ODOMETER (KM)</Eyebrow>
              <TextInput testID="edit-bike-odo" value={String(bike.odometer_km || '')} onChangeText={t => setBike({ ...bike, odometer_km: Number(t.replace(/\D/g, '')) || 0 })} keyboardType="number-pad" style={styles.inputCard} placeholder="0" placeholderTextColor={colors.light.inkMuted} />
            </Card>
          </View>

          <View style={styles.section}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Eyebrow>EMERGENCY CONTACTS — {contacts.length}</Eyebrow>
              <TouchableOpacity onPress={addContact} testID="edit-add-contact"><Meta style={{ color: colors.light.amber }}>+ ADD</Meta></TouchableOpacity>
            </View>
            {contacts.map((c, i) => (
              <Card key={i} style={{ marginTop: space.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm }}>
                  <Meta>CONTACT {i + 1}</Meta>
                  {contacts.length > 1 && (
                    <TouchableOpacity onPress={() => removeContact(i)} testID={`edit-remove-contact-${i}`}>
                      <Feather name="x" size={16} color={colors.light.inkMuted} />
                    </TouchableOpacity>
                  )}
                </View>
                <Eyebrow style={{ marginBottom: 4 }}>NAME</Eyebrow>
                <TextInput testID={`edit-contact-name-${i}`} value={c.name} onChangeText={t => updateContact(i, { name: t })} style={styles.inputCard} placeholder="Priya Mehra" placeholderTextColor={colors.light.inkMuted} />
                <Eyebrow style={{ marginTop: space.md, marginBottom: 4 }}>PHONE</Eyebrow>
                <TextInput testID={`edit-contact-phone-${i}`} value={c.phone} onChangeText={t => updateContact(i, { phone: t })} keyboardType="phone-pad" style={styles.inputCard} placeholder="+91 98765 43210" placeholderTextColor={colors.light.inkMuted} />
                <Eyebrow style={{ marginTop: space.md, marginBottom: 4 }}>RELATION</Eyebrow>
                <TextInput testID={`edit-contact-rel-${i}`} value={c.relation || ''} onChangeText={t => updateContact(i, { relation: t })} style={styles.inputCard} placeholder="Spouse, doctor, friend…" placeholderTextColor={colors.light.inkMuted} />
              </Card>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.cta}>
        <Button label="SAVE" onPress={submit} loading={busy} testID="edit-save-btn" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  header: { paddingHorizontal: space.lg, paddingVertical: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { paddingHorizontal: space.lg, paddingTop: space.xl },
  input: {
    borderWidth: 1, borderColor: colors.light.rule, marginTop: space.xs,
    paddingHorizontal: space.md, paddingVertical: space.md,
    fontFamily: 'Fraunces_400Regular', fontSize: 16, color: colors.light.ink,
    backgroundColor: '#FFFFFF', borderRadius: radius.tiny,
  },
  inputCard: {
    borderBottomWidth: 1, borderBottomColor: colors.light.rule,
    paddingVertical: space.sm,
    fontFamily: 'Fraunces_400Regular', fontSize: 16, color: colors.light.ink,
  },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, backgroundColor: colors.light.bg, borderTopWidth: 1, borderTopColor: colors.light.rule },
});
