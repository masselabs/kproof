import React, {useEffect} from 'react';
import {AppState, Linking, Pressable, StatusBar, StyleSheet, View} from 'react-native';
import type {BottomTabBarButtonProps} from '@react-navigation/bottom-tabs';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {NavigationContainer, createNavigationContainerRef, DefaultTheme} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {ko} from './src/i18n/ko';
import {handleIncomingUrl} from './src/app/deepLinks';
import {session, useSession} from './src/state/session';
import type {RootStackParamList, TabParamList} from './src/navigation/types';
import {ErrorModal} from './src/ui/ErrorModal';
import {Icon, Txt} from './src/ui/components';
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
import {ScanScreen} from './src/screens/ScanScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

const theme = {...DefaultTheme, colors: {...DefaultTheme.colors, background: colors.paper, primary: colors.blue}};

const TAB_ICONS = {Home: 'card', Proofs: 'shield', ScanTab: 'scan', History: 'history', Settings: 'gear'} as const;

/** Never rendered: the scan tab opens the full-screen scanner instead. */
function NoScreen() {
  return null;
}

/** The raised round button in the middle of the tab bar. */
function ScanTabButton({onPress}: BottomTabBarButtonProps) {
  return (
    <Pressable
      testID="tab-scan"
      accessibilityRole="button"
      accessibilityLabel={ko.scan.title}
      onPress={onPress}
      style={styles.scanTab}>
      {({pressed}) => (
        <>
          <View style={[styles.scanCircle, pressed && styles.scanCirclePressed]}>
            <Icon name="scan" size={28} color={colors.white} />
          </View>
          <Txt weight="semibold" size={12} color={colors.blue}>
            {ko.tabs.scan}
          </Txt>
        </>
      )}
    </Pressable>
  );
}

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
      <Tab.Screen
        name="ScanTab"
        component={NoScreen}
        options={{title: ko.tabs.scan, tabBarButton: (props) => <ScanTabButton {...props} />}}
        listeners={({navigation}) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.getParent()?.navigate('Scan');
          },
        })}
      />
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
  const focus = useSession((s) => s.requestFocus);
  useEffect(() => {
    if (!ready || locked || pending === undefined || !navigationRef.isReady()) return;
    const route = navigationRef.getCurrentRoute()?.name;
    // The scanner replaces itself with the request (ScanScreen), so nothing stacks on it.
    if (route === 'Request' || route === 'Proving' || route === 'Done' || route === 'Scan') return;
    navigationRef.navigate('Request');
  }, [ready, locked, pending, focus]);
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
            <Stack.Screen name="Scan" component={ScanScreen} options={{animation: 'slide_from_bottom', gestureEnabled: false}} />
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

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.paper},
  scanTab: {flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 2},
  scanCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    marginTop: -26,
    marginBottom: 2,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.card,
    shadowColor: colors.blue,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  scanCirclePressed: {backgroundColor: colors.blueDark},
});
