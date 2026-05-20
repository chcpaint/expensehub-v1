import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) Alert.alert('Sign in failed', error.message);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.outer}>
      <View style={styles.brand}><Text style={styles.brandText}>ExpenseHub</Text></View>

      <View style={styles.form}>
        <Text style={styles.label}>Work email</Text>
        <TextInput style={styles.input} autoCapitalize="none" autoComplete="email"
          keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@company.com" />
        <Text style={styles.label}>Password</Text>
        <TextInput style={styles.input} secureTextEntry value={password} onChangeText={setPassword} />
        <Pressable disabled={busy} style={[styles.btn, busy && { opacity: 0.5 }]} onPress={signIn}>
          <Text style={styles.btnText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
        </Pressable>
      </View>

      <Text style={styles.help}>Use one of the demo accounts seeded by `supabase db reset`.</Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#fff' },
  brand: { alignItems: 'center', marginBottom: 48 },
  brandText: { fontSize: 32, fontWeight: '800', color: '#1F3A5F', letterSpacing: -0.5 },
  form:  { gap: 8 },
  label: { fontSize: 11, color: '#6b7382', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#cdd1da', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  btn:   { backgroundColor: '#1F3A5F', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 18 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  help:  { color: '#6b7382', fontSize: 12, textAlign: 'center', marginTop: 36 },
});
