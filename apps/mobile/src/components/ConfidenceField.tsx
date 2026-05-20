// Tappable field that visualises OCR confidence (high/med/low) per the spec.
import { Pressable, Text, View, StyleSheet, TextStyle } from 'react-native';

interface Props {
  label: string;
  value: string | null | undefined;
  confidence?: number; // 0-1
  onPress?: () => void;
  placeholder?: string;
}
export default function ConfidenceField({ label, value, confidence = 1, onPress, placeholder }: Props) {
  const dotColor = confidence >= 0.85 ? '#1c8b59' : confidence >= 0.6 ? '#c47f00' : '#c33d3d';
  const placeholderStyle: TextStyle | undefined = value ? undefined : { color: '#6b7382' };
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.right}>
        <Text style={[styles.value, placeholderStyle]} numberOfLines={1}>
          {value || placeholder || 'Tap to set'}
        </Text>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomColor: '#e3e6ec', borderBottomWidth: 1 },
  label: { fontSize: 11, color: '#6b7382', textTransform: 'uppercase', letterSpacing: 0.4 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '60%' },
  value: { fontSize: 14, fontWeight: '600', color: '#1a1f2e' },
  dot:   { width: 8, height: 8, borderRadius: 4 },
});
