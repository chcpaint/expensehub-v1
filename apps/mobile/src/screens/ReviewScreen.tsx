// ReviewScreen — receives an expenseId, subscribes to Realtime so the OCR
// pre-fill appears as soon as the worker finishes processing.
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, TextInput } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';

import { supabase } from '../lib/supabase';
import ConfidenceField from '../components/ConfidenceField';

export default function ReviewScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const expenseId: string = route.params.expenseId;

  const [expense, setExpense] = useState<any>(null);
  const [ocr, setOcr] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: e } = await supabase.from('expenses').select('*').eq('id', expenseId).single();
      setExpense(e);
      setNotes(e?.notes ?? '');
      const { data: o } = await supabase.from('ocr_results').select('*').eq('expense_id', expenseId).maybeSingle();
      setOcr(o);
      const { data: a } = await supabase.from('coa_accounts')
        .select('id, code, name').eq('active', true).order('code');
      setAccounts(a ?? []);
    };
    load();

    // Realtime: update when OCR worker writes back
    const ch = supabase
      .channel(`expense:${expenseId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter: `id=eq.${expenseId}` },
        (payload) => setExpense(payload.new))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ocr_results', filter: `expense_id=eq.${expenseId}` },
        (payload) => setOcr(payload.new))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [expenseId]);

  const submit = async () => {
    if (!expense) return;
    setBusy(true);
    await supabase.from('expenses').update({ notes }).eq('id', expenseId);
    const { data: { session } } = await supabase.auth.getSession();
    const r = await fetch(`${(supabase as any).supabaseUrl}/functions/v1/expenses-submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expense_id: expenseId }),
    });
    setBusy(false);
    const j = await r.json();
    if (!r.ok) { Alert.alert('Could not submit', j.error ?? 'unknown'); return; }
    navigation.navigate('Tabs', { screen: 'Expenses' });
  };

  const f = ocr?.field_confidence ?? {};
  const ai = ocr?.ai_suggestion ?? null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fafbfc' }} contentContainerStyle={{ padding: 16 }}>
      {ai ? (
        <View style={styles.aiBox}>
          <View style={styles.aiIcon}><Text style={styles.aiIconText}>AI</Text></View>
          <Text style={styles.aiText}>Suggested: <Text style={{ fontWeight: '700' }}>{ai.account_name ?? ai.account_external_id}</Text> · {ai.reasoning}</Text>
        </View>
      ) : (
        <View style={styles.placeholder}><Text style={styles.placeholderText}>OCR running…</Text></View>
      )}

      <View style={styles.card}>
        <ConfidenceField label="Merchant"  value={expense?.merchant} confidence={f.merchant ?? 1} />
        <ConfidenceField label="Date"      value={expense?.txn_date} confidence={f.date ?? 1} />
        <ConfidenceField label="Total"     value={expense?.total_amount ? `$${Number(expense.total_amount).toFixed(2)} ${expense.currency}` : null} confidence={f.total ?? 1} />
        <ConfidenceField label="Tax"       value={expense?.tax_amount ? `$${Number(expense.tax_amount).toFixed(2)}` : '—'} confidence={f.tax ?? 1} />
        <ConfidenceField label="Account"   value={accounts.find(a => a.id === expense?.account_id)?.name} confidence={ai?.confidence ?? 0.7}
          onPress={() => Alert.alert('Account picker', 'TODO: open account picker modal')} />
        <ConfidenceField label="Project"   value={expense?.project_id ? '(set)' : null}
          onPress={() => Alert.alert('Project picker', 'TODO: open project picker')} placeholder="Tap to assign" />
      </View>

      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput style={styles.notes} value={notes} onChangeText={setNotes} multiline placeholder="What was this for?" />

      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => navigation.goBack()}>
          <Text style={styles.btnGhostText}>Save draft</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnPrimary, busy && { opacity: 0.5 }]} disabled={busy} onPress={submit}>
          <Text style={styles.btnPrimaryText}>{busy ? 'Submitting…' : 'Submit'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  aiBox:  { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#e8eef5', padding: 12, borderRadius: 10, marginBottom: 12 },
  aiIcon: { width: 28, height: 28, borderRadius: 7, backgroundColor: '#1F3A5F', justifyContent: 'center', alignItems: 'center' },
  aiIconText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  aiText: { flex: 1, fontSize: 12, color: '#1a1f2e' },
  placeholder: { padding: 12, backgroundColor: '#fff8e6', borderRadius: 10, marginBottom: 12 },
  placeholderText: { color: '#c47f00', fontWeight: '600', fontSize: 12 },
  card:   { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: '#e3e6ec' },
  label:  { fontSize: 11, color: '#6b7382', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 16, marginBottom: 6 },
  notes:  { backgroundColor: '#fff', borderRadius: 10, padding: 12, minHeight: 80, borderWidth: 1, borderColor: '#e3e6ec', fontSize: 14, textAlignVertical: 'top' },
  actions:{ flexDirection: 'row', gap: 10, marginTop: 16 },
  btn:    { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  btnGhost:{ backgroundColor: '#f5f6fa' },
  btnGhostText: { color: '#1a1f2e', fontWeight: '700' },
  btnPrimary: { backgroundColor: '#1F3A5F' },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
});
