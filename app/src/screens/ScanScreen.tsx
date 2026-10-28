import React, {useEffect, useRef, useState} from 'react';
import {AppState, Linking, Pressable, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {StackActions, useIsFocused, useNavigation} from '@react-navigation/native';
import {
  Camera,
  useCameraDevice,
  useCodeScanner,
  type CameraPermissionStatus,
  type CameraRuntimeError,
} from 'react-native-vision-camera';
import {useTranslation} from 'react-i18next';
import {currentEnv} from '../config/buildEnv';
import {handleIncomingUrl} from '../app/deepLinks';
import {createScanGate, REFUSAL_QUIET_MS, type ScanGate} from '../app/scanGate';
import type {ErrorCode} from '../errors';
import {useSession} from '../state/session';
import {Icon, PrimaryButton, TextButton, Txt} from '../ui/components';
import {colors} from '../ui/theme';

const FRAME = 260;
const CORNER = 34;
const CORNER_WIDTH = 4;
const DIM = 'rgba(0,0,0,0.55)';

type Blocker = 'denied' | 'restricted' | 'noCamera' | 'failed';

/** What stands between the person and a working camera, if anything. */
export function blockerOf(permission: CameraPermissionStatus, failed: boolean, hasDevice: boolean): Blocker | null {
  if (permission === 'denied') return 'denied';
  if (permission === 'restricted') return 'restricted';
  if (failed) return 'failed';
  if (permission === 'granted' && !hasDevice) return 'noCamera';
  return null;
}

/** Full-screen QR scanner, opened from the centre tab-bar button. */
export function ScanScreen() {
  const {t} = useTranslation();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const locked = useSession((s) => s.lock.locked);
  const device = useCameraDevice('back');
  const [permission, setPermission] = useState<CameraPermissionStatus>(() => Camera.getCameraPermissionStatus());
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [failed, setFailed] = useState(false);
  const [refusal, setRefusal] = useState<{code: ErrorCode; at: number} | null>(null);

  // Set synchronously when a code is accepted: the camera stops on the next
  // render, but the gate already ignores every frame after the first.
  const [accepted, setAccepted] = useState(false);
  // The scanner leaves exactly once, whichever way it leaves.
  const left = useRef(false);
  const leave = (how: 'back' | 'toRequest') => {
    if (left.current) return;
    left.current = true;
    if (how === 'back') nav.goBack();
    else nav.dispatch(StackActions.replace('Request'));
  };

  // Created once per screen: it is what makes one code one request.
  const gate = useRef<ScanGate | null>(null);
  if (gate.current === null) {
    gate.current = createScanGate({
      env: currentEnv(),
      now: Date.now,
      onAccept: (url) => {
        console.log('[scan] request code accepted');
        setAccepted(true);
        handleIncomingUrl(url).then(
          (outcome) => {
            // A refused request already shows its error; a queued one is shown
            // after the proof in progress. Either way the scanner gets out of the way.
            if (outcome === 'refused' || outcome === 'queued') leave('back');
          },
          (err) => {
            console.log(`[scan] handling the scanned request failed: ${String(err)}`);
            leave('back');
          },
        );
      },
      onRefuse: (code, detail) => {
        console.log(`[scan] refused ${code}: ${detail}`);
        setRefusal({code, at: Date.now()});
      },
    });
  }

  // A request on screen (from this scan, or a link that arrived meanwhile)
  // takes the scanner's place, so the request is never stacked on top of it.
  const pendingId = useSession((s) => s.pendingRequest?.requestId);
  useEffect(() => {
    if (pendingId !== undefined) leave('toRequest');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId]);

  useEffect(() => {
    if (permission !== 'not-determined') return;
    Camera.requestCameraPermission().then(setPermission, (err) => {
      console.log(`[scan] camera permission request failed: ${String(err)}`);
      setFailed(true);
    });
  }, [permission]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      setAppActive(next === 'active');
      // Coming back from Settings: the person may have just allowed the camera.
      if (next === 'active') setPermission(Camera.getCameraPermissionStatus());
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!refusal) return;
    const timer = setTimeout(() => setRefusal(null), REFUSAL_QUIET_MS + 500);
    return () => clearTimeout(timer);
  }, [refusal]);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      gate.current?.offer(codes);
    },
  });

  const blocker = blockerOf(permission, failed, !!device);
  const active = permission === 'granted' && !!device && !failed && !accepted && focused && appActive && !locked;

  const close = () => leave('back');

  return (
    <View style={styles.root} testID="scan-screen">
      {permission === 'granted' && device && !failed ? (
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={active}
          codeScanner={codeScanner}
          onError={(e: CameraRuntimeError) => {
            console.log(`[scan] camera error ${e.code}: ${e.message}`);
            setFailed(true);
          }}
        />
      ) : null}

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.dim, styles.top]}>
          <Txt weight="bold" size={20} color={colors.white}>
            {t('scan.title')}
          </Txt>
        </View>
        <View style={styles.middle}>
          <View style={styles.dim} />
          <View style={styles.frame}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
          </View>
          <View style={styles.dim} />
        </View>
        <View style={[styles.dim, styles.bottom]}>
          <Txt size={15} color={colors.white} style={styles.center}>
            {t('scan.hint')}
          </Txt>
          {refusal ? (
            <View style={styles.refusal} testID="scan-refusal">
              <Txt weight="semibold" size={13} color={colors.red}>
                {t('errorModal.code', {code: refusal.code})}
              </Txt>
              <Txt weight="bold" size={16}>
                {t(`errors.${refusal.code}.title`)}
              </Txt>
              <Txt size={14} color={colors.muted}>
                {t(`errors.${refusal.code}.body`)}
              </Txt>
            </View>
          ) : null}
        </View>
      </View>

      <Pressable
        testID="scan-close"
        accessibilityRole="button"
        accessibilityLabel={t('scan.close')}
        onPress={close}
        hitSlop={12}
        style={[styles.closeButton, {top: insets.top + 8}]}>
        <Icon name="close" size={26} color={colors.white} />
      </Pressable>

      {blocker ? (
        <View style={styles.sheetScrim}>
          <View style={[styles.sheet, {paddingBottom: 24 + insets.bottom}]} testID={`scan-blocker-${blocker}`}>
            <Txt weight="bold" size={20}>
              {t(`scan.${blocker}Title`)}
            </Txt>
            <Txt size={15} color={colors.muted}>
              {t(`scan.${blocker}Body`)}
            </Txt>
            <View style={styles.gap} />
            {blocker === 'denied' ? (
              <PrimaryButton testID="scan-open-settings" label={t('scan.openSettings')} onPress={() => void Linking.openSettings()} />
            ) : null}
            {blocker === 'failed' ? (
              <PrimaryButton testID="scan-retry" label={t('scan.retry')} onPress={() => setFailed(false)} />
            ) : null}
            <TextButton testID="scan-blocker-close" label={t('scan.close')} onPress={close} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#000'},
  overlay: {...StyleSheet.absoluteFillObject},
  dim: {flex: 1, backgroundColor: DIM},
  top: {justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 28},
  middle: {flexDirection: 'row', height: FRAME},
  frame: {width: FRAME, height: FRAME},
  bottom: {alignItems: 'center', paddingTop: 28, paddingHorizontal: 24, gap: 20},
  center: {textAlign: 'center'},
  corner: {position: 'absolute', width: CORNER, height: CORNER, borderColor: colors.white},
  tl: {top: 0, left: 0, borderTopWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderTopLeftRadius: 12},
  tr: {top: 0, right: 0, borderTopWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderTopRightRadius: 12},
  bl: {bottom: 0, left: 0, borderBottomWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderBottomLeftRadius: 12},
  br: {bottom: 0, right: 0, borderBottomWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderBottomRightRadius: 12},
  refusal: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  closeButton: {
    position: 'absolute',
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheetScrim: {...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim, justifyContent: 'flex-end'},
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 8,
  },
  gap: {height: 8},
});
