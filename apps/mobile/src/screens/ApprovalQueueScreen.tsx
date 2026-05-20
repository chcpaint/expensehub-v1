import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import TenantHeader from '../components/TenantHeader';

export default function ApprovalQueueScreen() {
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('approval_steps')
      .select(`
        id, step_order, status,
        expense:expenses!inner(id, merchant, txn_date, total_amount, currency,
                               total_amount, submitter_id, category_id, categories(name))
      `)
      .eq('approver_id', user.id).eq('status', 'pending')
      .order('id', { ascending: true });
    setItems(data ?? []);
  };

  useEffect(() => { load(); }, []);

  const totalPending = items.reduce((s, x) => s + Number(x.expense?.total_amount ?? 0), 0);

  return (
    <View style={{ flex: 1, backgroundColor: '#fafbfc' }}>
      <TenantHeader subtitle={`${items.length} pending · $${totalPending.toFixed(2)}`} />
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        contentContainerStyle={{ padding: 12 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => navigation.navigate('ApprovalDetail', { expenseId: item.expense.id, stepId: item.id })}>
            <View style={styles.row}>
              <Text style={styles.merchant}>{item.expense.merchant ?? '(no merchant)'}</Text>
              <Text style={styles.amount}>${Number(item.expense.total_amount ?? 0).toFixed(2)}</Text>
            </View>
            <Text style={styles.meta}>{item.expense.txn_date} · {item.expense.categories?.name ?? 'Uncategorized'}</Text>
            <Text style={styles.hint}>Tap to review · approve or reject</Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No expenses waiting on you. Nice.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card:    { backgroundColor: '#fff', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#e3e6ec', borderLeftWidth: 4, borderLeftColor: '#c47f00' },
  row:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  merchant:{ fontSize: 15, fontWeight: '700', color: '#1a1f2e' },
  amount:  { fontSize: 15, fontWeight: '700' },
  meta:    { fontSize: 12, color: '#6b7382', marginTop: 4 },
  hint:    { fontSize: 11, color: '#6b7382', fontStyle: 'italic', marginTop: 8, textAlign: 'right' },
  empty:   { textAlign: 'center', color: '#6b7382', padding: 32 },
});
