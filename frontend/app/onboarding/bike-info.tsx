import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../../src/theme/tokens';
import { Eyebrow, Rule, Button, Card, Meta } from '../../src/components/ui';
import { RoadIllus } from '../../src/components/illustrations';

export default function BikeInfo() {
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name?: string }>();
  const riderName = name || 'Rider';
  
  const [bike, setBike] = useState({
    make: '',
    model: '',
    registration: '',
    odometer_km: 0,
  });
  const [busy, setBusy] = useState(false);

  const submit = () => {
    setBusy(true);
    setTimeout(() => {
      const params = new URLSearchParams();
      params.set('name', riderName);
      params.set('make', bike.make);
      params.set('model', bike.model);
      params.set('registration', bike.registration);
      params.set('odometer_km', String(bike.odometer_km || 0));
      router.push(`/onboarding/emergency-contact?${params.toString()}`);
      setBusy(false);
    }, 100);
  };

  const skip = () => {
    const params = new URLSearchParams();
    params.set('name', riderName);
    params.set('make', '');
    params.set('model', '');
    params.set('registration', '');
    params.set('odometer_km', '0');
    router.push(`/onboarding/emergency-contact?${params.toString()}`);
  };

  return (
    <SafeAreaView style={styles.container} testID="bike-info-screen">
      <View style={styles.illusWrap}>
        <RoadIllus width={200} height={140} />
      </View>
      
      <View style={styles.header}>
        <Eyebrow>STEP 2 OF 3</Eyebrow>
        <Text style={[type.h1, { color: colors.light.ink, marginTop: space.xs }]}>The bike.</Text>
        <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.xs }]}>
          What are you riding? We'll keep track of the details for you.
        </Text>
      </View>
      
      <Rule />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <View style={styles.form}>
            <Card>
              <Eyebrow style={{ marginBottom: 4 }}>MAKE</Eyebrow>
              <TextInput
                testID="bike-make-input"
                value={bike.make}
                onChangeText={t => setBike({ ...bike, make: t })}
                style={styles.inputCard}
                placeholder="Royal Enfield"
                placeholderTextColor={colors.light.inkMuted}
              />
              <Eyebrow style={{ marginTop: space.md, marginBottom: 4 }}>MODEL</Eyebrow>
              <TextInput
                testID="bike-model-input"
                value={bike.model}
                onChangeText={t => setBike({ ...bike, model: t })}
                style={styles.inputCard}
                placeholder="Himalayan 450"
                placeholderTextColor={colors.light.inkMuted}
              />
              <Eyebrow style={{ marginTop: space.md, marginBottom: 4 }}>REGISTRATION</Eyebrow>
              <TextInput
                testID="bike-reg-input"
                value={bike.registration}
                onChangeText={t => setBike({ ...bike, registration: t.toUpperCase() })}
                autoCapitalize="characters"
                style={styles.inputCard}
                placeholder="KA-01-AB-2024"
                placeholderTextColor={colors.light.inkMuted}
              />
              <Eyebrow style={{ marginTop: space.md, marginBottom: 4 }}>ODOMETER (KM)</Eyebrow>
              <TextInput
                testID="bike-odo-input"
                value={String(bike.odometer_km || '')}
                onChangeText={t => setBike({ ...bike, odometer_km: Number(t.replace(/\D/g, '')) || 0 })}
                keyboardType="number-pad"
                style={styles.inputCard}
                placeholder="0"
                placeholderTextColor={colors.light.inkMuted}
              />
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.cta}>
        <Button label="CONTINUE" onPress={submit} loading={busy} testID="bike-info-continue-btn" />
        <TouchableOpacity onPress={skip} style={{ alignItems: 'center', marginTop: space.md }} testID="bike-info-skip-btn">
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
