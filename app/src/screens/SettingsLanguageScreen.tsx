import React from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useTranslation} from 'react-i18next';
import i18n, {LANGUAGE_KEY, useCurrentLanguage} from '../i18n';
import {LANGUAGE_OPTIONS, type AppLanguage} from '../i18n/languages';
import {session} from '../state/session';
import {Icon, Txt} from '../ui/components';
import {colors} from '../ui/theme';

/**
 * The language picker, as in the ZKProofport app: the language changes at
 * once, and storing the choice never blocks it. A failed write is reported and
 * the choice still holds for this session.
 */
export function SettingsLanguageScreen() {
  const nav = useNavigation();
  const {t} = useTranslation();
  // Direct subscription, so the selection follows a change even if the
  // navigator re-renders around it.
  const current = useCurrentLanguage();

  const choose = (target: AppLanguage) => {
    if (target === current) return;
    i18n.changeLanguage(target).then(
      () => {
        AsyncStorage.setItem(LANGUAGE_KEY, target).catch((err) => {
          session.showError('E5002', `language write failed: ${String(err)}`);
        });
      },
      (err) => console.log(`[i18n] changeLanguage(${target}) failed: ${String(err)}`),
    );
  };

  return (
    <SafeAreaView style={styles.root} testID="settings-language-screen">
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('settings.back')} style={styles.back} onPress={() => nav.goBack()}>
          <Icon name="back" />
        </Pressable>
        <Txt weight="bold" size={24}>
          {t('settings.language')}
        </Txt>
        <Txt size={14} color={colors.muted}>
          {t('settings.languageDescription')}
        </Txt>
        <View style={styles.panel}>
          {LANGUAGE_OPTIONS.map((option, index) => {
            const selected = option.value === current;
            return (
              <Pressable
                key={option.value}
                testID={`settings-language-option-${option.value}`}
                accessibilityRole="radio"
                accessibilityLabel={option.label}
                accessibilityState={{selected}}
                onPress={() => choose(option.value)}
                style={[styles.row, index > 0 && styles.rowLine]}>
                <Txt weight="semibold" size={16} color={selected ? colors.blue : colors.ink} style={styles.flex}>
                  {option.label}
                </Txt>
                <Icon name={selected ? 'check' : 'dot'} size={20} color={selected ? colors.blue : colors.line} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.paper},
  scroll: {padding: 16, paddingTop: 4, gap: 12},
  back: {width: 44, height: 44, justifyContent: 'center'},
  panel: {backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 12},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16},
  rowLine: {borderTopWidth: 1, borderTopColor: colors.line},
  flex: {flex: 1},
});
