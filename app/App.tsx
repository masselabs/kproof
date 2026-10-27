import React, {useEffect} from 'react';
import {AppState, Linking, StatusBar, StyleSheet, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationContainer, createNavigationContainerRef, DefaultTheme} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {ko} from './src/i18n/ko';
import {handleIncomingUrl} from './src/app/deepLinks';
import {session, useSession} from './src/state/session';
import type {RootStackParamList, TabParamList} from './src/navigation/types';
import {ErrorModal} from './src/ui/ErrorModal';
import {Icon} from './src/ui/components';
import {colors, font} from './src/ui/theme';
import {LockScreen} from './src/screens/LockScreen';
import {HomeScreen} from './src/screens/HomeScreen';
import {ProofsScreen} from './src/screens/ProofsScreen';
import {HistoryScreen} from './src/screens/HistoryScreen';
import {SettingsScreen} from './src/screens/SettingsScreen';
import {AddIdScreen} from './src/screens/AddIdScreen';
import {RequestScreen} from './src/screens/RequestScreen';
import {ProvingScreen} from './src/screens/ProvingScreen';
import {DoneScreen} from './src/screens/DoneScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

const theme = {...DefaultTheme, colors: {...DefaultTheme.colors, background: colors.paper, primary: colors.blue}};

const TAB_ICONS = {Home: 'card', Proofs: 'shield', History: 'history', Settings: 'gear'} as const;

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: {fontFamily: font.semibold, fontSize: 12},
        tabBarStyle: {backgroundColor: colors.card, borderTopColor: colors.line},
        tabBarIcon: ({color}) => <Icon name={TAB_ICONS[route.name]} color={color} />,
      })}>
      <Tab.Screen name="Home" component={HomeScreen} options={{title: ko.tabs.home}} />
      <Tab.Screen name="Proofs" component={ProofsScreen} options={{title: ko.tabs.proofs}} />
      <Tab.Screen name="History" component={HistoryScreen} options={{title: ko.tabs.history}} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{title: ko.tabs.settings}} />
    </Tab.Navigator>
  );
}

function useAppLifecycle() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') session.background(Date.now());
      if (next === 'active') session.foreground(Date.now());
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then(
      (url) => {
        if (url) handleIncomingUrl(url);
      },
      (err) => console.log(`[link] initial URL failed: ${String(err)}`),
    );
    const sub = Linking.addEventListener('url', ({url}) => handleIncomingUrl(url));
    return () => sub.remove();
  }, []);
}

/** Shows a waiting request once the app is unlocked and navigation is ready. */
function useRequestRouting(ready: boolean) {
  const locked = useSession((s) => s.lock.locked);
  const pending = useSession((s) => s.pendingRequest?.requestId);
  useEffect(() => {
    if (!ready || locked || pending === undefined || !navigationRef.isReady()) return;
    const route = navigationRef.getCurrentRoute()?.name;
    if (route === 'Request' || route === 'Proving' || route === 'Done') return;
    navigationRef.navigate('Request');
  }, [ready, locked, pending]);
}

export default function App() {
  const locked = useSession((s) => s.lock.locked);
  const [ready, setReady] = React.useState(false);
  useAppLifecycle();
  useRequestRouting(ready);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />
      <View style={styles.root}>
        <NavigationContainer ref={navigationRef} theme={theme} onReady={() => setReady(true)}>
          <Stack.Navigator screenOptions={{headerShown: false, contentStyle: {backgroundColor: colors.paper}}}>
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen name="AddId" component={AddIdScreen} />
            <Stack.Screen name="Request" component={RequestScreen} options={{gestureEnabled: false}} />
            <Stack.Screen name="Proving" component={ProvingScreen} options={{gestureEnabled: false}} />
            <Stack.Screen name="Done" component={DoneScreen} options={{gestureEnabled: false}} />
          </Stack.Navigator>
        </NavigationContainer>
        {locked ? <LockScreen /> : null}
        <ErrorModal />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({root: {flex: 1, backgroundColor: colors.paper}});
