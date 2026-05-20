import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { supabase } from '../lib/supabase';
import TenantHeader from '../components/TenantHeader';

const STATUS_COLOR: Record<string, string> = {
  draft:            '#888',
  pending_approval: '#c47f00',
  approved:         '#1c8b59',
  rejected:         '#c33d3d',
  queued_export:    '#236b7a',
  exported:         '#1c8b59',
  reconciled:       '#1c8b59',
  posted:           '#1c8b59',
  post_failed:      '#c33d3d',
};

export default function MyExpensesScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('expenses')
      .select('id, merchant, txn_date, total_amount, currency, status, category_id, categories(name)')
      .eq('submitter_id', user.id)
      .order('txn_date', { ascending: false, nullsFirst: false })
      .limit(50);
    setItems(data ?? []);
  };

  useEffect(() => { load(); }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#fafbfc' }}>
      <TenantHeader subtitle="My expenses" />
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        contentContainerStyle={{ padding: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => (
          <Pressable style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.merchant} numberOfLines={1}>{item.merchant ?? '(no merchant)'}</Text>
              <Text style={styles.amount}>${Number(item.total_amount ?? 0).toFixed(2)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.meta}>{item.txn_date ?? '—'} · {item.categories?.name ?? 'Uncategorized'}</Text>
              <Text style={[styles.status, { color: STATUS_COLOR[item.status] ?? '#888' }]}>
                {item.status.replace('_', ' ')}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No expenses yet. Tap + New to capture one.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card:    { backgroundColor: '#fff', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#e3e6ec' },
  row:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  merchant:{ fontSize: 15, fontWeight: '700', color: '#1a1f2e', flex: 1, marginRight: 8 },
  amount:  { fontSize: 15, fontWeight: '700', color: '#1a1f2e' },
  meta:    { fontSize: 12, color: '#6b7382', marginTop: 4 },
  status:  { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 },
  empty:   { textAlign: 'center', color: '#6b7382', padding: 32 },
});
