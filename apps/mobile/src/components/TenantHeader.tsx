// Tenant-branded header used at the top of every primary screen.
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTenant } from '../lib/tenant';

export default function TenantHeader({ subtitle }: { subtitle?: string }) {
  const { tenant } = useTenant();
  const accent = tenant?.accentColor ?? '#1F3A5F';
  const initials = tenant?.name?.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() ?? 'EH';

  return (
    <View style={styles.row}>
      <View style={[styles.logo, { backgroundColor: accent }]}>
        {tenant?.logoPath
          ? <Image source={{ uri: tenant.logoPath }} style={styles.logoImg} />
          : <Text style={styles.logoText}>{initials}</Text>}
      </View>
      <View style={styles.text}>
        <Text style={styles.name}>{tenant?.name ?? 'ExpenseHub'}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: '#e3e6ec', backgroundColor: '#fff' },
  logo:  { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  logoImg: { width: 36, height: 36, borderRadius: 8 },
  logoText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  text:  { flex: 1 },
  name:  { fontSize: 15, fontWeight: '700', color: '#1a1f2e' },
  sub:   { fontSize: 11, color: '#6b7382' },
});
