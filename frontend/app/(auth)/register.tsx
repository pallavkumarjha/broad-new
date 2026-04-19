import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, type, space, radius } from '../../src/theme/tokens';
import { Eyebrow, Button, Rule, ErrorStrip } from '../../src/components/ui';
import { HelmetIllus } from '../../src/components/illustrations';

export default function Register() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState<'name' | 'email' | 'password' | null>(null);

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      await signUp(email.trim(), password, name.trim() || 'Rider');
      router.replace('/onboarding/permissions');
    } catch (e: any) {
      setErr(e.message || 'Registration failed');
    } finally { setBusy(false); }
  };

  const { width } = useWindowDimensions();

  return (
    <SafeAreaView style={styles.container} testID="register-screen">
      <View style={styles.illusWrap}>
        <HelmetIllus width={width} height={220} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View>
            <Eyebrow>NEW RIDER — CREATE ACCOUNT</Eyebrow>
            <Text style={[type.h1, { color: colors.light.ink, marginTop: space.sm }]}>The road begins here.</Text>
            <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.xs }]}>Pick a name your crew will know you by.</Text>
          </View>

          <View style={{ marginTop: space.xl }}>
            <Eyebrow style={{ marginBottom: space.xs }}>RIDER NAME</Eyebrow>
            <TextInput testID="register-name-input" value={name} onChangeText={setName} onFocus={() => setFocused('name')} onBlur={() => setFocused(null)} placeholder="Arjun" placeholderTextColor={colors.light.inkMuted} style={[styles.input, focused === 'name' && styles.inputFocused]} />
            <Eyebrow style={{ marginTop: space.lg, marginBottom: space.xs }}>EMAIL</Eyebrow>
            <TextInput testID="register-email-input" value={email} onChangeText={setEmail} onFocus={() => setFocused('email')} onBlur={() => setFocused(null)} autoCapitalize="none" keyboardType="email-address" placeholder="you@road.com" placeholderTextColor={colors.light.inkMuted} style={[styles.input, focused === 'email' && styles.inputFocused]} />
            <Eyebrow style={{ marginTop: space.lg, marginBottom: space.xs }}>PASSWORD — MIN 6</Eyebrow>
            <TextInput testID="register-password-input" value={password} onChangeText={setPassword} onFocus={() => setFocused('password')} onBlur={() => setFocused(null)} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.light.inkMuted} style={[styles.input, focused === 'password' && styles.inputFocused]} />
            {err ? (
              <ErrorStrip testID="register-error" title="SIGN-UP FAILED" message={err} style={{ marginTop: space.md }} />
            ) : null}
            <Button label="CREATE ACCOUNT" onPress={submit} loading={busy} testID="register-submit-button" style={{ marginTop: space.lg }} />
          </View>

          <View style={{ marginTop: space.xxl }}>
            <Rule />
            <View style={styles.footer}>
              <Text style={[type.body, { color: colors.light.inkMuted }]}>Already on the road? </Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity testID="goto-login-link"><Text style={[type.body, { color: colors.light.ink, textDecorationLine: 'underline' }]}>Sign in</Text></TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.bg },
  illusWrap: { width: '100%', borderBottomWidth: 1, borderBottomColor: colors.light.rule },
  scroll: { padding: space.lg, paddingTop: space.lg, flexGrow: 1 },
  input: {
    borderWidth: 1, borderColor: colors.light.rule,
    paddingHorizontal: space.md, paddingVertical: space.md,
    fontFamily: 'Fraunces_400Regular', fontSize: 18, color: colors.light.ink,
    backgroundColor: '#FFFFFF', borderRadius: radius.tiny,
  },
  inputFocused: { borderColor: colors.light.amber, borderWidth: 1.5 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: space.lg, alignItems: 'center' },
});
