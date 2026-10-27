import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
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

const ORDER: ProvingStep[] = ['files', 'inputs', 'prove', 'send'];

export function ProvingScreen() {
  const nav = useNavigation<Nav>();
  const {params} = useRoute<RouteProp<RootStackParamList, 'Proving'>>();
  const request = useSession((s) => s.pendingRequest);
  const [step, setStep] = useState<ProvingStep | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !request) return;
    started.current = true;
    (async () => {
      const result = await approveAndProve(answerFlowDeps, request, params.card, setStep);
      if (result.ok) {
        nav.replace('Done', {card: params.card, provingMs: result.provingMs, at: new Date().toISOString()});
        return;
      }
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
    send: ko.proving.steps.send(who),
  };
  const current = step === null ? -1 : ORDER.indexOf(step);

  return (
    <SafeAreaView style={styles.root} testID="proving-screen">
      <View style={styles.ring}>
        <Icon name="spinner" size={96} color={colors.blue} />
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
  text: {gap: 8, marginTop: 16},
  center: {textAlign: 'center'},
  steps: {alignSelf: 'stretch', marginTop: 28, gap: 4},
  step: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10},
  stepActive: {backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line},
});
