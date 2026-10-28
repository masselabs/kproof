import React, {useState} from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useTranslation} from 'react-i18next';
import {BUILD_ENV, currentEnv} from '../config/buildEnv';
import {kv} from '../app/deps';
import {toAppError} from '../errors';
import {clearHistory} from '../services/history';
import {keychain} from '../services/keychainAdapter';
import {EMPTY_VAULT, writeVault} from '../services/vault';
import {session, useSession} from '../state/session';
import type {RootStackParamList} from '../navigation/types';
import {PrimaryButton, TextButton, Txt} from '../ui/components';
import {biometryLabel} from '../ui/describe';
import {useCurrentLanguage} from '../i18n';
import {languageOption} from '../i18n/languages';
import {colors} from '../ui/theme';

const pkg = require('../../package.json') as {version: string};

type Nav = NativeStackNavigationProp<RootStackParamList>;

function Row(props: {title: string; sub?: string; right?: string; badge?: string; onPress?: () => void; danger?: boolean; last?: boolean; testID?: string}) {
  const body = (
    <View style={[styles.row, !props.last && styles.rowLine]}>
      <View style={styles.flex}>
        <Txt weight="semibold" size={16} color={props.danger ? colors.red : colors.ink}>
          {props.title}
        </Txt>
        {props.sub ? (
          <Txt size={13} color={colors.muted}>
            {props.sub}
          </Txt>
        ) : null}
      </View>
      {props.badge ? (
        <View style={styles.badge}>
          <Txt weight="bold" size={13} color={colors.blue}>
            {props.badge}
          </Txt>
        </View>
      ) : null}
      {props.right ? (
        <Txt size={15} color={colors.muted}>
          {props.right}
        </Txt>
      ) : null}
    </View>
  );
  return props.onPress ? (
    <Pressable accessibilityRole="button" onPress={props.onPress} testID={props.testID}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function SettingsScreen() {
  const {t} = useTranslation();
  const language = useCurrentLanguage();
  const nav = useNavigation<Nav>();
  const security = useSession((s) => s.security);
  const [confirm, setConfirm] = useState(false);
  const kind =
    security?.kind === 'passcode' ? t('settings.passcode') : biometryLabel(security?.kind === 'biometry' ? security.biometry : '');

  const wipe = async () => {
    setConfirm(false);
    try {
      await writeVault(keychain, EMPTY_VAULT);
      session.setVault(EMPTY_VAULT);
      await clearHistory(kv);
    } catch (err) {
      const e = toAppError(err, 'E5001');
      session.showError(e.code, e.detail);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Txt weight="bold" size={24}>
          {t('settings.title')}
        </Txt>

        <Txt weight="bold" size={13} color={colors.muted}>
          {t('settings.security')}
        </Txt>
        <View style={styles.panel}>
          <Row title={t('settings.lockOnOpen', {kind})} sub={t('settings.always')} badge={t('settings.required')} />
          <Row title={t('settings.relockAfter')} right={t('settings.oneMinute')} />
          <Row title={t('settings.reauthEachProof')} sub={t('settings.alwaysOn')} badge={t('settings.required')} last />
        </View>

        <Txt weight="bold" size={13} color={colors.muted}>
          {t('settings.cards')}
        </Txt>
        <View style={styles.panel}>
          <Row title={t('settings.reimport')} right="›" onPress={() => nav.navigate('AddId')} />
          <Row title={t('settings.deleteAll')} danger onPress={() => setConfirm(true)} last />
        </View>

        <Txt weight="bold" size={13} color={colors.muted}>
          {t('settings.general')}
        </Txt>
        <View style={styles.panel}>
          <Row title={t('settings.language')} right={`${languageOption(language).label}  ›`} onPress={() => nav.navigate('SettingsLanguage')} testID="settings-language" last />
        </View>

        <Txt weight="bold" size={13} color={colors.muted}>
          {t('settings.info')}
        </Txt>
        <View style={styles.panel}>
          <Row title={t('settings.environment')} right={BUILD_ENV} />
          <Row title={t('settings.circuits')} right={`${currentEnv().circuits.repo}@${currentEnv().circuits.commit.slice(0, 7)}`} />
          <Row title={t('settings.version')} right={pkg.version} last />
        </View>

        <Txt size={12} color={colors.muted} style={styles.footer}>
          {t('settings.footer')}
        </Txt>
      </ScrollView>

      <Modal transparent visible={confirm} animationType="fade" onRequestClose={() => setConfirm(false)}>
        <View style={styles.scrim}>
          <View style={styles.sheet}>
            <Txt weight="bold" size={20}>
              {t('settings.deleteConfirmTitle')}
            </Txt>
            <Txt size={15} color={colors.muted}>
              {t('settings.deleteConfirmBody')}
            </Txt>
            <PrimaryButton label={t('settings.deleteConfirm')} color={colors.red} onPress={wipe} />
            <TextButton label={t('settings.deleteCancel')} onPress={() => setConfirm(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.paper},
  scroll: {padding: 16, paddingTop: 12, gap: 8},
  panel: {backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 12, marginBottom: 12},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16},
  rowLine: {borderBottomWidth: 1, borderBottomColor: colors.line},
  flex: {flex: 1},
  badge: {backgroundColor: colors.blueTint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4},
  footer: {textAlign: 'center', marginTop: 12},
  scrim: {flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end'},
  sheet: {backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 12},
});
