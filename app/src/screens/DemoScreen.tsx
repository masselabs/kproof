import React from 'react';
import {Linking, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {useTranslation} from 'react-i18next';
import {currentEnv} from '../config/buildEnv';
import {session} from '../state/session';
import {Icon, PrimaryButton, Txt} from '../ui/components';
import {colors} from '../ui/theme';

/** What the demo site lets a person try, in the order the site offers them. */
export const DEMO_TRIES = ['demo.tryAge', 'demo.tryIdentity', 'demo.tryRegion'] as const;

/** Opens this build's demo site in the browser; a failure is shown, never swallowed. */
export async function openDemoSite(url: string, openURL: (u: string) => Promise<unknown> = (u) => Linking.openURL(u)): Promise<void> {
  try {
    await openURL(url);
  } catch (err) {
    session.showError('E3004', `demo site did not open: ${String(err)}`);
  }
}

/**
 * Introduces the demo site of this build's environment and opens it. Reached
 * from the home screen only when the environment has one; without one, the
 * screen shows no button.
 */
export function DemoScreen() {
  const nav = useNavigation();
  const {t} = useTranslation();
  const url = currentEnv().demoUrl;

  return (
    <SafeAreaView style={styles.root} testID="demo-screen">
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('settings.back')} style={styles.back} onPress={() => nav.goBack()} testID="demo-back">
          <Icon name="back" />
        </Pressable>
        <Txt weight="bold" size={24}>
          {t('demo.title')}
        </Txt>
        <Txt size={15} color={colors.muted}>
          {t('demo.body')}
        </Txt>
        <View style={styles.panel}>
          <Txt weight="bold" size={15} style={styles.panelTitle}>
            {t('demo.tryTitle')}
          </Txt>
          {DEMO_TRIES.map((key) => (
            <View key={key} style={styles.row}>
              <Icon name="check" size={18} color={colors.blue} />
              <Txt weight="semibold" size={16} style={styles.flex}>
                {t(key)}
              </Txt>
            </View>
          ))}
        </View>
        {url === null ? null : (
          <View style={styles.open}>
            <PrimaryButton label={t('demo.open')} onPress={() => openDemoSite(url)} testID="demo-open" />
            <Txt size={13} color={colors.muted} style={styles.center}>
              {url.replace(/^https:\/\//, '')}
            </Txt>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.paper},
  scroll: {padding: 16, paddingTop: 4, gap: 12},
  back: {width: 44, height: 44, justifyContent: 'center'},
  panel: {backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingVertical: 8},
  panelTitle: {paddingHorizontal: 16, paddingVertical: 8},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 16},
  flex: {flex: 1},
  open: {gap: 8, marginTop: 8},
  center: {textAlign: 'center'},
});
