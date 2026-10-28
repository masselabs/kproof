import React, {useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';
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
import {ConfirmSheet, Icon, Txt} from '../ui/components';
import {biometryLabel} from '../ui/describe';
import {useCurrentLanguage} from '../i18n';
import {languageOption} from '../i18n/languages';
import {TAB_SCROLL_BOTTOM, colors} from '../ui/theme';

const pkg = require('../../package.json') as {version: string};

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * One settings row. A row that opens another screen ends in a chevron; a
 * destructive row (danger) leads with a red trash icon, as in the ZKProofport
 * app's settings, and opens a ConfirmSheet rather than acting at once.
 */
function Row(props: {title: string; sub?: string; right?: string; badge?: string; onPress?: () => void; chevron?: boolean; danger?: boolean; last?: boolean; testID?: string}) {
  const body = (
    <View style={[styles.row, !props.last && styles.rowLine]}>
      {props.danger ? <Icon name="trash" size={20} color={colors.red} /> : null}
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
        <Txt size={15} color={colors.muted} style={styles.right} numberOfLines={1}>
          {props.right}
        </Txt>
      ) : null}
      {props.chevron ? <Icon name="chevronRight" size={18} color={colors.faint} /> : null}
    </View>
  );
  return props.onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[props.title, props.right].filter(Boolean).join(', ')}
      onPress={props.onPress}
      testID={props.testID}
      style={({pressed}) => ({opacity: pressed ? 0.6 : 1})}>
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

  // A second tap on confirm, before the sheet has closed, must not wipe twice.
  const wiping = useRef(false);
  const wipe = async () => {
    setConfirm(false);
    if (wiping.current) return;
    wiping.current = true;
    try {
      await writeVault(keychain, EMPTY_VAULT);
      session.setVault(EMPTY_VAULT);
      await clearHistory(kv);
    } catch (err) {
      const e = toAppError(err, 'E5001');
      session.showError(e.code, e.detail);
    } finally {
      wiping.current = false;
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Txt weight="bold" size={26}>
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
          <Row title={t('settings.reimport')} chevron onPress={() => nav.navigate('AddId')} testID="settings-reimport" />
          <Row title={t('settings.deleteAll')} danger onPress={() => setConfirm(true)} testID="settings-delete-all" last />
        </View>

        <Txt weight="bold" size={13} color={colors.muted}>
          {t('settings.general')}
        </Txt>
        <View style={styles.panel}>
          <Row title={t('settings.language')} right={languageOption(language).label} chevron onPress={() => nav.navigate('SettingsLanguage')} testID="settings-language" last />
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

      <ConfirmSheet
        visible={confirm}
        title={t('settings.deleteConfirmTitle')}
        body={t('settings.deleteConfirmBody')}
        confirmLabel={t('settings.deleteConfirm')}
        cancelLabel={t('settings.deleteCancel')}
        onConfirm={wipe}
        onCancel={() => setConfirm(false)}
        testID="delete-all-sheet"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.paper},
  scroll: {padding: 16, paddingTop: 12, paddingBottom: TAB_SCROLL_BOTTOM, gap: 8},
  panel: {backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 12, marginBottom: 12},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 14, paddingHorizontal: 16},
  right: {flexShrink: 1, textAlign: 'right'},
  rowLine: {borderBottomWidth: 1, borderBottomColor: colors.line},
  flex: {flex: 1},
  badge: {backgroundColor: colors.blueTint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4},
  footer: {textAlign: 'center', marginTop: 12},
});
