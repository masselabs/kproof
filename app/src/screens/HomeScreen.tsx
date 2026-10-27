import React, {useState} from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import Svg, {Circle, Path} from 'react-native-svg';
import {ko} from '../i18n/ko';
import {CARD_ORDER, type CardTypeKey} from '../config/cardTypes';
import {CIRCUIT_IDS} from '../config/circuits';
import type {StoredCard} from '../services/importCard';
import {session, useSession} from '../state/session';
import {toAppError} from '../errors';
import {keychain} from '../services/keychainAdapter';
import {withoutCard, writeVault} from '../services/vault';
import type {RootStackParamList} from '../navigation/types';
import {Chip, Icon, OutlineButton, Panel, PrimaryButton, TextButton, Txt, Wordmark} from '../ui/components';
import {birthDots, cardColor, cardName, cardShort, dateDots, maskName} from '../ui/describe';
import {colors} from '../ui/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function facts(card: StoredCard): string[] {
  // Region needs an address on the card; the rest every card can prove.
  return CIRCUIT_IDS.filter((c) => c !== 'mdl_kr_region' || card.fields.address !== undefined).map((c) => ko.facts[c]);
}

function fieldRows(card: StoredCard, hidden: boolean): Array<{k: string; v: string}> {
  const f = card.fields;
  const rows: Array<{k: string; v: string}> = [
    {k: ko.home.fieldName, v: hidden ? maskName(f.name) : f.name},
    {k: ko.home.fieldBirth, v: hidden ? '••••.••.••' : birthDots(f.birth)},
  ];
  if (f.address !== undefined) rows.push({k: ko.home.fieldAddress, v: hidden ? '••••' : f.address});
  return rows;
}

export function HomeScreen() {
  const nav = useNavigation<Nav>();
  const vault = useSession((s) => s.vault);
  const cards = CARD_ORDER.map((k) => vault?.cards.find((c) => c.type === k)).filter((c): c is StoredCard => c !== undefined);
  const [front, setFront] = useState<CardTypeKey | null>(null);
  const [hidden, setHidden] = useState(true);
  const [factsOpen, setFactsOpen] = useState(false);
  const [removing, setRemoving] = useState<CardTypeKey | null>(null);

  const remove = async () => {
    const type = removing;
    setRemoving(null);
    if (type === null) return;
    try {
      // Written into the vault the person has unlocked; the in-memory copy follows the stored one.
      const current = await session.whenUnlocked();
      const next = withoutCard(current, type);
      await writeVault(keychain, next);
      session.setVault(next);
      setFront(null);
    } catch (err) {
      const e = toAppError(err, 'E5001');
      session.showError(e.code, e.detail);
    }
  };

  const frontCard = cards.find((c) => c.type === front) ?? cards[0];

  return (
    <SafeAreaView style={styles.root} edges={['top']} testID="home-screen">
      <View style={styles.header}>
        <Wordmark width={104} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={ko.home.addCard}
          style={styles.round}
          onPress={() => nav.navigate('AddId')}
          testID="add-card">
          <Icon name="plus" size={20} />
        </Pressable>
      </View>

      {frontCard === undefined ? (
        <View style={styles.empty}>
          <Txt weight="bold" size={20}>
            {ko.home.emptyTitle}
          </Txt>
          <Txt size={15} color={colors.muted}>
            {ko.home.emptyBody}
          </Txt>
          <PrimaryButton label={ko.home.addCard} onPress={() => nav.navigate('AddId')} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Panel style={styles.facts}>
            <Pressable accessibilityRole="button" style={styles.factsHead} onPress={() => setFactsOpen(!factsOpen)}>
              <Txt weight="bold" size={15}>
                {ko.home.factsTitle} <Txt weight="bold" size={15} color={colors.blue}>{ko.home.factsCount(facts(frontCard).length)}</Txt>
              </Txt>
              <Txt size={14} color={colors.muted}>
                {factsOpen ? ko.home.collapse : ko.home.expand}
              </Txt>
            </Pressable>
            {factsOpen ? (
              <View style={styles.chips}>
                {facts(frontCard).map((f) => (
                  <Chip key={f} label={f} tone="blue" />
                ))}
              </View>
            ) : null}
          </Panel>

          <View>
            {cards
              .filter((c) => c.type !== frontCard.type)
              .map((c) => (
                <Pressable
                  key={c.type}
                  accessibilityRole="button"
                  onPress={() => setFront(c.type)}
                  style={[styles.tab, {backgroundColor: cardColor(c.type)}]}>
                  <Txt weight="bold" size={15} color={colors.white}>
                    {cardName(c.type)}
                  </Txt>
                  <Txt weight="semibold" size={12} color={colors.white}>
                    {cardShort(c.type)}
                  </Txt>
                </Pressable>
              ))}
            <View style={styles.card}>
              <View style={[styles.cardHead, {backgroundColor: cardColor(frontCard.type)}]}>
                <Txt weight="bold" size={17} color={colors.white}>
                  {cardName(frontCard.type)}
                </Txt>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.photo}>
                  <Svg width={76} height={92} viewBox="0 0 88 104">
                    <Circle cx={44} cy={38} r={22} fill={colors.photoInk} />
                    <Path d="M4 104c2-24 18-38 40-38s38 14 40 38z" fill={colors.photoInk} />
                  </Svg>
                </View>
                <View style={styles.fields}>
                  {fieldRows(frontCard, hidden).map((r) => (
                    <View key={r.k}>
                      <Txt size={12} color={colors.muted}>
                        {r.k}
                      </Txt>
                      <Txt weight="bold" size={16}>
                        {r.v}
                      </Txt>
                    </View>
                  ))}
                </View>
              </View>
              <View style={styles.cardFoot}>
                <Txt size={12} color={colors.muted}>
                  {ko.home.receivedFrom(dateDots(frontCard.importedAt))}
                </Txt>
              </View>
            </View>
          </View>

          <View style={styles.actions}>
            <OutlineButton label={hidden ? ko.home.show : ko.home.hide} onPress={() => setHidden(!hidden)} style={styles.flex} />
            <Pressable
              accessibilityRole="button"
              style={styles.prove}
              onPress={() => nav.navigate('Tabs', {screen: 'Proofs'})}>
              <Txt weight="bold" size={15} color={colors.white}>
                {ko.home.prove}
              </Txt>
            </Pressable>
          </View>
          <TextButton label={ko.home.remove(cardName(frontCard.type))} color={colors.red} onPress={() => setRemoving(frontCard.type)} testID="remove-card" />
        </ScrollView>
      )}

      <Modal transparent visible={removing !== null} animationType="fade" onRequestClose={() => setRemoving(null)}>
        <View style={styles.scrim}>
          <View style={styles.sheet}>
            <Txt weight="bold" size={20}>
              {removing === null ? '' : ko.home.removeTitle(cardName(removing))}
            </Txt>
            <Txt size={15} color={colors.muted}>
              {ko.home.removeBody}
            </Txt>
            <PrimaryButton label={ko.home.removeConfirm} color={colors.red} onPress={remove} />
            <TextButton label={ko.home.removeCancel} onPress={() => setRemoving(null)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.paper},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12},
  round: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {padding: 24, gap: 12},
  scroll: {paddingHorizontal: 16, paddingBottom: 24, gap: 16},
  facts: {},
  factsHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, gap: 8},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 16},
  tab: {
    height: 52,
    marginBottom: -10,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  card: {
    borderRadius: 14,
    backgroundColor: colors.card,
    overflow: 'hidden',
    shadowColor: '#10204B',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 8},
    elevation: 4,
  },
  cardHead: {paddingHorizontal: 18, paddingVertical: 14},
  cardBody: {flexDirection: 'row', gap: 16, padding: 18},
  photo: {
    width: 88,
    height: 112,
    borderRadius: 8,
    backgroundColor: colors.photo,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  fields: {flex: 1, gap: 8},
  cardFoot: {borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 18, paddingVertical: 10},
  actions: {flexDirection: 'row', gap: 10},
  flex: {flex: 1},
  scrim: {flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end'},
  sheet: {backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 12},
  prove: {flex: 1, height: 48, borderRadius: 12, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center'},
});
