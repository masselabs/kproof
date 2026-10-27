import { describe, expect, it } from 'vitest';
import { STATUS_TEXT, renderResult, statusText } from '../view';
import type { RequestStatus } from '../relay';

const RID = '30924642-c99c-4349-b0bb-09e5641fe281';

describe('renderResult', () => {
  it('never turns server text into markup', () => {
    const hostile = '<img src=x onerror="window.pwned=1"><script>window.pwned=2</script>';
    const box = renderResult(document, { requestId: RID, status: 'error', error: hostile, errorCode: 'E2007' });
    expect(box.querySelector('img, script')).toBeNull();
    expect(box.textContent).toContain(hostile);
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
  });

  it('shows the proof size in bytes and the public input count', () => {
    const box = renderResult(document, {
      requestId: RID, status: 'completed', circuit: 'mdl_kr_age',
      proof: '0x' + 'ab'.repeat(16_256), publicInputs: Array.from({ length: 66 }, () => '0x0'),
    });
    expect(box.textContent).toContain('16,256바이트');
    expect(box.textContent).toContain('66개');
    expect(box.textContent).toContain('mdl_kr_age');
    expect(box.textContent).toContain('아직 하지 않음');
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

describe('statusText', () => {
  it('has words for every status the relay sends', () => {
    for (const s of ['pending', 'generating', 'completed', 'error', 'cancelled', 'expired'] as const) {
      expect(statusText({ requestId: RID, status: s })).toBe(STATUS_TEXT[s]);
    }
  });

  it('refuses a status it has no words for', () => {
    expect(() => statusText({ requestId: RID, status: 'hacked' } as unknown as RequestStatus)).toThrow(/Unknown status 'hacked'/);
  });
});
