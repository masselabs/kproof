import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTranslation} from 'react-i18next';
import {CIRCUIT_IDS, type CircuitId} from '../config/circuits';
import {RelayError} from '@kproof/sdk';
import {kv} from '../app/deps';
import {handleIncomingUrl} from '../app/deepLinks';
import {BUILD_ENV} from '../config/buildEnv';
import {SI_DO, firstAddressToken, isSiDo, type SiDo} from '../domain/regions';
import {AppError, toAppError} from '../errors';
import {createInAppRequest, type InAppAsk} from '../services/inAppProof';
import {initialCard, nextCard, readPrefs, writePrefs, type CardPrefs} from '../state/prefs';
import {session, useSession} from '../state/session';
import {OutlineButton, Panel, Txt} from '../ui/components';
import {cardColor, cardPlain, regionName} from '../ui/describe';
import {colors} from '../ui/theme';

/** Thresholds offered for an in-app age proof. */
export const IN_APP_AGES = [14, 19, 20, 65] as const;

function relayErrorCode(err: unknown): AppError {
  if (err instanceof RelayError) {
    if (err.kind === 'network') return new AppError('E3001', `relay: ${err.message}`);
    if (err.kind === 'refused') return new AppError('E3002', `relay HTTP ${err.status}: ${err.message}`);
    return new AppError('E3003', `relay ${err.kind} (HTTP ${err.status}): ${err.message}`);
  }
  return toAppError(err, 'E3003');
}

export function ProofsScreen() {
  const {t} = useTranslation();
  const vault = useSession((s) => s.vault);
  const imported = (vault?.cards ?? []).map((c) => c.type);
  const [prefs, setPrefs] = useState<CardPrefs>({});
  const [age, setAge] = useState<number>(19);
  const ownRegion = (() => {
    const address = vault?.cards.find((c) => c.fields.address !== undefined)?.fields.address;
    const token = address === undefined ? undefined : firstAddressToken(address);
    return isSiDo(token) ? token : null;
  })();
  const [region, setRegion] = useState<SiDo | null>(null);
  const targetRegion = region ?? ownRegion;
  const [starting, setStarting] = useState<string | null>(null);

  const startInApp = async (ask: InAppAsk) => {
    setStarting(ask.circuitId);
    try {
      const created = await createInAppRequest({environment: BUILD_ENV, fetchImpl: fetch}, ask);
      console.log(`[in-app] request ${created.requestId} for ${created.circuitId}`);
      session.setInAppRequest(created);
      // The ordinary path from here: the same handler a link from a service goes through.
      await handleIncomingUrl(created.deepLink);
    } catch (err) {
      const e = relayErrorCode(err);
      session.showError(e.code, e.detail);
    } finally {
      setStarting(null);
    }
  };

  useEffect(() => {
    readPrefs(kv).then(setPrefs, (err) => console.log(`[prefs] read failed: ${String(err)}`));
  }, []);

  const cycle = useCallback(
    (circuit: CircuitId) => {
      const current = initialCard(prefs, circuit, imported);
      if (current === null) return;
      const next = {...prefs, [circuit]: nextCard(current, imported)};
      setPrefs(next);
      writePrefs(kv, next).catch((err) => console.log(`[prefs] write failed: ${String(err)}`));
    },
    [prefs, imported],
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Txt weight="bold" size={26}>
          {t('proofs.title')}
        </Txt>
        <Txt size={14} color={colors.muted}>
          {t('proofs.intro')}
        </Txt>
        <Panel style={styles.howTo}>
          <Txt size={14}>{t('proofs.howTo')}</Txt>
        </Panel>
        <Txt weight="bold" size={14} color={colors.muted} style={styles.label}>
          {t('proofs.canProve')}
        </Txt>
        {CIRCUIT_IDS.map((circuit) => {
          const card = initialCard(prefs, circuit, imported);
          return (
            <Panel key={circuit} style={styles.row}>
              <View style={styles.rowHead}>
                <Txt weight="bold" size={16}>
                  {t(`facts.${circuit}`)}
                </Txt>
                <Pressable accessibilityRole="button" style={styles.picker} onPress={() => cycle(circuit)} disabled={card === null}>
                  <View style={[styles.swatch, {backgroundColor: card === null ? colors.faint : cardColor(card)}]} />
                  <Txt weight="semibold" size={13}>
                    {card === null ? t('proofs.noCard') : `${cardPlain(card)} ▾`}
                  </Txt>
                </Pressable>
              </View>
              <Txt size={14} color={colors.muted}>
                {t(`factDesc.${circuit}`)}
              </Txt>
              {circuit === 'mdl_kr_age' ? (
                <View style={styles.options}>
                  {IN_APP_AGES.map((n) => (
                    <Pressable
                      key={n}
                      accessibilityRole="radio"
                      accessibilityState={{selected: age === n}}
                      onPress={() => setAge(n)}
                      style={[styles.option, age === n && styles.optionOn]}>
                      <Txt weight="semibold" size={13} color={age === n ? colors.white : colors.ink}>
                        {t('proofs.ageOption', {age: n})}
                      </Txt>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {circuit === 'mdl_kr_region' ? (
                <View style={styles.options}>
                  {SI_DO.map((r) => (
                    <Pressable
                      key={r}
                      accessibilityRole="radio"
                      accessibilityState={{selected: targetRegion === r}}
                      onPress={() => setRegion(r)}
                      style={[styles.option, targetRegion === r && styles.optionOn]}>
                      <Txt weight="semibold" size={13} color={targetRegion === r ? colors.white : colors.ink}>
                        {regionName(r)}
                      </Txt>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {card === null ? null : (
                <OutlineButton
                  label={starting === circuit ? t('proofs.starting') : t('proofs.tryInApp')}
                  onPress={() => {
                    if (starting !== null) return;
                    if (circuit === 'mdl_kr_ownership') void startInApp({circuitId: circuit});
                    else if (circuit === 'mdl_kr_age') void startInApp({circuitId: circuit, ageThreshold: age});
                    else if (targetRegion === null) session.showError('E1005', 'pick a si/do first');
                    else void startInApp({circuitId: circuit, targetRegion});
                  }}
                />
              )}
            </Panel>
          );
        })}
        <Txt size={12} color={colors.muted}>
          {t('proofs.pickNote')}
        </Txt>
        <Txt size={12} color={colors.muted}>
          {t('proofs.inAppNote')}
        </Txt>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.paper},
  scroll: {padding: 16, paddingTop: 12, gap: 10},
  howTo: {padding: 16},
  label: {marginTop: 8},
  row: {padding: 16, gap: 8},
  rowHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8},
  picker: {
    height: 32,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    backgroundColor: colors.paper,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  swatch: {width: 8, height: 8, borderRadius: 999},
  options: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  option: {borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.paper},
  optionOn: {backgroundColor: colors.blue, borderColor: colors.blue},
});
