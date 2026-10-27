import React, {useState} from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {ko} from '../i18n/ko';
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
import {colors} from '../ui/theme';

const pkg = require('../../package.json') as {version: string};

type Nav = NativeStackNavigationProp<RootStackParamList>;

function Row(props: {title: string; sub?: string; right?: string; badge?: string; onPress?: () => void; danger?: boolean; last?: boolean}) {
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
    <Pressable accessibilityRole="button" onPress={props.onPress}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function SettingsScreen() {
  const nav = useNavigation<Nav>();
  const security = useSession((s) => s.security);
  const [confirm, setConfirm] = useState(false);
  const kind =
    security?.kind === 'passcode' ? ko.settings.passcode : biometryLabel(security?.kind === 'biometry' ? security.biometry : '');

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
          {ko.settings.title}
        </Txt>

        <Txt weight="bold" size={13} color={colors.muted}>
          {ko.settings.security}
        </Txt>
        <View style={styles.panel}>
          <Row title={ko.settings.lockOnOpen(kind)} sub={ko.settings.always} badge={ko.settings.required} />
          <Row title={ko.settings.relockAfter} right={ko.settings.oneMinute} />
          <Row title={ko.settings.reauthEachProof} sub={ko.settings.alwaysOn} badge={ko.settings.required} last />
        </View>

        <Txt weight="bold" size={13} color={colors.muted}>
          {ko.settings.cards}
        </Txt>
        <View style={styles.panel}>
          <Row title={ko.settings.reimport} right="›" onPress={() => nav.navigate('AddId')} />
          <Row title={ko.settings.deleteAll} danger onPress={() => setConfirm(true)} last />
        </View>

        <Txt weight="bold" size={13} color={colors.muted}>
          {ko.settings.info}
        </Txt>
        <View style={styles.panel}>
          <Row title={ko.settings.environment} right={BUILD_ENV} />
          <Row title={ko.settings.circuits} right={`${currentEnv().circuits.repo}@${currentEnv().circuits.commit.slice(0, 7)}`} />
          <Row title={ko.settings.version} right={pkg.version} last />
        </View>

        <Txt size={12} color={colors.muted} style={styles.footer}>
          {ko.settings.footer}
        </Txt>
      </ScrollView>

      <Modal transparent visible={confirm} animationType="fade" onRequestClose={() => setConfirm(false)}>
        <View style={styles.scrim}>
          <View style={styles.sheet}>
            <Txt weight="bold" size={20}>
              {ko.settings.deleteConfirmTitle}
            </Txt>
            <Txt size={15} color={colors.muted}>
              {ko.settings.deleteConfirmBody}
            </Txt>
            <PrimaryButton label={ko.settings.deleteConfirm} color={colors.red} onPress={wipe} />
            <TextButton label={ko.settings.deleteCancel} onPress={() => setConfirm(false)} />
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
