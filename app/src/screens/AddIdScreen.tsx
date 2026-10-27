import React, {useRef, useState} from 'react';
import {ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {ko} from '../i18n/ko';
import {CARD_ORDER, REQUEST_PROVIDER, type CardTypeKey} from '../config/cardTypes';
import {idImportDeps} from '../app/deps';
import {toAppError} from '../errors';
import {CardMismatchError, cardFromAnswer} from '../services/importCard';
import {keychain} from '../services/keychainAdapter';
import {runIdImport} from '../services/idImport';
import {withCard, writeVault} from '../services/vault';
import {session, useSession} from '../state/session';
import {Icon, PrimaryButton, TextButton, Txt} from '../ui/components';
import {cardColor, cardName} from '../ui/describe';
import {colors} from '../ui/theme';

export const IMPORT_TIMEOUT_MS = 180_000;
export const IMPORT_POLL_MS = 3_000;

export function AddIdScreen() {
  const nav = useNavigation();
  const vault = useSession((s) => s.vault);
  const [running, setRunning] = useState(false);
  const [choice, setChoice] = useState<CardTypeKey | null>(null);
  const abort = useRef<AbortController | null>(null);

  const start = async () => {
    if (choice === null) return;
    const requested = choice;
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    try {
      const data = await runIdImport(idImportDeps(), {
        provider: REQUEST_PROVIDER,
        signal: controller.signal,
        timeoutMs: IMPORT_TIMEOUT_MS,
        pollIntervalMs: IMPORT_POLL_MS,
      });
      const card = cardFromAnswer(data, new Date(), requested);
      // The person may have been away long enough for the app to lock; the
      // card is written only into the vault they unlock again.
      const current = await session.whenUnlocked();
      const next = withCard(current, card);
      await writeVault(keychain, next);
      session.setVault(next);
      nav.goBack();
    } catch (err) {
      if (err instanceof CardMismatchError) {
        session.showError('E6007', ko.addId.mismatch(cardName(err.chose), cardName(err.received), err.detail));
      } else {
        const e = toAppError(err, 'E6001');
        session.showError(e.code, e.detail);
      }
    } finally {
      abort.current = null;
      setRunning(false);
    }
  };

  const cancel = () => abort.current?.abort();

  return (
    <SafeAreaView style={styles.root} testID="addid-screen">
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable accessibilityRole="button" accessibilityLabel={ko.addId.back} style={styles.back} onPress={() => nav.goBack()}>
          <Icon name="back" />
        </Pressable>
        <Txt weight="bold" size={26} style={styles.title}>
          {ko.addId.title}
        </Txt>
        <Txt size={15} color={colors.muted}>
          {ko.addId.intro}
        </Txt>
        <Txt weight="bold" size={13} color={colors.muted}>
          {ko.addId.pick}
        </Txt>
        {CARD_ORDER.map((key) => {
          const selected = choice === key;
          const has = vault?.cards.some((c) => c.type === key) === true;
          const note = has ? ko.addId.already : ko.addId.sourceApp;
          return (
            <Pressable
              key={key}
              testID={`addid-choice-${key}`}
              accessibilityRole="radio"
              accessibilityState={{selected, disabled: running}}
              disabled={running}
              onPress={() => setChoice(key)}
              style={[styles.option, selected && styles.optionSelected]}>
              <View style={[styles.swatch, {backgroundColor: cardColor(key)}]} />
              <View style={styles.flex}>
                <Txt weight="bold" size={15}>
                  {cardName(key)}
                </Txt>
                <Txt size={12} color={colors.muted}>
                  {note}
                </Txt>
              </View>
              <Icon name={selected ? 'check' : 'dot'} size={20} color={selected ? colors.blue : colors.line} />
            </Pressable>
          );
        })}
        <Txt size={13} color={colors.ink}>
          {ko.addId.representative}
        </Txt>
        <View style={styles.steps}>
          {ko.addId.steps.map((s, i) => (
            <Txt key={s} size={14} color={colors.muted}>
              {`${i + 1}. ${s}`}
            </Txt>
          ))}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton label={choice === null ? ko.addId.pickFirst : ko.addId.open} onPress={start} disabled={choice === null || running} />
      </View>

      <Modal transparent visible={running} animationType="fade" onRequestClose={cancel}>
        <View style={styles.scrim}>
          <View style={styles.sheet} testID="addid-waiting">
            <ActivityIndicator size="large" color={colors.blue} />
            <Txt weight="bold" size={18} style={styles.center}>
              {ko.addId.waiting}
            </Txt>
            <Txt size={14} color={colors.muted} style={styles.center}>
              {ko.addId.waitingNote}
            </Txt>
            <TextButton label={ko.addId.cancel} onPress={cancel} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.paper},
  scroll: {padding: 20, gap: 12},
  back: {width: 44, height: 44, justifyContent: 'center'},
  title: {lineHeight: 36},
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
  },
  optionSelected: {borderColor: colors.blue, borderWidth: 2},
  swatch: {width: 36, height: 24, borderRadius: 4},
  flex: {flex: 1},
  steps: {gap: 6, marginTop: 4},
  footer: {paddingHorizontal: 20, paddingBottom: 8, gap: 4},
  center: {textAlign: 'center'},
  scrim: {flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end'},
  sheet: {backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 12},
});
