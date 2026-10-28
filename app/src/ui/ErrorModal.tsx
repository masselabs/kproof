import React, {useState} from 'react';
import {Modal, Pressable, StyleSheet, View} from 'react-native';
import {useTranslation} from 'react-i18next';
import {session, useSession} from '../state/session';
import {colors} from './theme';
import {Icon, PrimaryButton, Txt} from './components';

/** The one way an error reaches the person: a bottom sheet with its code. */
export function ErrorModal() {
  const {t} = useTranslation();
  const error = useSession((s) => s.error);
  const [showDetail, setShowDetail] = useState(false);
  if (!error) return null;
  const text = {title: t(`errors.${error.code}.title`), body: t(`errors.${error.code}.body`)};
  return (
    <Modal transparent animationType="fade" visible onRequestClose={session.clearError}>
      <Pressable style={styles.scrim} onPress={() => { setShowDetail(false); session.clearError(); }}>
        <Pressable style={styles.sheet} onPress={() => undefined} testID="error-modal">
          <Txt weight="semibold" size={13} color={colors.red}>
            {t('errorModal.code', {code: error.code})}
          </Txt>
          <Txt weight="bold" size={20}>
            {text.title}
          </Txt>
          <Txt size={15} color={colors.muted}>
            {text.body}
          </Txt>
          {/* The developer detail (never personal data), for support and bug reports. */}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{expanded: showDetail}}
            onPress={() => setShowDetail(!showDetail)}
            style={styles.detailToggle}
            testID="error-detail-toggle">
            <Txt weight="semibold" size={13} color={colors.muted}>
              {t('errorModal.detail')}
            </Txt>
            <View style={showDetail ? styles.chevronOpen : undefined}>
              <Icon name="chevronDown" size={16} color={colors.muted} />
            </View>
          </Pressable>
          {showDetail ? (
            <Txt size={13} color={colors.muted} testID="error-detail">
              {error.detail}
            </Txt>
          ) : null}
          <View style={styles.gap} />
          <PrimaryButton label={t('errorModal.close')} onPress={session.clearError} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end'},
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    gap: 8,
  },
  gap: {height: 8},
  detailToggle: {flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start'},
  chevronOpen: {transform: [{rotate: '180deg'}]},
});
