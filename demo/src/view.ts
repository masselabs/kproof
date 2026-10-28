/**
 * Turns relay statuses and SDK verification outcomes into the words the page
 * shows. Every string from the server is placed with textContent, never
 * innerHTML: an `error` field is whatever the app or relay wrote, and must not
 * become markup.
 */
import type { RequestStatus } from '@kproof/sdk';
import { checkLabel } from './messages';
import type { Verification } from './verification';

export const STATUS_TEXT: Readonly<Record<RequestStatus['status'], string>> = {
  pending: '앱이 요청을 열기를 기다리는 중입니다.',
  generating: '앱에서 증명을 만들고 있습니다.',
  completed: '증명이 도착했습니다.',
  error: '앱에서 증명을 만들지 못했습니다.',
  cancelled: '사용자가 요청을 취소했습니다.',
  expired: '요청 시간이 지나 만료되었습니다.',
};

export function statusText(s: RequestStatus): string {
  const text = STATUS_TEXT[s.status];
  if (text === undefined) throw new Error(`Unknown status '${String(s.status)}'`);
  return text;
}

function rows(doc: Document, entries: Array<[string, string, string?]>, className = 'meta'): HTMLElement {
  const dl = doc.createElement('dl');
  dl.className = className;
  for (const [k, v, tone] of entries) {
    const dt = doc.createElement('dt');
    dt.textContent = k;
    const dd = doc.createElement('dd');
    dd.textContent = v;
    if (tone) dd.className = tone;
    dl.append(dt, dd);
  }
  return dl;
}

/** Seconds the way the app's done screen writes them. */
export function seconds(ms: number): string {
  if (ms < 10) return '0.01초 미만';
  return ms < 1000 ? `${(ms / 1000).toFixed(2)}초` : `${(ms / 1000).toFixed(1)}초`;
}

const CHECKING = '확인 중…';

function offChainLine(step: Verification['offChain']): [string, string] {
  if (step.state === 'checking') return [CHECKING, 'checking'];
  if (step.state === 'failed') return [`실패 · ${step.reason}`, 'fail'];
  return step.value.valid ? [`통과 · ${seconds(step.value.ms)}`, 'pass'] : ['실패 · 검증 키로 확인되지 않는 증명입니다', 'fail'];
}

function onChainLine(step: Verification['answer']): [string, string] {
  if (step.state === 'checking') return [CHECKING, 'checking'];
  if (step.state === 'failed') return [`실패 · ${step.reason}`, 'fail'];
  const onChain = step.value.checks.find((c) => c.name === 'on_chain');
  if (!onChain) return ['실패 · 앞선 확인에서 거절되어 검증 컨트랙트에 묻지 않았습니다', 'fail'];
  return onChain.ok ? ['통과', 'pass'] : [`실패 · ${onChain.detail}`, 'fail'];
}

/** checking while either verification runs; verified only when both pass. */
export function verdictOf(v: Verification): 'checking' | 'verified' | 'refused' {
  const { offChain, answer } = v;
  if (offChain.state === 'failed' || answer.state === 'failed') return 'refused';
  if (offChain.state === 'done' && !offChain.value.valid) return 'refused';
  if (answer.state === 'done' && !answer.value.valid) return 'refused';
  if (offChain.state === 'checking' || answer.state === 'checking') return 'checking';
  return 'verified';
}

const TITLE = {
  checking: '증명이 도착했습니다. 검증하는 중입니다.',
  verified: '증명을 검증했습니다.',
  refused: '증명을 받아들일 수 없습니다.',
} as const;

/** Builds the result block for a terminal status, with both verifications when it is a completed answer. */
export function renderResult(doc: Document, s: RequestStatus, v?: Verification): HTMLElement {
  const box = doc.createElement('div');
  const verdict = s.status === 'completed' ? (v ? verdictOf(v) : 'checking') : s.status;
  box.className = `result result-${verdict}`;
  const title = doc.createElement('p');
  title.className = 'result-title';
  title.textContent = s.status === 'completed' ? TITLE[verdict as keyof typeof TITLE] : statusText(s);
  box.append(title);

  if (s.status === 'completed') {
    box.append(rows(doc, [
      ['회로', s.circuit ?? '(응답에 없음)'],
      ['증명 크기', s.proof ? `${Math.floor(s.proof.replace(/^0x/, '').length / 2).toLocaleString('ko-KR')}바이트` : '(응답에 없음)'],
      ['공개 입력', s.publicInputs ? `${s.publicInputs.length}개` : '(응답에 없음)'],
    ]));
    if (v) {
      const heading = doc.createElement('h3');
      heading.className = 'verify-title';
      heading.textContent = '검증';
      const [offText, offTone] = offChainLine(v.offChain);
      const [onText, onTone] = onChainLine(v.answer);
      box.append(heading, rows(doc, [
        ['오프체인 검증 (이 브라우저)', offText, offTone],
        ['온체인 검증', onText, onTone],
        ['체인', `${v.chain.name} (${v.chain.chainId})`],
        ['검증 컨트랙트', v.chain.verifier],
      ], 'meta verify'));
      if (v.answer.state === 'done') {
        const outcome = v.answer.value;
        const entries: Array<[string, string, string?]> = outcome.checks
          .filter((c) => c.name !== 'on_chain')
          .map((c) => [checkLabel(c.name), c.ok ? `통과 · ${c.detail}` : `실패 · ${c.detail}`, c.ok ? 'pass' : 'fail']);
        if (outcome.nullifier) entries.push(['중복 확인 값', outcome.nullifier]);
        box.append(rows(doc, entries, 'meta checks'));
      }
    }
  } else if (s.error || s.errorCode) {
    box.append(rows(doc, [['사유', [s.errorCode, s.error].filter(Boolean).join(' ')]]));
  }
  return box;
}
