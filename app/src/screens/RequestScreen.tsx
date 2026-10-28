import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useTranslation} from 'react-i18next';
import type {CardTypeKey} from '../config/cardTypes';
import {answerFlowDeps, kv} from '../app/deps';
import {canProve} from '../domain/predicates';
import {decline} from '../services/answerFlow';
import {outcomeErrorCode} from '../services/relayAnswer';
import {initialCard, nextCard, readPrefs} from '../state/prefs';
import {session, useSession} from '../state/session';
import type {RootStackParamList} from '../navigation/types';
import {Chip, Icon, Panel, PrimaryButton, Symbol, TextButton, Txt} from '../ui/components';
import {biometryLabel, cannotText, cardColor, cardName, factText, questionText, serviceName} from '../ui/describe';
import {colors} from '../ui/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** kproof-server answers `expired` 280 s after the request was created (REQUEST_DEADLINE_MS). */
export const RELAY_DEADLINE_MS = 280_000;

export function RequestScreen() {
  const {t} = useTranslation();
  const nav = useNavigation<Nav>();
  const request = useSession((s) => s.pendingRequest);
  const vault = useSession((s) => s.vault);
  const security = useSession((s) => s.security);
  const imported = (vault?.cards ?? []).map((c) => c.type);
  const [card, setCard] = useState<CardTypeKey | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  // A double tap on approve opens one proving screen; set synchronously, cleared when this screen is shown again.
  const approving = useRef(false);
  useFocusEffect(
    useCallback(() => {
      approving.current = false;
    }, []),
  );

  useEffect(() => {
    if (!request) return;
    readPrefs(kv)
      .catch(() => ({}))
      .then((prefs) => setCard(initialCard(prefs, request.circuitId, imported)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.requestId, imported.join(',')]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!request) return <View style={styles.root} />;

  const remainingMs = Date.parse(request.createdAt) + RELAY_DEADLINE_MS - now;
  const remaining = Math.max(0, Math.floor(remainingMs / 1000));
  const stored = card === null ? undefined : vault?.cards.find((c) => c.type === card);
  const feasibility = stored === undefined ? null : canProve(
    {ci: stored.fields.ci, name: stored.fields.name, birth: stored.fields.birth, address: stored.fields.address},
    request.inputs,
    new Date().getFullYear(),
  );

  const onDecline = async (reason: string) => {
    setBusy(true);
    const outcome = await decline(answerFlowDeps, request, reason, card ?? undefined);
    setBusy(false);
    const code = outcomeErrorCode(outcome);
    // A decline that did not reach the relay is still a decline; the person learns it did not arrive.
    if (code !== null && code !== 'E1007') session.showError(code, `decline: ${outcome.kind}`);
    session.setPendingRequest(null);
    nav.navigate('Tabs', {screen: 'History'});
  };

  const approveLabel =
    security?.kind === 'passcode'
      ? t('request.approvePasscode')
      : t('request.approve', {kind: biometryLabel(security?.kind === 'biometry' ? security.biometry : '')});

  return (
    <SafeAreaView style={styles.root} testID="request-screen">
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.topRow}>
          <Txt weight="bold" size={13} color={colors.red}>
            {t('request.badge')}
          </Txt>
          <Txt size={13} color={colors.muted}>
            {remaining > 0 ? t('request.remaining', {minutes: Math.floor(remaining / 60), seconds: String(remaining % 60).padStart(2, '0')}) : t('request.expiredBadge')}
          </Txt>
        </View>

        <View style={styles.who}>
          <View style={styles.whoIcon}>
            <Symbol size={24} />
          </View>
          <Txt weight="bold" size={17}>
            {serviceName(request.dappName)}
          </Txt>
        </View>

        <Txt weight="bold" size={28} style={styles.question}>
          {questionText(request.inputs)}
        </Txt>
        {request.inputs.circuitId === 'mdl_kr_age' ? (
          <Txt size={13} color={colors.muted}>
            {t('request.ageBasis')}
          </Txt>
        ) : null}

        {card === null ? (
          <Panel style={styles.box}>
            <Txt weight="bold" size={16}>
              {t('request.noCardTitle')}
            </Txt>
            <Txt size={14} color={colors.muted}>
              {t('request.noCardBody')}
            </Txt>
          </Panel>
        ) : (
          <Pressable
            accessibilityRole="button"
            style={[styles.box, styles.cardPick]}
            onPress={() => setCard(nextCard(card, imported))}>
            <View style={styles.cardPickLeft}>
              <View style={[styles.cardSwatch, {backgroundColor: cardColor(card)}]} />
              <Txt weight="semibold" size={15}>
                {t('request.useCard', {card: cardName(card)})}
              </Txt>
            </View>
            {imported.length > 1 ? (
              <Txt weight="semibold" size={14} color={colors.blue}>
                {t('request.change')}
              </Txt>
            ) : null}
          </Pressable>
        )}

        {feasibility !== null && !feasibility.ok ? (
          <Panel style={[styles.box, styles.warn]}>
            <Txt weight="bold" size={15} color={colors.red}>
              {t('request.cannotTitle')}
            </Txt>
            <Txt size={14}>{cannotText(feasibility.why, request.inputs)}</Txt>
          </Panel>
        ) : null}

        <Panel style={styles.box}>
          <Txt weight="bold" size={14} color={colors.blue}>
            {t('request.sends')}
          </Txt>
          <View style={styles.line}>
            <Icon name="check" size={20} color={colors.blue} />
            <Txt size={15} style={styles.flex}>
              {factText(request.inputs)}
            </Txt>
          </View>
          <View style={styles.line}>
            <Icon name="check" size={20} color={colors.blue} />
            <View style={styles.flex}>
              <Txt size={15}>{t('request.sendsNullifier')}</Txt>
              <Txt size={13} color={colors.muted}>
                {t('request.sendsNullifierNote')}
              </Txt>
            </View>
          </View>
        </Panel>

        <Panel style={styles.box}>
          <Txt weight="bold" size={14} color={colors.muted}>
            {t('request.notSent')}
          </Txt>
          <View style={styles.chips}>
            {t('request.notSentItems', {returnObjects: true}).map((i) => (
              <Chip key={i} label={i} tone="grey" />
            ))}
          </View>
        </Panel>

        {request.message !== undefined ? (
          <Panel style={styles.box}>
            <Txt weight="bold" size={14} color={colors.muted}>
              {t('request.message')}
            </Txt>
            <Txt size={15}>{request.message}</Txt>
          </Panel>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {card === null ? (
          <PrimaryButton label={t('request.goAdd')} onPress={() => nav.navigate('AddId')} />
        ) : (
          <PrimaryButton
            testID="approve"
            label={approveLabel}
            icon={<Icon name="face" size={20} color={colors.white} />}
            disabled={busy || feasibility === null || !feasibility.ok}
            onPress={() => {
              if (approving.current) return;
              approving.current = true;
              session.startProving(request.requestId);
              nav.navigate('Proving', {card});
            }}
          />
        )}
        <TextButton testID="decline" label={t('request.decline')} onPress={() => onDecline('The person declined the request')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.paper},
  scroll: {padding: 20, gap: 16},
  topRow: {flexDirection: 'row', justifyContent: 'space-between'},
  who: {flexDirection: 'row', alignItems: 'center', gap: 12},
  whoIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  question: {lineHeight: 38},
  box: {backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 16, gap: 10},
  warn: {borderColor: colors.red},
  cardPick: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  cardPickLeft: {flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1},
  cardSwatch: {width: 28, height: 18, borderRadius: 3},
  line: {flexDirection: 'row', gap: 10, alignItems: 'flex-start'},
  flex: {flex: 1},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  footer: {paddingHorizontal: 20, paddingBottom: 8, gap: 4},
});
