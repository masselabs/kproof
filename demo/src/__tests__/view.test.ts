import { describe, expect, it } from 'vitest';
import type { RequestStatus, VerifyOutcome } from '@kproof/sdk';
import { InputError, RelayError } from '@kproof/sdk';
import { STATUS_TEXT, renderResult, seconds, statusText, verdictOf } from '../view';
import type { Step, Verification } from '../verification';
import { CHECK_LABEL, checkLabel, describeError } from '../messages';
import { CHOICES, lookupChoice } from '../choices';

const RID = '30924642-c99c-4349-b0bb-09e5641fe281';
const completed: RequestStatus = {
  requestId: RID, status: 'completed', circuit: 'mdl_kr_age',
  proof: '0x' + 'ab'.repeat(8768), publicInputs: Array.from({ length: 66 }, () => '0x' + '0'.repeat(64)),
};
const outcome = (valid: boolean, onChain = true): VerifyOutcome => ({
  valid,
  checks: [
    { name: 'scope', ok: true, detail: 'matches the request' },
    ...(onChain ? [{ name: 'on_chain' as const, ok: valid, detail: valid ? 'verifier returned true' : 'verifier returned 0x0' }] : []),
  ],
  nullifier: '0x' + '12'.repeat(32),
  issuerVerified: false,
  network: { chainId: 84532, verifier: '0x45d4850a9b197ceba185b5069fb13ce0be1dc6d6' },
});
const CHAIN = { name: 'Base Sepolia', chainId: 84532, verifier: '0x45d4850a9b197ceba185b5069fb13ce0be1dc6d6' };
const checking = { state: 'checking' } as const;
const v = (offChain: Step<{ valid: boolean; ms: number }>, answer: Step<VerifyOutcome>): Verification => ({ chain: CHAIN, offChain, answer });
const passed = v({ state: 'done', value: { valid: true, ms: 123 } }, { state: 'done', value: outcome(true) });

/** The text of the dd beside the dt with this label. */
function line(box: HTMLElement, label: string): { text: string; tone: string } {
  const dt = Array.from(box.querySelectorAll('dt')).find((d) => d.textContent === label);
  if (!dt) throw new Error(`no row '${label}' in: ${box.textContent}`);
  const dd = dt.nextElementSibling as HTMLElement;
  return { text: dd.textContent ?? '', tone: dd.className };
}

describe('renderResult', () => {
  it('never turns server text into markup', () => {
    const hostile = '<img src=x onerror="window.pwned=1"><script>window.pwned=2</script>';
    const box = renderResult(document, { requestId: RID, status: 'error', error: hostile, errorCode: 'E2007' });
    expect(box.querySelector('img, script')).toBeNull();
    expect(box.textContent).toContain(hostile);
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
  });

  it('a completed answer shows its size and says it is being checked until the SDK answers', () => {
    const box = renderResult(document, completed);
    expect(box.className).toBe('result result-checking');
    expect(box.textContent).toContain('8,768바이트');
    expect(box.textContent).toContain('66개');
    expect(box.textContent).toContain('검증하는 중');
  });

  it('a verified answer shows both verifications, the chain and the contract, then the other checks', () => {
    const box = renderResult(document, completed, passed);
    expect(box.className).toBe('result result-verified');
    expect(box.textContent).toContain('증명을 검증했습니다.');
    expect(box.querySelector('h3')?.textContent).toBe('검증');
    expect(line(box, '오프체인 검증 (이 브라우저)')).toEqual({ text: '통과 · 0.12초', tone: 'pass' });
    expect(line(box, '온체인 검증')).toEqual({ text: '통과', tone: 'pass' });
    expect(line(box, '체인').text).toBe('Base Sepolia (84532)');
    expect(line(box, '검증 컨트랙트').text).toBe(CHAIN.verifier);
    expect(line(box, '서비스 범위')).toEqual({ text: '통과 · matches the request', tone: 'pass' });
    expect(line(box, '중복 확인 값').text).toBe('0x' + '12'.repeat(32));
    // The on-chain check is the headline line, not repeated among the others.
    expect(Array.from(box.querySelectorAll('dt')).filter((d) => d.textContent === '온체인 검증')).toHaveLength(1);
    expect(box.textContent).not.toContain('정부 서명');
  });

  it('both lines say they are checking until each settles', () => {
    const box = renderResult(document, completed, v(checking, checking));
    expect(box.className).toBe('result result-checking');
    expect(line(box, '오프체인 검증 (이 브라우저)')).toEqual({ text: '확인 중…', tone: 'checking' });
    expect(line(box, '온체인 검증')).toEqual({ text: '확인 중…', tone: 'checking' });
    expect(box.querySelector('.checks')).toBeNull();
  });

  it('the off-chain line settles on its own while the on-chain one is still checking', () => {
    const box = renderResult(document, completed, v({ state: 'done', value: { valid: true, ms: 5 } }, checking));
    expect(box.className).toBe('result result-checking');
    expect(line(box, '오프체인 검증 (이 브라우저)').text).toBe('통과 · 0.01초 미만');
    expect(line(box, '온체인 검증').text).toBe('확인 중…');
  });

  it('a proof the verifier rejects off-chain refuses the answer even when on-chain passed', () => {
    const box = renderResult(document, completed, v({ state: 'done', value: { valid: false, ms: 80 } }, { state: 'done', value: outcome(true) }));
    expect(box.className).toBe('result result-refused');
    expect(line(box, '오프체인 검증 (이 브라우저)')).toEqual({ text: '실패 · 검증 키로 확인되지 않는 증명입니다', tone: 'fail' });
  });

  it('a refused on-chain answer says so and shows why', () => {
    const box = renderResult(document, completed, v({ state: 'done', value: { valid: true, ms: 80 } }, { state: 'done', value: outcome(false) }));
    expect(box.className).toBe('result result-refused');
    expect(box.textContent).toContain('받아들일 수 없습니다');
    expect(line(box, '온체인 검증')).toEqual({ text: '실패 · verifier returned 0x0', tone: 'fail' });
  });

  it('an RPC failure reads as a failed on-chain line with its reason, without breaking the rest', () => {
    const rpcDown: VerifyOutcome = { ...outcome(false), checks: [{ name: 'on_chain', ok: false, detail: 'could not ask the verifier: RPC https://sepolia.base.org answered HTTP 503' }] };
    const box = renderResult(document, completed, v({ state: 'done', value: { valid: true, ms: 80 } }, { state: 'done', value: rpcDown }));
    expect(line(box, '온체인 검증').text).toBe('실패 · could not ask the verifier: RPC https://sepolia.base.org answered HTTP 503');
    expect(line(box, '오프체인 검증 (이 브라우저)').text).toBe('통과 · 0.08초');
  });

  it('an answer refused before the chain was asked says the contract was not asked', () => {
    const box = renderResult(document, completed, v(checking, { state: 'done', value: outcome(false, false) }));
    expect(line(box, '온체인 검증').text).toBe('실패 · 앞선 확인에서 거절되어 검증 컨트랙트에 묻지 않았습니다');
  });

  it.each([
    ['off-chain', v({ state: 'failed', reason: 'could not load the proof verifier: chunk failed' }, { state: 'done', value: outcome(true) }), '오프체인 검증 (이 브라우저)'],
    ['on-chain', v({ state: 'done', value: { valid: true, ms: 1 } }, { state: 'failed', reason: 'Unknown KProof environment' }), '온체인 검증'],
  ] as const)('a %s check that could not run is a failure with its reason', (_name, verification, label) => {
    const box = renderResult(document, completed, verification);
    expect(box.className).toBe('result result-refused');
    expect(line(box, label).tone).toBe('fail');
    expect(line(box, label).text).toMatch(/^실패 · /);
  });

  it('a hostile failure reason stays text', () => {
    const hostile = '<img src=x onerror="window.pwned=3">';
    const box = renderResult(document, completed, v({ state: 'failed', reason: hostile }, { state: 'failed', reason: hostile }));
    expect(box.querySelector('img')).toBeNull();
    expect(line(box, '온체인 검증').text).toBe(`실패 · ${hostile}`);
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
  });

  it('says what is missing from a completed answer instead of inventing it', () => {
    const box = renderResult(document, { requestId: RID, status: 'completed' });
    expect(box.textContent?.match(/\(응답에 없음\)/g)).toHaveLength(3);
  });

  it.each(['expired', 'cancelled'] as const)('renders %s without a reason row when none was sent', (status) => {
    const box = renderResult(document, { requestId: RID, status });
    expect(box.querySelector('dl')).toBeNull();
    expect(box.className).toBe(`result result-${status}`);
  });
});

describe('verdictOf and seconds', () => {
  it('is verified only when both verifications passed', () => {
    expect(verdictOf(passed)).toBe('verified');
    expect(verdictOf(v(checking, checking))).toBe('checking');
    expect(verdictOf(v({ state: 'done', value: { valid: true, ms: 1 } }, checking))).toBe('checking');
    expect(verdictOf(v({ state: 'done', value: { valid: false, ms: 1 } }, checking))).toBe('refused');
    expect(verdictOf(v(checking, { state: 'done', value: outcome(false) }))).toBe('refused');
    expect(verdictOf(v(checking, { state: 'failed', reason: 'x' }))).toBe('refused');
  });

  it.each([[0, '0.01초 미만'], [9, '0.01초 미만'], [10, '0.01초'], [999, '1.00초'], [1000, '1.0초'], [12_345, '12.3초']])('%i ms reads %s', (ms, text) => {
    expect(seconds(ms)).toBe(text);
  });
});

describe('words', () => {
  it('has words for every status the relay sends', () => {
    for (const s of ['pending', 'generating', 'completed', 'error', 'cancelled', 'expired'] as const) {
      expect(statusText({ requestId: RID, status: s })).toBe(STATUS_TEXT[s]);
    }
    expect(() => statusText({ requestId: RID, status: 'hacked' } as unknown as RequestStatus)).toThrow(/Unknown status 'hacked'/);
  });

  it('has a label for every SDK check and refuses an unknown one', () => {
    for (const name of Object.keys(CHECK_LABEL)) expect(checkLabel(name as never)).toBeTruthy();
    expect(() => checkLabel('nope' as never)).toThrow(/No label for check 'nope'/);
  });

  it.each([
    [new InputError('scope', 'empty', 'x'), '서비스 범위(scope)를 입력하세요.'],
    [new InputError('targetRegion', 'empty', 'x'), '지역을 입력하세요.'],
    [new InputError('scope', 'too_long', 'x'), '서비스 범위(scope)는 256자 이하여야 합니다.'],
    [new InputError('scope', 'control_characters', 'x'), '서비스 범위(scope)에 줄바꿈이나 제어 문자를 넣을 수 없습니다.'],
    [new InputError('ageThreshold', 'out_of_range', 'x'), '나이는 1~150 사이의 정수로 입력하세요.'],
    [new InputError('targetRegion', 'unknown_region', 'x'), '지역은 목록에 있는 시·도 중 하나여야 합니다.'],
    [new RelayError(0, 'network', 'x'), '서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.'],
    [new RelayError(429, 'rate_limited', 'x'), '요청이 너무 많습니다. 잠시 후 다시 시도하세요.'],
    [new RelayError(400, 'refused', "The relay refused the call (HTTP 400): Unknown circuit 'x'"), "서버가 요청을 거절했습니다 (HTTP 400): Unknown circuit 'x'"],
  ])('translates %s', (err, text) => {
    expect(describeError(err)).toBe(text);
  });

  it('has a choice for each SDK circuit and refuses others by name', () => {
    expect(Object.keys(CHOICES)).toEqual(['mdl_kr_ownership', 'mdl_kr_age', 'mdl_kr_region']);
    for (const id of ['coinbase_attestation', 'toString', '__proto__']) expect(() => lookupChoice(id)).toThrow(/Unknown circuit/);
  });
});
