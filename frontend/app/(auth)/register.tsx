import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, type, space, radius } from '../../src/theme/tokens';
import { Eyebrow, Button, Rule } from '../../src/components/ui';

export default function Register() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      await signUp(email.trim(), password, name.trim() || 'Rider');
      router.replace('/onboarding/permissions');
    } catch (e: any) {
      setErr(e.message || 'Registration failed');
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.container} testID="register-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View>
            <Eyebrow>NEW RIDER — CREATE ACCOUNT</Eyebrow>
            <Text style={[type.h1, { color: colors.light.ink, marginTop: space.sm }]}>The road begins here.</Text>
            <Text style={[type.body, { color: colors.light.inkMuted, marginTop: space.xs }]}>Pick a name your crew will know you by.</Text>
          </View>

          <View style={{ marginTop: space.xl }}>
            <Eyebrow style={{ marginBottom: space.xs }}>RIDER NAME</Eyebrow>
            <TextInput testID="register-name-input" value={name} onChangeText={setName} placeholder="Arjun" placeholderTextColor={colors.light.inkMuted} style={styles.input} />
            <Eyebrow style={{ marginTop: space.lg, marginBottom: space.xs }}>EMAIL</Eyebrow>
            <TextInput testID="register-email-input" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@road.com" placeholderTextColor={colors.light.inkMuted} style={styles.input} />
            <Eyebrow style={{ marginTop: space.lg, marginBottom: space.xs }}>PASSWORD — MIN 6</Eyebrow>
            <TextInput testID="register-password-input" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" placeholderTextColor={colors.light.inkMuted} style={styles.input} />
            {err ? <Text testID="register-error" style={[{ color: colors.light.danger, marginTop: space.md, fontFamily: 'JetBrainsMono_400Regular', fontSize: 12 }]}>{err.toUpperCase()}</Text> : null}
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
  scroll: { padding: space.lg, paddingTop: space.xxl, flexGrow: 1 },
  input: {
    borderWidth: 1, borderColor: colors.light.rule,
    paddingHorizontal: space.md, paddingVertical: space.md,
    fontFamily: 'Fraunces_400Regular', fontSize: 18, color: colors.light.ink,
    backgroundColor: '#FFFFFF', borderRadius: radius.tiny,
  },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: space.lg, alignItems: 'center' },
});
