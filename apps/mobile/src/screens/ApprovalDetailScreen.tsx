import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import { supabase } from '../lib/supabase';

export default function ApprovalDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const expenseId: string = route.params.expenseId;
  const [expense, setExpense] = useState<any>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('expenses').select(`
        *, account:coa_accounts(code, name), vendor:coa_vendors(display_name),
        project:coa_dimensions!project_id(name), tax_code:tax_codes(name)
      `).eq('id', expenseId).single();
      setExpense(data);
    })();
  }, [expenseId]);

  const act = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !comment.trim()) {
      Alert.alert('Comment required', 'Please add a comment when rejecting.');
      return;
    }
    // Biometric re-auth for the approval action (high-trust)
    if (action === 'approve') {
      const supports = await LocalAuthentication.hasHardwareAsync();
      if (supports) {
        const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm approval' });
        if (!r.success) return;
      }
    }

    setBusy(true);
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch(`${(supabase as any).supabaseUrl}/functions/v1/expenses-approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expense_id: expenseId, action, comment }),
    });
    setBusy(false);
    const j = await r.json();
    if (!r.ok) { Alert.alert('Action failed', j.error ?? 'unknown'); return; }
    navigation.goBack();
  };

  if (!expense) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fafbfc' }} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.header}>{expense.merchant}</Text>
      <Text style={styles.amount}>${Number(expense.total_amount ?? 0).toFixed(2)} {expense.currency}</Text>

      <View style={styles.card}>
        <Row label="Date"        value={expense.txn_date} />
        <Row label="GL Account"  value={expense.account?.code ? `${expense.account.code} · ${expense.account.name}` : '—'} />
        <Row label="Vendor"      value={expense.vendor?.display_name ?? '—'} />
        <Row label="Project"     value={expense.project?.name ?? '—'} />
        <Row label="Payment"     value={expense.payment_method ?? '—'} />
        <Row label="Tax"         value={expense.tax_code?.name ?? '—'} />
        {expense.justification ? <Row label="Justification" value={expense.justification} /> : null}
      </View>

      <Text style={styles.label}>Comment (required on reject)</Text>
      <TextInput style={styles.input} value={comment} onChangeText={setComment} multiline />

      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.reject, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => act('reject')}>
          <Text style={styles.rejectText}>Reject</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.approve, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => act('approve')}>
          <Text style={styles.approveText}>Approve</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header:  { fontSize: 22, fontWeight: '800', color: '#1a1f2e' },
  amount:  { fontSize: 28, fontWeight: '800', color: '#1F3A5F', marginVertical: 8 },
  card:    { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e3e6ec', marginTop: 12 },
  row:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomColor: '#e3e6ec', borderBottomWidth: 1 },
  rowLabel:{ fontSize: 11, color: '#6b7382', textTransform: 'uppercase', letterSpacing: 0.4 },
  rowValue:{ fontSize: 14, color: '#1a1f2e', fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  label:   { fontSize: 11, color: '#6b7382', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 16 },
  input:   { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e3e6ec', borderRadius: 10, padding: 12, minHeight: 60, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btn:     { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  reject:  { backgroundColor: '#fff', borderWidth: 1, borderColor: '#c33d3d' },
  rejectText: { color: '#c33d3d', fontWeight: '700' },
  approve: { backgroundColor: '#1c8b59' },
  approveText: { color: '#fff', fontWeight: '700' },
});
