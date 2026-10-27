import React, {useCallback, useState} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import {ko} from '../i18n/ko';
import {kv} from '../app/deps';
import {readHistory, type HistoryRecord} from '../services/history';
import {Txt} from '../ui/components';
import {cardColor, cardPlain, shortStamp, shortWhat} from '../ui/describe';
import {colors} from '../ui/theme';

export function HistoryScreen() {
  const [rows, setRows] = useState<HistoryRecord[]>([]);

  useFocusEffect(
    useCallback(() => {
      readHistory(kv).then(setRows, (err) => console.log(`[history] read failed: ${String(err)}`));
    }, []),
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <FlatList
        contentContainerStyle={styles.list}
        data={rows}
        keyExtractor={(r) => `${r.requestId}-${r.at}`}
        ListHeaderComponent={
          <View style={styles.head}>
            <Txt weight="bold" size={26}>
              {ko.history.title}
            </Txt>
            <Txt size={14} color={colors.muted}>
              {ko.history.intro}
            </Txt>
          </View>
        }
        ListEmptyComponent={
          <Txt size={15} color={colors.muted}>
            {ko.history.empty}
          </Txt>
        }
        renderItem={({item}) => {
          const ok = item.result === 'sent';
          return (
            <View style={styles.row}>
              <View style={[styles.bar, {backgroundColor: item.card ? cardColor(item.card) : colors.faint}]} />
              <View style={styles.flex}>
                <Txt weight="bold" size={15}>
                  {shortWhat(item.inputs)}
                </Txt>
                <Txt size={13} color={colors.muted} numberOfLines={1}>
                  {`${item.dappName ?? ko.request.unnamed}${item.card ? ` · ${cardPlain(item.card)}` : ''}`}
                </Txt>
              </View>
              <View style={styles.right}>
                <Txt weight="bold" size={13} color={ok ? colors.blue : colors.red}>
                  {ko.history.result[item.result]}
                  {item.errorCode ? ` ${item.errorCode}` : ''}
                </Txt>
                <Txt size={12} color={colors.muted}>
                  {shortStamp(item.at)}
                </Txt>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.paper},
  list: {padding: 16, paddingTop: 12, gap: 8},
  head: {gap: 4, marginBottom: 8},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
  },
  bar: {width: 6, height: 40, borderRadius: 3},
  flex: {flex: 1},
  right: {alignItems: 'flex-end'},
});
