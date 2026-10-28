import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import Svg, {Circle} from 'react-native-svg';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {ko} from '../i18n/ko';
import {answerFlowDeps} from '../app/deps';
import {approveAndProve, type ProvingStep} from '../services/answerFlow';
import {session, useSession} from '../state/session';
import type {RootStackParamList} from '../navigation/types';
import {Icon, Txt} from '../ui/components';
import {shortWhat} from '../ui/describe';
import {colors} from '../ui/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const ORDER: ProvingStep[] = ['files', 'inputs', 'prove', 'verify', 'send'];

/** How far the percentage may count while each step runs; it reaches 100 only when the answer is sent. */
const CEILING: Record<ProvingStep, number> = {files: 20, inputs: 35, prove: 80, verify: 92, send: 99};
/**
 * One percent per tick. The prover blocks the JS thread, so the count pauses
 * while it runs; when it is far behind its ceiling it ticks faster (still one
 * percent at a time) so it catches up without a long wait.
 */
const TICK_MS = 24;
const CATCH_UP_TICK_MS = 8;
const CATCH_UP_GAP = 20;
/** How long 100% stays on screen before the done screen replaces it. */
const HOLD_AT_100_MS = 350;
const RING = 168;
const STROKE = 10;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ProvingScreen() {
  const nav = useNavigation<Nav>();
  const {params} = useRoute<RouteProp<RootStackParamList, 'Proving'>>();
  const request = useSession((s) => s.pendingRequest);
  const [step, setStep] = useState<ProvingStep | null>(null);
  const [ceiling, setCeiling] = useState(0);
  const [percent, setPercent] = useState(0);
  const [finished, setFinished] = useState<RootStackParamList['Done'] | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (percent >= ceiling) return;
    const timer = setTimeout(() => setPercent((p) => Math.min(p + 1, ceiling)), ceiling - percent > CATCH_UP_GAP ? CATCH_UP_TICK_MS : TICK_MS);
    return () => clearTimeout(timer);
  }, [ceiling, percent]);

  // The done screen comes only after 100% has been drawn and held.
  useEffect(() => {
    if (finished === null || percent < 100) return;
    const timer = setTimeout(() => nav.replace('Done', finished), HOLD_AT_100_MS);
    return () => clearTimeout(timer);
  }, [finished, percent, nav]);

  const onStep = (s: ProvingStep) => {
    setStep(s);
    setCeiling(CEILING[s]);
  };

  useEffect(() => {
    if (started.current || !request) return;
    started.current = true;
    (async () => {
      const result = await approveAndProve(answerFlowDeps, request, params.card, onStep);
      if (result.ok) {
        setCeiling(100);
        setFinished({card: params.card, provingMs: result.provingMs, verifyMs: result.verifyMs, at: new Date().toISOString()});
        return;
      }
      // Another screen is already proving this request; it owns the outcome.
      if ('inProgress' in result) return;
      session.showError(result.code, result.detail);
      if (result.answered) {
        // The request has its answer; nothing more can be done with it.
        session.setPendingRequest(null);
        nav.navigate('Tabs', {screen: 'History'});
      } else {
        // Nothing was sent: back to the request, which can be retried or declined.
        nav.goBack();
      }
    })();
  }, [nav, params.card, request]);

  if (!request) return <View style={styles.root} />;
  const who = request.dappName ?? ko.request.unnamed;
  const labels: Record<ProvingStep, string> = {
    files: ko.proving.steps.files,
    inputs: ko.proving.steps.inputs(shortWhat(request.inputs)),
    prove: ko.proving.steps.prove,
    verify: ko.proving.steps.verify,
    send: ko.proving.steps.send(who),
  };
  const current = step === null ? -1 : ORDER.indexOf(step);

  return (
    <SafeAreaView style={styles.root} testID="proving-screen">
      <View style={styles.ring}>
        <Svg width={RING} height={RING} style={styles.spin}>
          <Circle cx={RING / 2} cy={RING / 2} r={RADIUS} stroke={colors.line} strokeWidth={STROKE} fill="none" />
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            stroke={colors.blue}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={CIRCUMFERENCE * (1 - percent / 100)}
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
          />
        </Svg>
        <Txt weight="bold" size={36} color={colors.ink} testID="proving-percent">
          {`${percent}%`}
        </Txt>
      </View>
      <View style={styles.text}>
        <Txt weight="bold" size={24} style={styles.center}>
          {ko.proving.title}
        </Txt>
        <Txt size={15} color={colors.muted} style={styles.center}>
          {ko.proving.body}
        </Txt>
      </View>
      <View style={styles.steps}>
        {ORDER.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <View key={s} style={[styles.step, active && styles.stepActive]}>
              <Icon
                name={done ? 'checkCircle' : active ? 'spinner' : 'dot'}
                size={22}
                color={done || active ? colors.blue : colors.faint}
              />
              <Txt weight={active ? 'bold' : 'regular'} size={15} color={done || active ? colors.ink : colors.muted}>
                {labels[s]}
              </Txt>
            </View>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: colors.paper, paddingHorizontal: 28, alignItems: 'center'},
  ring: {marginTop: 72, width: 176, height: 176, alignItems: 'center', justifyContent: 'center'},
  spin: {position: 'absolute'},
  text: {gap: 8, marginTop: 16},
  center: {textAlign: 'center'},
  steps: {alignSelf: 'stretch', marginTop: 28, gap: 4},
  step: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10},
  stepActive: {backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line},
});
