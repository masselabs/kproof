/**
 * Turns relay statuses into the words the page shows. Every string from the
 * server is placed with textContent, never innerHTML: an `error` field is
 * whatever the app or relay wrote, and must not become markup.
 */
import type { RequestStatus } from './relay';

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

/** Builds the result block for a terminal status. */
export function renderResult(doc: Document, s: RequestStatus): HTMLElement {
  const box = doc.createElement('div');
  box.className = `result result-${s.status}`;
  const title = doc.createElement('p');
  title.className = 'result-title';
  title.textContent = statusText(s);
  box.append(title);

  const rows: Array<[string, string]> = [];
  if (s.status === 'completed') {
    rows.push(['회로', s.circuit ?? '(응답에 없음)']);
    rows.push(['증명 크기', s.proof ? `${Math.floor((s.proof.replace(/^0x/, '').length) / 2).toLocaleString('ko-KR')}바이트` : '(응답에 없음)']);
    rows.push(['공개 입력', s.publicInputs ? `${s.publicInputs.length}개` : '(응답에 없음)']);
    rows.push(['검증', '아직 하지 않음 — KProof SDK의 검증 기능이 생기면 여기서 확인합니다.']);
  } else if (s.error || s.errorCode) {
    rows.push(['사유', [s.errorCode, s.error].filter(Boolean).join(' ')]);
  }
  if (rows.length > 0) {
    const dl = doc.createElement('dl');
    dl.className = 'meta';
    for (const [k, v] of rows) {
      const dt = doc.createElement('dt');
      dt.textContent = k;
      const dd = doc.createElement('dd');
      dd.textContent = v;
      dl.append(dt, dd);
    }
    box.append(dl);
  }
  return box;
}
