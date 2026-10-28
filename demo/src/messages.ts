/**
 * Korean words for the SDK's errors and checks. The SDK speaks English with
 * stable codes; the page translates the codes here, one table each, and a code
 * with no row is an error rather than a blank.
 */
import type { Check, InputField, InputProblem, RelayErrorKind } from '@kproof/sdk';
import { InputError, MAX_AGE, MAX_TEXT_LENGTH, MIN_AGE, RelayError } from '@kproof/sdk';

/** Each field's name with the particle it takes, written out: the names are fixed, so no particle is guessed. */
interface FieldWords {
  object: string;
  topic: string;
  at: string;
}

const FIELD: Record<InputField, FieldWords> = {
  scope: { object: '서비스 범위(scope)를', topic: '서비스 범위(scope)는', at: '서비스 범위(scope)에' },
  ageThreshold: { object: '나이를', topic: '나이는', at: '나이에' },
  targetRegion: { object: '지역을', topic: '지역은', at: '지역에' },
};

const PROBLEM: Record<InputProblem, (f: FieldWords) => string> = {
  empty: (f) => `${f.object} 입력하세요.`,
  too_long: (f) => `${f.topic} ${MAX_TEXT_LENGTH}자 이하여야 합니다.`,
  control_characters: (f) => `${f.at} 줄바꿈이나 제어 문자를 넣을 수 없습니다.`,
  not_an_integer: () => `나이는 ${MIN_AGE}~${MAX_AGE} 사이의 정수로 입력하세요.`,
  out_of_range: () => `나이는 ${MIN_AGE}~${MAX_AGE} 사이의 정수로 입력하세요.`,
  unknown_region: () => '지역은 목록에 있는 시·도 중 하나여야 합니다.',
};

const RELAY: Record<RelayErrorKind, (e: RelayError) => string> = {
  network: () => '서버에 연결할 수 없습니다. 잠시 후 다시 시도하세요.',
  rate_limited: () => '요청이 너무 많습니다. 잠시 후 다시 시도하세요.',
  refused: (e) => `서버가 요청을 거절했습니다 (HTTP ${e.status}): ${e.message.replace(/^The relay refused the call \(HTTP \d+\): /, '')}`,
  bad_response: () => '서버가 예상하지 못한 응답을 보냈습니다.',
};

export const CHECK_LABEL: Readonly<Record<Check['name'], string>> = {
  status: '응답 상태',
  circuit: '회로',
  public_input_count: '공개 입력 수',
  public_input_format: '형식',
  scope: '서비스 범위',
  age_threshold: '나이 조건',
  current_year: '기준 연도',
  region: '지역',
  on_chain: '온체인 검증',
};

export function describeError(err: unknown): string {
  if (err instanceof InputError) return PROBLEM[err.problem](FIELD[err.field]);
  if (err instanceof RelayError) return RELAY[err.kind](err);
  return `요청을 만들지 못했습니다: ${err instanceof Error ? err.message : String(err)}`;
}

export function checkLabel(name: Check['name']): string {
  const label = CHECK_LABEL[name];
  if (label === undefined) throw new Error(`No label for check '${String(name)}'`);
  return label;
}
