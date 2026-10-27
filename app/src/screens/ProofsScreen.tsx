import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ko} from '../i18n/ko';
import {CIRCUIT_IDS, type CircuitId} from '../config/circuits';
import {kv} from '../app/deps';
import {initialCard, nextCard, readPrefs, writePrefs, type CardPrefs} from '../state/prefs';
import {useSession} from '../state/session';
import {Panel, Txt} from '../ui/components';
import {cardColor, cardPlain} from '../ui/describe';
import {colors} from '../ui/theme';

export function ProofsScreen() {
  const vault = useSession((s) => s.vault);
  const imported = (vault?.cards ?? []).map((c) => c.type);
  const [prefs, setPrefs] = useState<CardPrefs>({});

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
          {ko.proofs.title}
        </Txt>
        <Txt size={14} color={colors.muted}>
          {ko.proofs.intro}
        </Txt>
        <Panel style={styles.howTo}>
          <Txt size={14}>{ko.proofs.howTo}</Txt>
        </Panel>
        <Txt weight="bold" size={14} color={colors.muted} style={styles.label}>
          {ko.proofs.canProve}
        </Txt>
        {CIRCUIT_IDS.map((circuit) => {
          const card = initialCard(prefs, circuit, imported);
          return (
            <Panel key={circuit} style={styles.row}>
              <View style={styles.rowHead}>
                <Txt weight="bold" size={16}>
                  {ko.facts[circuit]}
                </Txt>
                <Pressable accessibilityRole="button" style={styles.picker} onPress={() => cycle(circuit)} disabled={card === null}>
                  <View style={[styles.swatch, {backgroundColor: card === null ? colors.faint : cardColor(card)}]} />
                  <Txt weight="semibold" size={13}>
                    {card === null ? ko.proofs.noCard : `${cardPlain(card)} ▾`}
                  </Txt>
                </Pressable>
              </View>
              <Txt size={14} color={colors.muted}>
                {ko.factDesc[circuit]}
              </Txt>
            </Panel>
          );
        })}
        <Txt size={12} color={colors.muted}>
          {ko.proofs.pickNote}
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
});
