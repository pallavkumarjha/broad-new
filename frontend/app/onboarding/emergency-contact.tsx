import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../../src/theme/tokens';
import { Eyebrow, Rule, Button, Card, Meta } from '../../src/components/ui';
import { CompassIllus } from '../../src/components/illustrations';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/lib/api';
import { queryClient } from '../../src/lib/queryClient';

export default function EmergencyContact() {
  const router = useRouter();
  const { refresh } = useAuth();
  const { name, make, model, registration, odometer_km } = useLocalSearchParams<{
    name?: string;
    make?: string;
    model?: string;
    registration?: string;
    odometer_km?: string;
  }>();

  const riderName = name || 'Rider';
  const bikeData = {
    make: make || '',
    model: model || '',
    registration: registration || '',
    odometer_km: Number(odometer_km) || 0,
  };

  const [contacts, setContacts] = useState([{ name: '', phone: '', relation: '' }]);
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
        name: riderName,
        bike: bikeData,
        emergency_contacts: cleanContacts,
      });
      await refresh();
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Could not save', e?.response?.data?.detail || e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    setBusy(true);
    try {
      // Save whatever we have so far (even if empty)
      await api.patch('/users/me', {
        name: riderName,
        bike: bikeData,
        emergency_contacts: [],
      });
      await refresh();
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      router.replace('/(tabs)');
    } catch (e: any) {
      // If save fails, still let user continue
      router.replace('/(tabs)');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="emergency-contact-screen">
      <View style={styles.illusWrap}>
        <CompassIllus width={200} height={140} />
      </View>
      
      <View style={styles.header}>
        <Eyebrow>STEP 3 OF 3</Eyebrow>
        <Text style={[type.h1, { color: colors.light.ink, marginTop: space.xs }]}>Safety net.</Text>
        <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.xs }]}>
          Who should we call if the road bites back? Add one or more emergency contacts.
        </Text>
      </View>
      
      <Rule />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <View style={styles.form}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm }}>
              <Eyebrow>EMERGENCY CONTACTS — {contacts.length}</Eyebrow>
              <TouchableOpacity onPress={addContact} testID="add-contact-btn">
                <Meta style={{ color: colors.light.amber }}>+ ADD</Meta>
              </TouchableOpacity>
            </View>
            
            {contacts.map((c, i) => (
              <Card key={i} style={{ marginTop: space.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm }}>
                  <Meta>CONTACT {i + 1}</Meta>
                  {contacts.length > 1 && (
                    <TouchableOpacity onPress={() => removeContact(i)} testID={`remove-contact-${i}`}>
                      <Feather name="x" size={16} color={colors.light.inkMuted} />
                    </TouchableOpacity>
                  )}
                </View>
                <Eyebrow style={{ marginBottom: 4 }}>NAME</Eyebrow>
                <TextInput
                  testID={`contact-name-${i}`}
                  value={c.name}
                  onChangeText={t => updateContact(i, { name: t })}
                  style={styles.inputCard}
                  placeholder="Priya Mehra"
                  placeholderTextColor={colors.light.inkMuted}
                />
                <Eyebrow style={{ marginTop: space.md, marginBottom: 4 }}>PHONE</Eyebrow>
                <TextInput
                  testID={`contact-phone-${i}`}
                  value={c.phone}
                  onChangeText={t => updateContact(i, { phone: t })}
                  keyboardType="phone-pad"
                  style={styles.inputCard}
                  placeholder="+91 98765 43210"
                  placeholderTextColor={colors.light.inkMuted}
                />
                <Eyebrow style={{ marginTop: space.md, marginBottom: 4 }}>RELATION</Eyebrow>
                <TextInput
                  testID={`contact-rel-${i}`}
                  value={c.relation || ''}
                  onChangeText={t => updateContact(i, { relation: t })}
                  style={styles.inputCard}
                  placeholder="Spouse, doctor, friend…"
                  placeholderTextColor={colors.light.inkMuted}
                />
              </Card>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.cta}>
        <Button label="CONTINUE" onPress={submit} loading={busy} testID="emergency-contact-continue-btn" />
        <TouchableOpacity onPress={skip} style={{ alignItems: 'center', marginTop: space.md }} testID="emergency-contact-skip-btn">
          <Meta>SKIP FOR NOW</Meta>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  illusWrap: { paddingHorizontal: space.lg, paddingTop: space.lg, borderBottomWidth: 1, borderBottomColor: colors.light.rule },
  header: { padding: space.lg },
  form: { paddingHorizontal: space.lg, paddingTop: space.lg },
  inputCard: {
    borderBottomWidth: 1, borderBottomColor: colors.light.rule,
    paddingVertical: space.sm,
    fontFamily: 'Fraunces_400Regular', fontSize: 16, color: colors.light.ink,
  },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, backgroundColor: colors.light.bg, borderTopWidth: 1, borderTopColor: colors.light.rule },
});
