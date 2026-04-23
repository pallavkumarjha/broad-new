import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, type, space, radius } from '../../src/theme/tokens';
import { Eyebrow, Button, Rule, ErrorStrip } from '../../src/components/ui';
import { HelmetIllus } from '../../src/components/illustrations';

export default function Login() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/(tabs)');
    } catch (e: any) {
      setErr(e.message || 'Login failed');
    } finally { setBusy(false); }
  };

  const { width } = useWindowDimensions();

  return (
    <SafeAreaView style={styles.container} testID="login-screen">
      {/* Illustration sits above the keyboard-avoiding zone so it scrolls away naturally */}
      <View style={styles.illusWrap}>
        <HelmetIllus width={width} height={220} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View>
            <Eyebrow>SIGN IN — RETURNING RIDER</Eyebrow>
            <Text style={[type.h1, { color: colors.light.ink, marginTop: space.sm }]}>Welcome back.</Text>
            <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.xs }]}>
              Enter your details. The map is waiting.
            </Text>
          </View>

          <View style={{ marginTop: space.xl }}>
            <Eyebrow style={{ marginBottom: space.xs }}>EMAIL</Eyebrow>
            <TextInput
              testID="login-email-input"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@road.com"
              placeholderTextColor={colors.light.inkMuted}
              style={[styles.input, focused === 'email' && styles.inputFocused]}
            />
            <Eyebrow style={{ marginTop: space.lg, marginBottom: space.xs }}>PASSWORD</Eyebrow>
            <TextInput
              testID="login-password-input"
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor={colors.light.inkMuted}
              style={[styles.input, focused === 'password' && styles.inputFocused]}
            />
            {err ? (
              <ErrorStrip testID="login-error" title="SIGN-IN FAILED" message={err} style={{ marginTop: space.md }} />
            ) : null}
            <Button label="SIGN IN" onPress={submit} loading={busy} testID="login-submit-button" style={{ marginTop: space.lg }} />
          </View>

          <View style={{ marginTop: space.xxl }}>
            <Rule />
            <View style={styles.footer}>
              <Text style={[type.body, { color: colors.light.inkMuted }]}>New rider? </Text>
              <Link href="/(auth)/register" asChild>
                <TouchableOpacity testID="goto-register-link"><Text style={[type.body, { color: colors.light.ink, textDecorationLine: 'underline' }]}>Create an account</Text></TouchableOpacity>
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
