/**
 * The three Korea Mobile ID requests this demo can make, and the input rules
 * for each. The rules mirror `validateMdlInputs` in the ZKProofport SDK
 * (proofport-app-sdk/src/deeplink.ts), which the app applies again on its
 * side; the relay does not read `inputs` at all.
 *
 * One table keyed by circuit id. An id not in it is refused by name.
 */

export const MAX_TEXT_LENGTH = 256;
export const MIN_AGE = 1;
export const MAX_AGE = 150;

/**
 * Korean si/do names, current official forms. 전라북도 became
 * 전북특별자치도 on 2024-01-18 and 강원도 became 강원특별자치도 on 2023-06-11.
 */
export const SI_DO = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시',
  '울산광역시', '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도',
  '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
] as const;

export type CircuitId = 'mdl_kr_ownership' | 'mdl_kr_age' | 'mdl_kr_region';

export interface FormValues {
  scope: string;
  ageThreshold: string;
  targetRegion: string;
}

export interface CircuitSpec {
  title: string;
  question: string;
  /** Which form fields this request uses besides scope. */
  fields: ReadonlyArray<'ageThreshold' | 'targetRegion'>;
  buildInputs(values: FormValues): Record<string, unknown>;
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

export class InputError extends Error {
  constructor(readonly field: keyof FormValues, message: string) {
    super(message);
  }
}

/** Trimmed text that is non-empty, at most 256 characters and has no control characters. */
export function checkText(field: 'scope' | 'targetRegion', label: string, raw: string): string {
  const value = raw.trim();
  if (value.length === 0) throw new InputError(field, `${label}을(를) 입력하세요.`);
  if ([...value].length > MAX_TEXT_LENGTH) throw new InputError(field, `${label}은(는) ${MAX_TEXT_LENGTH}자 이하여야 합니다.`);
  if (CONTROL_CHARS.test(value)) throw new InputError(field, `${label}에 줄바꿈이나 제어 문자를 넣을 수 없습니다.`);
  return value;
}

export function checkAge(raw: string): number {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) throw new InputError('ageThreshold', `나이는 ${MIN_AGE}~${MAX_AGE} 사이의 정수로 입력하세요.`);
  const age = Number(value);
  if (!Number.isSafeInteger(age) || age < MIN_AGE || age > MAX_AGE) {
    throw new InputError('ageThreshold', `나이는 ${MIN_AGE}~${MAX_AGE} 사이의 정수로 입력하세요.`);
  }
  return age;
}

export function checkRegion(raw: string): string {
  const value = checkText('targetRegion', '지역', raw);
  if (!(SI_DO as readonly string[]).includes(value)) {
    throw new InputError('targetRegion', `지역은 목록에 있는 시·도 중 하나여야 합니다: ${SI_DO.join(', ')}`);
  }
  return value;
}

export const CIRCUITS: Readonly<Record<CircuitId, CircuitSpec>> = {
  mdl_kr_ownership: {
    title: '신분증 소유',
    question: '유효한 모바일 신분증을 가진 사람인가요?',
    fields: [],
    buildInputs: (v) => ({ scope: checkText('scope', '서비스 범위(scope)', v.scope) }),
  },
  mdl_kr_age: {
    title: '나이',
    question: '정한 나이 이상인가요? 생년월일은 알리지 않습니다.',
    fields: ['ageThreshold'],
    buildInputs: (v) => ({
      scope: checkText('scope', '서비스 범위(scope)', v.scope),
      ageThreshold: checkAge(v.ageThreshold),
    }),
  },
  mdl_kr_region: {
    title: '거주 지역',
    question: '이 시·도에 사나요? 주소는 알리지 않습니다.',
    fields: ['targetRegion'],
    buildInputs: (v) => ({
      scope: checkText('scope', '서비스 범위(scope)', v.scope),
      targetRegion: checkRegion(v.targetRegion),
    }),
  },
};

export function lookupCircuit(id: string): CircuitSpec {
  if (!Object.prototype.hasOwnProperty.call(CIRCUITS, id)) {
    throw new Error(`Unknown circuit '${id}'. Known: ${Object.keys(CIRCUITS).join(', ')}.`);
  }
  return CIRCUITS[id as CircuitId];
}
