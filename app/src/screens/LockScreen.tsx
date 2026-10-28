import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTranslation} from 'react-i18next';
import i18n from '../i18n';
import {AppError, toAppError} from '../errors';
import {keychain} from '../services/keychainAdapter';
import {deviceSecurity, openVault, resetVault} from '../services/vault';
import {session, useSession} from '../state/session';
import {Icon, PrimaryButton, TextButton, Txt, Wordmark} from '../ui/components';
import {biometryLabel} from '../ui/describe';
import {colors} from '../ui/theme';

/** Shown over everything whenever the app is locked. Unlocking reads the vault. */
export function LockScreen() {
  const {t} = useTranslation();
  const security = useSession((s) => s.security);
  const [busy, setBusy] = useState(false);
  const [lastCode, setLastCode] = useState<string | null>(null);
  const tried = useRef(false);

  const unlock = useCallback(async () => {
    setBusy(true);
    setLastCode(null);
    try {
      const sec = await deviceSecurity(keychain);
      session.setSecurity(sec);
      if (sec.kind === 'none') throw new AppError('E4002', 'no biometrics and no device passcode');
      const vault = await openVault(keychain, {title: i18n.t('lock.prompt'), cancel: i18n.t('lock.cancel')});
      session.unlocked(vault);
    } catch (err) {
      const e = toAppError(err, 'E4001');
      setLastCode(e.code);
      session.showError(e.code, e.detail);
    } finally {
      setBusy(false);
    }
  }, []);

  // Ask once on appearance; after that the person taps the button.
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    unlock();
  }, [unlock]);

  // An unreadable vault (biometrics re-enrolled, or damaged) would keep the
  // person on this screen forever. Wiping needs no authentication: it reveals
  // nothing, and the ID is imported again from the mobile ID app.
  const wipe = useCallback(async () => {
    await resetVault(keychain);
    await unlock();
  }, [unlock]);

  const label =
    security?.kind === 'passcode'
      ? t('lock.unlockPasscode')
      : t('lock.unlockBiometric', {kind: biometryLabel(security?.kind === 'biometry' ? security.biometry : '')});

  return (
    <SafeAreaView style={styles.root} testID="lock-screen">
      <View style={styles.top}>
        <Wordmark width={168} />
        <Txt size={17} color={colors.muted} style={styles.center}>
          {t('lock.intro')}
        </Txt>
      </View>
      <View style={styles.middle}>
        <View style={styles.ring}>
          <Icon name="face" size={64} color={colors.blue} />
        </View>
      </View>
      <View style={styles.bottom}>
        <PrimaryButton label={label} onPress={unlock} disabled={busy} testID="unlock" />
        {lastCode === 'E4003' ? <TextButton label={t('lock.wipe')} onPress={wipe} color={colors.red} /> : null}
        {security?.kind === 'passcode' ? (
          <Txt size={13} color={colors.muted} style={styles.center}>
            {t('lock.passcodeNote')}
          </Txt>
        ) : null}
        <Txt size={13} color={colors.muted} style={styles.center}>
          {t('lock.rule')}
        </Txt>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {...StyleSheet.absoluteFillObject, backgroundColor: colors.paper, paddingHorizontal: 32},
  top: {alignItems: 'center', gap: 24, paddingTop: 64},
  center: {textAlign: 'center'},
  middle: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  ring: {
    width: 132,
    height: 132,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.blue,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: {gap: 16, paddingBottom: 24},
});
