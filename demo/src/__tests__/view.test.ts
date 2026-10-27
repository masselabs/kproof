import { describe, expect, it } from 'vitest';
import type { RequestStatus, VerifyOutcome } from '@kproof/sdk';
import { InputError, RelayError } from '@kproof/sdk';
import { STATUS_TEXT, renderResult, statusText } from '../view';
import { CHECK_LABEL, checkLabel, describeError } from '../messages';
import { CHOICES, lookupChoice } from '../choices';

const RID = '30924642-c99c-4349-b0bb-09e5641fe281';
const completed: RequestStatus = {
  requestId: RID, status: 'completed', circuit: 'mdl_kr_age',
  proof: '0x' + 'ab'.repeat(8768), publicInputs: Array.from({ length: 66 }, () => '0x' + '0'.repeat(64)),
};
const outcome = (valid: boolean): VerifyOutcome => ({
  valid,
  checks: [
    { name: 'scope', ok: true, detail: 'matches the request' },
    { name: 'on_chain', ok: valid, detail: valid ? 'verifier returned true' : 'verifier returned 0x0' },
  ],
  nullifier: '0x' + '12'.repeat(32),
  issuerVerified: false,
  network: { chainId: 84532, verifier: '0x45d4850a9b197ceba185b5069fb13ce0be1dc6d6' },
});

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

  it('a verified answer lists every check and the nullifier, and no issuer disclaimer', () => {
    const box = renderResult(document, completed, outcome(true));
    expect(box.className).toBe('result result-verified');
    expect(box.textContent).toContain('증명을 검증했습니다.');
    expect(box.textContent).toContain('온체인 검증통과 · verifier returned true');
    expect(box.textContent).toContain('0x' + '12'.repeat(32));
    expect(box.textContent).not.toContain('정부 서명');
  });

  it('a refused answer says so and shows the failing check', () => {
    const box = renderResult(document, completed, outcome(false));
    expect(box.className).toBe('result result-refused');
    expect(box.textContent).toContain('받아들일 수 없습니다');
    expect(box.textContent).toContain('실패 · verifier returned 0x0');
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
    [new InputError('scope', 'empty', 'x'), '서비스 범위(scope)을(를) 입력하세요.'],
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
