// Supabase client for the mobile app. Tokens persist in expo-secure-store
// (Keychain on iOS, Keystore-backed EncryptedSharedPreferences on Android).
import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const URL = Constants.expoConfig?.extra?.supabaseUrl
  ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const KEY = Constants.expoConfig?.extra?.supabaseAnonKey
  ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(URL, KEY, {
  auth: {
    storage: secureStoreAdapter as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export async function signOut() {
  await supabase.auth.signOut();
}
