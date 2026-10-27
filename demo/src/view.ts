/**
 * Turns relay statuses and SDK verification outcomes into the words the page
 * shows. Every string from the server is placed with textContent, never
 * innerHTML: an `error` field is whatever the app or relay wrote, and must not
 * become markup.
 */
import type { RequestStatus, VerifyOutcome } from '@kproof/sdk';
import { checkLabel } from './messages';

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

function rows(doc: Document, entries: Array<[string, string]>): HTMLElement {
  const dl = doc.createElement('dl');
  dl.className = 'meta';
  for (const [k, v] of entries) {
    const dt = doc.createElement('dt');
    dt.textContent = k;
    const dd = doc.createElement('dd');
    dd.textContent = v;
    dl.append(dt, dd);
  }
  return dl;
}

/** Builds the result block for a terminal status, with the verification when there is one. */
export function renderResult(doc: Document, s: RequestStatus, outcome?: VerifyOutcome): HTMLElement {
  const box = doc.createElement('div');
  const verdict = s.status === 'completed' ? (outcome ? (outcome.valid ? 'verified' : 'refused') : 'checking') : s.status;
  box.className = `result result-${verdict}`;
  const title = doc.createElement('p');
  title.className = 'result-title';
  title.textContent = s.status !== 'completed'
    ? statusText(s)
    : outcome === undefined ? '증명이 도착했습니다. 검증하는 중입니다.'
    : outcome.valid ? '증명을 검증했습니다.' : '증명을 받아들일 수 없습니다.';
  box.append(title);

  if (s.status === 'completed') {
    const entries: Array<[string, string]> = [
      ['회로', s.circuit ?? '(응답에 없음)'],
      ['증명 크기', s.proof ? `${Math.floor(s.proof.replace(/^0x/, '').length / 2).toLocaleString('ko-KR')}바이트` : '(응답에 없음)'],
      ['공개 입력', s.publicInputs ? `${s.publicInputs.length}개` : '(응답에 없음)'],
    ];
    if (outcome) {
      for (const c of outcome.checks) entries.push([checkLabel(c.name), `${c.ok ? '통과' : '실패'} · ${c.detail}`]);
      if (outcome.nullifier) entries.push(['중복 확인 값', outcome.nullifier]);
      entries.push(['정부 서명', '아직 검증하지 않음 (조폐공사 규격 연동 전)']);
    }
    box.append(rows(doc, entries));
  } else if (s.error || s.errorCode) {
    box.append(rows(doc, [['사유', [s.errorCode, s.error].filter(Boolean).join(' ')]]));
  }
  return box;
}
