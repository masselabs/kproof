import {getEnv} from '../../config/env';
import {AppError} from '../../errors';
import {encodeBase64Url, utf8Encode, decodeBase64Url, utf8Decode} from '../bytes';
import {MAX_DATA_LENGTH, parseProofRequestUrl} from '../request';

const staging = getEnv('staging');
const ID = '3f1c2a4b-5d6e-4f70-8a9b-0c1d2e3f4a5b';
const CALLBACK = 'https://stg-api.koreanproof.com/api/v1/proof/callback';

function base(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestId: ID,
    circuitId: 'mdl_kr_age',
    inputs: {scope: 'demo.koreanproof.com', ageThreshold: 19},
    callbackUrl: CALLBACK,
    dappName: 'KProof 데모',
    createdAt: '2026-10-27T12:00:00.000Z',
    ...over,
  };
}

function link(obj: unknown): string {
  return `kproof://proof-request?data=${encodeBase64Url(utf8Encode(JSON.stringify(obj)))}`;
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    if (err instanceof AppError) return err.code;
    throw err;
  }
  throw new Error('expected a refusal');
}

function parse(obj: unknown) {
  return parseProofRequestUrl(link(obj), staging);
}

describe('bytes helpers', () => {
  test('base64url round trip, including Korean and emoji', () => {
    const text = '서울특별시 🦊 mixed ABC';
    expect(utf8Decode(decodeBase64Url(encodeBase64Url(utf8Encode(text)))!)).toBe(text);
  });
  test('invalid UTF-8 is refused', () => {
    expect(utf8Decode(Uint8Array.from([0xc0, 0x80]))).toBeNull();
    expect(utf8Decode(Uint8Array.from([0xe0, 0x80]))).toBeNull();
    expect(utf8Decode(Uint8Array.from([0xff]))).toBeNull();
  });
});

describe('parseProofRequestUrl', () => {
  test('accepts a well-formed request', () => {
    const r = parse(base());
    expect(r.circuitId).toBe('mdl_kr_age');
    expect(r.inputs).toEqual({circuitId: 'mdl_kr_age', scope: 'demo.koreanproof.com', ageThreshold: 19});
    expect(r.callbackUrl).toBe(CALLBACK);
  });

  test('refuses a link without data', () => {
    expect(codeOf(() => parseProofRequestUrl('kproof://proof-request?', staging))).toBe('E1001');
    expect(codeOf(() => parseProofRequestUrl('kproof://proof-request?data=', staging))).toBe('E1001');
    expect(codeOf(() => parseProofRequestUrl('kproof://proof-request?data=a&data=b', staging))).toBe('E1001');
  });

  test('refuses non-base64url data', () => {
    for (const bad of ['ab+c', 'ab/c', 'abc=', 'ab c', 'ab%20c', 'a']) {
      expect(codeOf(() => parseProofRequestUrl(`kproof://proof-request?data=${bad}`, staging))).toBe('E1001');
    }
  });

  test('refuses data that is not a JSON object', () => {
    const raw = (t: string) => `kproof://proof-request?data=${encodeBase64Url(utf8Encode(t))}`;
    expect(codeOf(() => parseProofRequestUrl(raw('not json'), staging))).toBe('E1001');
    expect(codeOf(() => parseProofRequestUrl(raw('[1,2]'), staging))).toBe('E1001');
    expect(codeOf(() => parseProofRequestUrl(raw('"text"'), staging))).toBe('E1001');
    expect(codeOf(() => parseProofRequestUrl(raw('null'), staging))).toBe('E1001');
  });

  test('refuses another route', () => {
    const data = link(base()).split('?')[1];
    expect(codeOf(() => parseProofRequestUrl(`kproof://other?${data}`, staging))).toBe('E1001');
    expect(codeOf(() => parseProofRequestUrl(`https://stg-api.koreanproof.com/proof-request?${data}`, staging))).toBe('E1001');
    expect(codeOf(() => parseProofRequestUrl(`zkproofport://proof-request?${data}`, staging))).toBe('E1001');
  });

  test('refuses an oversized payload', () => {
    const okData = 'A'.repeat(MAX_DATA_LENGTH);
    // 16384 characters passes the size gate (and then fails as non-JSON, not as oversized).
    expect(codeOf(() => parseProofRequestUrl(`kproof://proof-request?data=${okData}`, staging))).toBe('E1001');
    expect(codeOf(() => parseProofRequestUrl(`kproof://proof-request?data=${okData}A`, staging))).toBe('E1006');
    expect(codeOf(() => parseProofRequestUrl(`kproof://proof-request?data=${'A'.repeat(1_000_000)}`, staging))).toBe('E1006');
  });

  test('requestId must be a v4 UUID', () => {
    expect(codeOf(() => parse(base({requestId: undefined})))).toBe('E1001');
    expect(codeOf(() => parse(base({requestId: 'abc'})))).toBe('E1001');
    expect(codeOf(() => parse(base({requestId: ID.toUpperCase()})))).toBe('E1001');
    expect(codeOf(() => parse(base({requestId: '3f1c2a4b-5d6e-1f70-8a9b-0c1d2e3f4a5b'})))).toBe('E1001');
  });

  test('unknown circuit ids are refused by name', () => {
    for (const id of ['toString', '__proto__', 'constructor', '', 'coinbase_attestation', 'MDL_KR_AGE', 42, null]) {
      expect(codeOf(() => parse(base({circuitId: id})))).toBe('E1002');
    }
    try {
      parse(base({circuitId: 'toString'}));
    } catch (err) {
      expect((err as AppError).detail).toContain("'toString'");
    }
  });

  test('callbackUrl host must be on the allow-list', () => {
    for (const url of [
      'https://stg-api.koreanproof.com.evil.com/api/v1/proof/callback',
      'https://evil.com/stg-api.koreanproof.com/api/v1/proof/callback',
      'https://stg-api.koreanproof.com@evil.com/api/v1/proof/callback',
      'https://evil.com\\@stg-api.koreanproof.com/api/v1/proof/callback',
      'https://api.koreanproof.com/api/v1/proof/callback',
      'https://STG-API.koreanproof.com/api/v1/proof/callback',
      'http://localhost:8080/api/v1/proof/callback', // development only
      'https://xn--stg-api-.koreanproof.com/api/v1/proof/callback',
    ]) {
      expect(codeOf(() => parse(base({callbackUrl: url})))).toBe('E1004');
    }
    expect(codeOf(() => parse(base({callbackUrl: undefined})))).toBe('E1004');
    expect(codeOf(() => parse(base({callbackUrl: 42})))).toBe('E1004');
  });

  test('the development row allows the local relay and staging', () => {
    const dev = getEnv('development');
    const local = link(base({callbackUrl: 'http://localhost:8080/api/v1/proof/callback'}));
    expect(parseProofRequestUrl(local, dev).callbackUrl).toBe('http://localhost:8080/api/v1/proof/callback');
    expect(parseProofRequestUrl(link(base()), dev).callbackUrl).toBe(CALLBACK);
  });

  test('callbackUrl must be exactly the relay callback', () => {
    for (const url of [
      'http://stg-api.koreanproof.com/api/v1/proof/callback',
      'https://stg-api.koreanproof.com:8443/api/v1/proof/callback',
      'https://stg-api.koreanproof.com:443/api/v1/proof/callback',
      'https://stg-api.koreanproof.com/api/v1/proof/callback/',
      'https://stg-api.koreanproof.com/api/v1/proof/other',
      'https://stg-api.koreanproof.com/api/v1/proof/callback?x=1',
      'https://stg-api.koreanproof.com/api/v1/proof/callback#x',
      'ftp://stg-api.koreanproof.com/api/v1/proof/callback',
    ]) {
      expect(codeOf(() => parse(base({callbackUrl: url})))).toBe('E1004');
    }
  });

  test('scope rules', () => {
    const withScope = (scope: unknown) => base({inputs: {scope, ageThreshold: 19}});
    expect(codeOf(() => parse(base({inputs: {ageThreshold: 19}})))).toBe('E1005');
    for (const s of [42, null, '', '   ', 'a'.repeat(257), 'line\nbreak', 'tab\there', 'nul\u0000', 'sep x', 'c1\u0085']) {
      expect(codeOf(() => parse(withScope(s)))).toBe('E1005');
    }
    expect(parse(withScope('a'.repeat(256))).inputs.scope).toHaveLength(256);
    expect(parse(withScope('😀'.repeat(256))).inputs.scope).toBe('😀'.repeat(256));
  });

  test('a top-level scope must equal inputs.scope', () => {
    expect(codeOf(() => parse(base({scope: 'other'})))).toBe('E1005');
    expect(parse(base({scope: 'demo.koreanproof.com'})).inputs.scope).toBe('demo.koreanproof.com');
  });

  test('age threshold boundaries', () => {
    const age = (a: unknown) => base({inputs: {scope: 's', ageThreshold: a}});
    for (const ok of [1, 19, 150]) {
      const r = parse(age(ok));
      expect(r.inputs.circuitId === 'mdl_kr_age' && r.inputs.ageThreshold).toBe(ok);
    }
    for (const bad of [0, -1, 151, 19.5, '19', NaN, null, undefined, 1e3]) {
      expect(codeOf(() => parse(age(bad)))).toBe('E1005');
    }
  });

  test('region must be one of the 17 current si/do names', () => {
    const region = (r: unknown) => base({circuitId: 'mdl_kr_region', inputs: {scope: 's', targetRegion: r}});
    for (const ok of ['전북특별자치도', '강원특별자치도', '서울특별시', '제주특별자치도']) {
      expect(parse(region(ok)).inputs).toEqual({circuitId: 'mdl_kr_region', scope: 's', targetRegion: ok});
    }
    for (const bad of ['전라북도', '강원도', ' 서울특별시', '서울특별시 ', '서울', '', 'Seoul', 1, null]) {
      expect(codeOf(() => parse(region(bad)))).toBe('E1005');
    }
  });

  test('unknown input keys are refused', () => {
    expect(codeOf(() => parse(base({inputs: {scope: 's', ageThreshold: 19, targetRegion: '경기도'}})))).toBe('E1005');
    expect(
      codeOf(() => parse(base({circuitId: 'mdl_kr_ownership', inputs: {scope: 's', ageThreshold: 19}}))),
    ).toBe('E1005');
    expect(codeOf(() => parse(base({inputs: ['scope']})))).toBe('E1005');
    expect(codeOf(() => parse(base({inputs: null})))).toBe('E1005');
  });

  test('display text rules', () => {
    expect(codeOf(() => parse(base({dappName: 'a'.repeat(101)})))).toBe('E1005');
    expect(codeOf(() => parse(base({dappName: 'two\nlines'})))).toBe('E1005');
    expect(codeOf(() => parse(base({dappName: '   '})))).toBe('E1005');
    expect(codeOf(() => parse(base({dappName: 7})))).toBe('E1005');
    expect(codeOf(() => parse(base({message: 'm'.repeat(501)})))).toBe('E1005');
    expect(codeOf(() => parse(base({message: 'bell\u0007'})))).toBe('E1005');
    expect(parse(base({message: 'two\nlines\tok'})).message).toBe('two\nlines\tok');
    expect(parse(base({dappName: 'a'.repeat(100)})).dappName).toHaveLength(100);
  });

  test('keeps Korean and emoji text', () => {
    const r = parse(base({dappName: '한국 서비스 🇰🇷', message: '나이 확인 부탁드립니다 🙏', inputs: {scope: '스코프-✓', ageThreshold: 19}}));
    expect(r.dappName).toBe('한국 서비스 🇰🇷');
    expect(r.message).toBe('나이 확인 부탁드립니다 🙏');
    expect(r.inputs.scope).toBe('스코프-✓');
  });

  test('keeps hostile text as data', () => {
    const hostile = `<script>alert(1)</script>'; DROP TABLE x;-- %_\\`;
    const r = parse(base({dappName: hostile, inputs: {scope: hostile, ageThreshold: 19}}));
    expect(r.dappName).toBe(hostile);
    expect(r.inputs.scope).toBe(hostile);
  });

  test('returnScheme rules', () => {
    expect(parse(base({returnScheme: 'MyDapp://'})).returnScheme).toBe('mydapp://');
    for (const bad of ['https://', 'http://', 'bank://pay?to=x', 'mydapp://path', 'mydapp:', 'javascript://', ' mydapp://', '', 3]) {
      expect(codeOf(() => parse(base({returnScheme: bad})))).toBe('E1005');
    }
  });

  test('createdAt must be a time', () => {
    expect(codeOf(() => parse(base({createdAt: 'yesterday'})))).toBe('E1001');
    expect(codeOf(() => parse(base({createdAt: undefined})))).toBe('E1001');
  });
});
