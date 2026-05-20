// CaptureScreen — opens to camera. Tap shutter or pick from gallery.
// Uploads to Supabase Storage and creates a draft expense row; OCR runs
// server-side via the worker.
import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation } from '@react-navigation/native';

import TenantHeader from '../components/TenantHeader';
import { supabase } from '../lib/supabase';
import { useTenant } from '../lib/tenant';

export default function CaptureScreen() {
  const { tenant } = useTenant();
  const navigation = useNavigation<any>();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!permission?.granted) requestPermission(); }, []);

  const persist = async (localUri: string, mime: string) => {
    if (!tenant) return;
    setBusy(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('not signed in');
      const userId = session.session.user.id;

      // 1. Create the expense draft
      const { data: expense, error: e1 } = await supabase
        .from('expenses')
        .insert({
          tenant_id: tenant.id,
          submitter_id: userId,
          status: 'draft',
          currency: tenant.baseCurrency,
          captured_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (e1) throw e1;

      // 2. Upload the file to storage
      const ext = mime === 'application/pdf' ? 'pdf' : 'jpg';
      const filename = `${crypto.randomUUID?.() ?? Date.now()}.${ext}`;
      const path = `${tenant.id}/${expense.id}/${filename}`;
      const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      const { error: e2 } = await supabase.storage.from('receipts')
        .upload(path, bytes.buffer as ArrayBuffer, { contentType: mime, upsert: false });
      if (e2) throw e2;

      // 3. Register the receipt metadata
      const { error: e3 } = await supabase.from('receipts').insert({
        tenant_id: tenant.id, expense_id: expense.id,
        storage_path: path, mime_type: mime,
        uploaded_by: userId,
      });
      if (e3) throw e3;

      // 4. Navigate to Review — OCR will populate fields shortly via realtime
      navigation.navigate('Review', { expenseId: expense.id });
    } catch (err: any) {
      Alert.alert('Capture failed', err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const snap = async () => {
    if (!cameraRef.current) return;
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, base64: false });
    if (photo?.uri) await persist(photo.uri, 'image/jpeg');
  };

  const pickFromGallery = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!r.canceled && r.assets?.[0]) await persist(r.assets[0].uri, r.assets[0].mimeType ?? 'image/jpeg');
  };

  const pickFromFiles = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*', 'application/msword',
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
             'text/csv'],
      copyToCacheDirectory: true,
    });
    if (!r.canceled && r.assets?.[0]) await persist(r.assets[0].uri, r.assets[0].mimeType ?? 'application/octet-stream');
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0d1220' }}>
      <TenantHeader subtitle="New expense" />
      {permission?.granted ? (
        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          <View style={styles.frame} />
          <Text style={styles.hint}>Frame the receipt · tap shutter</Text>
        </CameraView>
      ) : (
        <View style={styles.permWrap}>
          <Text style={styles.permText}>Camera permission needed</Text>
          <Pressable style={styles.btn} onPress={requestPermission}><Text style={styles.btnText}>Grant access</Text></Pressable>
        </View>
      )}
      <View style={styles.dock}>
        <Pressable onPress={pickFromFiles} style={styles.smallBtn}>
          <Text style={styles.smallBtnText}>Upload file</Text>
        </Pressable>
        <Pressable onPress={snap} disabled={busy} style={[styles.shutter, busy && { opacity: 0.5 }]}/>
        <Pressable onPress={pickFromGallery} style={styles.smallBtn}>
          <Text style={styles.smallBtnText}>Photos</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  camera:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  frame:   { width: '70%', aspectRatio: 3/4, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)', borderRadius: 12 },
  hint:    { color: '#fff', fontSize: 13, marginTop: 18, opacity: 0.8 },
  permWrap:{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  permText:{ marginBottom: 12, color: '#1a1f2e' },
  dock:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 32, backgroundColor: '#0d1220' },
  shutter: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#fff', borderWidth: 4, borderColor: 'rgba(255,255,255,0.3)' },
  smallBtn:{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8 },
  smallBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  btn:     { backgroundColor: '#1F3A5F', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '700' },
});
