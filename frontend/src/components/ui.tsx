import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';
import { colors, space, radius, type } from '../theme/tokens';

// ---------- Eyebrow (mono uppercase label) ----------
export function Eyebrow({ children, color, style, testID }: { children: React.ReactNode; color?: string; style?: TextStyle; testID?: string }) {
  return <Text testID={testID} style={[type.eyebrow, { color: color || colors.light.inkMuted }, style]}>{children}</Text>;
}

// ---------- Meta (mono small) ----------
export function Meta({ children, color, style, testID }: { children: React.ReactNode; color?: string; style?: TextStyle; testID?: string }) {
  return <Text testID={testID} style={[type.meta, { color: color || colors.light.inkMuted }, style]}>{children}</Text>;
}

// ---------- Rule (1px horizontal divider) ----------
export function Rule({ color, style }: { color?: string; style?: ViewStyle }) {
  return <View style={[{ height: 1, backgroundColor: color || colors.light.rule, width: '100%' }, style]} />;
}

// ---------- Card ----------
export function Card({ children, style, dark }: { children: React.ReactNode; style?: ViewStyle; dark?: boolean }) {
  const t = dark ? colors.dark : colors.light;
  return (
    <View style={[{
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.rule,
      borderRadius: radius.tiny,
      padding: space.lg,
    }, style]}>{children}</View>
  );
}

// ---------- Button (primary = ink fill) ----------
export function Button({ label, onPress, variant = 'primary', loading, dark, style, testID, disabled, icon }: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost' | 'amber';
  loading?: boolean;
  dark?: boolean;
  style?: ViewStyle;
  testID?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  const t = dark ? colors.dark : colors.light;
  let bg = t.ink, fg = t.bg, border: string | undefined = undefined;
  if (variant === 'ghost') { bg = 'transparent'; fg = t.ink; border = t.rule; }
  if (variant === 'amber') { bg = t.amber; fg = '#FFFFFF'; }
  const op = disabled ? 0.4 : 1;
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[styles.btn, { backgroundColor: bg, borderColor: border, borderWidth: border ? 1 : 0, opacity: op }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon}
          <Text style={[type.body, { color: fg, fontFamily: 'Fraunces_600SemiBold', letterSpacing: 0.3 }]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ---------- ErrorStrip (inline error with left-border accent) ----------
export function ErrorStrip({ title, message, testID, style }: {
  title?: string;
  message: string;
  testID?: string;
  style?: ViewStyle;
}) {
  return (
    <View testID={testID} style={[{
      flexDirection: 'row', alignItems: 'stretch',
      backgroundColor: '#FDF1EF',
      borderWidth: 1, borderColor: '#E5C9C3',
      borderRadius: radius.tiny, overflow: 'hidden',
    }, style]}>
      <View style={{ width: 3, backgroundColor: colors.light.danger }} />
      <View style={{ flex: 1, paddingHorizontal: space.md, paddingVertical: space.sm }}>
        {title ? (
          <Text style={[type.meta, { color: colors.light.danger }]}>{title}</Text>
        ) : null}
        <Text style={[type.body, { color: colors.light.ink, marginTop: title ? 2 : 0 }]}>{message}</Text>
      </View>
    </View>
  );
}

// ---------- Spec Row (label → value) ----------
export function SpecRow({ label, value, last, dark, valueMono = true, testID }: {
  label: string;
  value: React.ReactNode;
  last?: boolean;
  dark?: boolean;
  valueMono?: boolean;
  testID?: string;
}) {
  const t = dark ? colors.dark : colors.light;
  return (
    <View testID={testID} style={[{
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: space.md,
      borderBottomWidth: last ? 0 : 1,
      borderBottomColor: t.rule,
    }]}>
      <Text style={[type.eyebrow, { color: t.inkMuted }]}>{label}</Text>
      <Text style={[valueMono ? type.meta : type.body, { color: t.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
});
