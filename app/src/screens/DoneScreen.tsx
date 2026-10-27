import React from 'react';
import {Linking, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {ko} from '../i18n/ko';
import {session, useSession} from '../state/session';
import type {RootStackParamList} from '../navigation/types';
import {Icon, PrimaryButton, TextButton, Txt} from '../ui/components';
import {cardName, dateDots, shortWhat} from '../ui/describe';
import {colors} from '../ui/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function DoneScreen() {
  const nav = useNavigation<Nav>();
  const {params} = useRoute<RouteProp<RootStackParamList, 'Done'>>();
  const request = useSession((s) => s.pendingRequest);
  if (!request) return <View style={styles.root} />;
  const who = request.dappName ?? ko.request.unnamed;
  const what = shortWhat(request.inputs);
  const at = new Date(params.at);

  const finish = (to: 'Home' | 'History') => {
    session.setPendingRequest(null);
    nav.navigate('Tabs', {screen: to});
  };

  const back = async () => {
    const scheme = request.returnScheme;
    finish('Home');
    if (scheme !== undefined) {
      try {
        await Linking.openURL(scheme);
      } catch (err) {
        console.log(`[done] could not open the requester's scheme: ${String(err)}`);
      }
    }
  };

  const rows: Array<[string, string]> = [
    [ko.done.to, who],
    [ko.done.what, what],
    [ko.done.card, cardName(params.card)],
    [ko.done.took, ko.done.seconds((params.provingMs / 1000).toFixed(1))],
    [ko.done.at, `${dateDots(params.at)} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`],
  ];

  return (
    <SafeAreaView style={styles.root} testID="done-screen">
      <View style={styles.badge}>
        <Icon name="check" size={48} color={colors.white} />
      </View>
      <Txt weight="bold" size={26} style={styles.center}>
        {ko.done.title}
      </Txt>
      <Txt size={15} color={colors.muted} style={styles.center}>
        {ko.done.body(who, what)}
      </Txt>
      <View style={styles.table}>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.row}>
            <Txt size={14} color={colors.muted}>
              {k}
            </Txt>
            <Txt size={14}>{v}</Txt>
          </View>
        ))}
      </View>
      <View style={styles.flex} />
      <View style={styles.footer}>
        <PrimaryButton label={request.returnScheme !== undefined ? ko.done.back : ko.done.home} onPress={back} />
        <TextButton label={ko.done.history} color={colors.blue} onPress={() => finish('History')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.paper, paddingHorizontal: 24, alignItems: 'center', gap: 16},
  badge: {
    marginTop: 96,
    width: 96,
    height: 96,
    borderRadius: 999,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {textAlign: 'center'},
  table: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  row: {flexDirection: 'row', justifyContent: 'space-between', gap: 16},
  flex: {flex: 1},
  footer: {alignSelf: 'stretch', gap: 4, paddingBottom: 8},
});
