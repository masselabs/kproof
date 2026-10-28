import React, {useEffect, useState} from 'react';
import {Linking, ScrollView, StyleSheet, View} from 'react-native';
import {lookupNetwork, type VerifyOutcome} from '@kproof/sdk';
import {BUILD_ENV} from '../config/buildEnv';
import {verifyInAppAnswer, type InAppRequest} from '../services/inAppProof';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {useTranslation} from 'react-i18next';
import i18n from '../i18n';
import {session, useSession} from '../state/session';
import type {RootStackParamList} from '../navigation/types';
import {Icon, PrimaryButton, TextButton, Txt} from '../ui/components';
import {cardName, dateDots, durationText, serviceName, shortWhat} from '../ui/describe';
import {colors} from '../ui/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Verdict = {state: 'running'} | {state: 'done'; outcome: VerifyOutcome} | {state: 'failed'; detail: string};

const CHECK_NAMES = ['status', 'circuit', 'public_input_count', 'public_input_format', 'scope', 'age_threshold', 'current_year', 'region', 'on_chain'] as const;
type CheckName = (typeof CHECK_NAMES)[number];

/** A verification check's label; a check this build has no label for shows its own name. */
function checkName(name: string): string {
  if (!(CHECK_NAMES as readonly string[]).includes(name)) return name;
  return i18n.t(`done.check.${name as CheckName}`);
}

function StatusText({ok, text}: {ok: boolean | null; text: string}) {
  return (
    <Txt weight="semibold" size={14} color={ok === null ? colors.muted : ok ? colors.blue : colors.red}>
      {text}
    </Txt>
  );
}

/**
 * Off-chain: the phone's own verifier accepted the proof before it was sent.
 * On-chain (in-app requests only): the SDK reads the answer back from the
 * relay and asks the circuit's verifier contract, as a service would.
 */
function Verification({verifyMs, inApp}: {verifyMs: number; inApp: InAppRequest | null}) {
  const {t} = useTranslation();
  const [verdict, setVerdict] = useState<Verdict>({state: 'running'});
  useEffect(() => {
    if (inApp === null) return;
    let live = true;
    verifyInAppAnswer({environment: BUILD_ENV, fetchImpl: fetch}, inApp, new Date()).then(
      (outcome) => {
        console.log(`[in-app] verify ${inApp.requestId}: valid=${outcome.valid} ${outcome.checks.map((c) => `${c.name}=${c.ok}`).join(' ')}`);
        if (live) setVerdict({state: 'done', outcome});
      },
      (err) => {
        const detail = err instanceof Error ? err.message : String(err);
        console.log(`[in-app] verify ${inApp.requestId} failed: ${detail}`);
        if (live) setVerdict({state: 'failed', detail});
      },
    );
    return () => {
      live = false;
    };
  }, [inApp]);

  const onChain = verdict.state === 'done' ? verdict.outcome.checks.find((c) => c.name === 'on_chain') : undefined;
  const others = verdict.state === 'done' ? verdict.outcome.checks.filter((c) => c.name !== 'on_chain') : [];

  return (
    <View style={styles.table} testID="verification">
      <Txt weight="bold" size={15}>
        {t('done.verification')}
      </Txt>
      <View style={styles.row}>
        <Txt size={14} color={colors.muted}>
          {t('done.offChain')}
        </Txt>
        <StatusText ok text={t('done.passIn', {time: durationText(verifyMs)})} />
      </View>
      {inApp !== null ? (
        <>
          <View style={styles.row}>
            <Txt size={14} color={colors.muted}>
              {t('done.onChain')}
            </Txt>
            {verdict.state === 'running' ? (
              <StatusText ok={null} text={t('done.checking')} />
            ) : verdict.state === 'failed' ? (
              <StatusText ok={false} text={t('done.fail')} />
            ) : (
              <StatusText ok={onChain?.ok === true} text={onChain?.ok === true ? t('done.pass') : t('done.fail')} />
            )}
          </View>
          {verdict.state === 'done' ? (
            <>
              <View style={styles.row}>
                <Txt size={14} color={colors.muted}>
                  {t('done.chain')}
                </Txt>
                <Txt size={14}>{`${lookupNetwork(BUILD_ENV).name} (${verdict.outcome.network.chainId})`}</Txt>
              </View>
              <Txt size={12} color={colors.muted}>
                {verdict.outcome.network.verifier}
              </Txt>
              <View style={styles.divider} />
              {others.map((c) => (
                <View key={c.name} style={styles.row}>
                  <Txt size={13} color={colors.muted}>
                    {checkName(c.name)}
                  </Txt>
                  <StatusText ok={c.ok} text={c.ok ? t('done.pass') : t('done.fail')} />
                </View>
              ))}
              {verdict.outcome.checks
                .filter((c) => !c.ok)
                .map((c) => (
                  <Txt key={`${c.name}-detail`} size={12} color={colors.red}>
                    {`${checkName(c.name)}: ${c.detail}`}
                  </Txt>
                ))}
            </>
          ) : null}
          {verdict.state === 'failed' ? (
            <Txt size={12} color={colors.red}>
              {verdict.detail}
            </Txt>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export function DoneScreen() {
  const {t} = useTranslation();
  const nav = useNavigation<Nav>();
  const {params} = useRoute<RouteProp<RootStackParamList, 'Done'>>();
  const request = useSession((s) => s.pendingRequest);
  const inApp = useSession((s) => s.inAppRequest);
  if (!request) return <View style={styles.root} />;
  const who = serviceName(request.dappName);
  const what = shortWhat(request.inputs);
  const at = new Date(params.at);

  const finish = (to: 'Home' | 'History') => {
    session.setPendingRequest(null);
    session.setInAppRequest(null);
    nav.navigate('Tabs', {screen: to});
  };

  const back = async () => {
    const scheme = request.returnScheme;
    finish('Home');
    if (scheme !== undefined) {
      try {
        await Linking.openURL(scheme);
      } catch (err) {
        console.log(`[done] could not open the requester's scheme: ${String(err)}`);
      }
    }
  };

  const rows: Array<[string, string]> = [
    [t('done.to'), who],
    [t('done.what'), what],
    [t('done.card'), cardName(params.card)],
    [t('done.took'), t('done.seconds', {seconds: (params.provingMs / 1000).toFixed(1)})],
    [t('done.at'), `${dateDots(params.at)} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`],
  ];

  return (
    <SafeAreaView style={styles.safe} testID="done-screen">
      <ScrollView contentContainerStyle={styles.root}>
      <View style={styles.badge}>
        <Icon name="check" size={48} color={colors.white} />
      </View>
      <Txt weight="bold" size={26} style={styles.center}>
        {t('done.title')}
      </Txt>
      <Txt size={15} color={colors.muted} style={styles.center}>
        {t('done.body', {who, what})}
      </Txt>
      <View style={styles.table}>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.row}>
            <Txt size={14} color={colors.muted}>
              {k}
            </Txt>
            <Txt size={14}>{v}</Txt>
          </View>
        ))}
      </View>
      <Verification verifyMs={params.verifyMs} inApp={inApp !== null && inApp.requestId === request.requestId ? inApp : null} />
      </ScrollView>
      <View style={styles.footer}>
        <PrimaryButton label={request.returnScheme !== undefined ? t('done.back') : t('done.home')} onPress={back} />
        <TextButton label={t('done.history')} color={colors.blue} onPress={() => finish('History')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: colors.paper},
  root: {flexGrow: 1, backgroundColor: colors.paper, paddingHorizontal: 24, paddingBottom: 16, alignItems: 'center', gap: 16},
  badge: {
    marginTop: 48,
    width: 96,
    height: 96,
    borderRadius: 999,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {textAlign: 'center'},
  table: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  row: {flexDirection: 'row', justifyContent: 'space-between', gap: 16},
  divider: {height: 1, backgroundColor: colors.line, marginVertical: 2},
  footer: {paddingHorizontal: 24, gap: 4, paddingBottom: 8},
});
