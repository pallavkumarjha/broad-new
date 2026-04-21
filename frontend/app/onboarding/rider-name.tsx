import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors, type, space, radius } from '../../src/theme/tokens';
import { Eyebrow, Rule, Button, Meta } from '../../src/components/ui';
import { HelmetIllus } from '../../src/components/illustrations';

export default function RiderName() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = () => {
    setBusy(true);
    // Navigate to next step with name in params (or store in context later)
    // For now, we'll just pass it via router params
    setTimeout(() => {
      router.push(`/onboarding/bike-info?name=${encodeURIComponent(name.trim() || 'Rider')}`);
      setBusy(false);
    }, 100);
  };

  const skip = () => {
    router.push('/onboarding/bike-info?name=Rider');
  };

  return (
    <SafeAreaView style={styles.container} testID="rider-name-screen">
      <View style={styles.illusWrap}>
        <HelmetIllus width={200} height={140} />
      </View>
      
      <View style={styles.header}>
        <Eyebrow>STEP 1 OF 3</Eyebrow>
        <Text style={[type.h1, { color: colors.light.ink, marginTop: space.xs }]}>Who's riding?</Text>
        <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.xs }]}>
          Tell us your name — or what you want to be called on the road.
        </Text>
      </View>
      
      <Rule />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.form}>
          <Eyebrow>RIDER NAME</Eyebrow>
          <TextInput
            testID="rider-name-input"
            value={name}
            onChangeText={setName}
            style={styles.input}
            placeholder="Your name"
            placeholderTextColor={colors.light.inkMuted}
            autoFocus
            autoCapitalize="words"
          />
        </View>
      </KeyboardAvoidingView>

      <View style={styles.cta}>
        <Button label="CONTINUE" onPress={submit} loading={busy} testID="rider-name-continue-btn" />
        <TouchableOpacity onPress={skip} style={{ alignItems: 'center', marginTop: space.md }} testID="rider-name-skip-btn">
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
  input: {
    borderWidth: 1, borderColor: colors.light.rule, marginTop: space.xs,
    paddingHorizontal: space.md, paddingVertical: space.md,
    fontFamily: 'Fraunces_400Regular', fontSize: 16, color: colors.light.ink,
    backgroundColor: '#FFFFFF', borderRadius: radius.tiny,
  },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.lg, backgroundColor: colors.light.bg, borderTopWidth: 1, borderTopColor: colors.light.rule },
});
