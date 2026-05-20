import 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { supabase } from './src/lib/supabase';
import { TenantProvider, useTenant } from './src/lib/tenant';

import LoginScreen from './src/screens/LoginScreen';
import CaptureScreen from './src/screens/CaptureScreen';
import ReviewScreen from './src/screens/ReviewScreen';
import MyExpensesScreen from './src/screens/MyExpensesScreen';
import ApprovalQueueScreen from './src/screens/ApprovalQueueScreen';
import ApprovalDetailScreen from './src/screens/ApprovalDetailScreen';

const Tabs = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabsRoot() {
  const { tenant } = useTenant();
  const accent = tenant?.accentColor ?? '#1F3A5F';
  return (
    <Tabs.Navigator
      screenOptions={{
        tabBarActiveTintColor: accent,
        headerStyle: { backgroundColor: '#fff' },
        headerTitleStyle: { color: '#1a1f2e', fontWeight: '700' },
      }}>
      <Tabs.Screen name="Capture"   component={CaptureScreen}      options={{ tabBarLabel: '+ New' }} />
      <Tabs.Screen name="Expenses"  component={MyExpensesScreen}   options={{ tabBarLabel: 'My expenses' }} />
      <Tabs.Screen name="Approvals" component={ApprovalQueueScreen} options={{ tabBarLabel: 'Approvals' }} />
    </Tabs.Navigator>
  );
}

function Root() {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {authed ? (
          <>
            <Stack.Screen name="Tabs" component={TabsRoot} />
            <Stack.Screen name="Review" component={ReviewScreen} options={{ headerShown: true, title: 'Review & submit' }} />
            <Stack.Screen name="ApprovalDetail" component={ApprovalDetailScreen}
              options={{ headerShown: true, title: 'Approve' }} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <TenantProvider>
        <Root />
      </TenantProvider>
    </SafeAreaProvider>
  );
}
