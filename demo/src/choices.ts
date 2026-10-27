/**
 * What the page offers for each circuit: its title, the question a service is
 * asking, and the form fields it needs. Keyed by the SDK's circuit ids; the
 * input rules themselves live in the SDK (`buildInputs`).
 */
import type { CircuitId } from '@kproof/sdk';

export interface Choice {
  title: string;
  question: string;
  fields: ReadonlyArray<'ageThreshold' | 'targetRegion'>;
}

export const CHOICES: Readonly<Record<CircuitId, Choice>> = {
  mdl_kr_ownership: { title: '신분증 소유', question: '유효한 모바일 신분증을 가진 사람인가요?', fields: [] },
  mdl_kr_age: { title: '나이', question: '정한 나이 이상인가요? 생년월일은 알리지 않습니다.', fields: ['ageThreshold'] },
  mdl_kr_region: { title: '거주 지역', question: '이 시·도에 사나요? 주소는 알리지 않습니다.', fields: ['targetRegion'] },
};

export function lookupChoice(id: string): Choice {
  if (!Object.prototype.hasOwnProperty.call(CHOICES, id)) {
    throw new Error(`Unknown circuit '${id}'. Known: ${Object.keys(CHOICES).join(', ')}.`);
  }
  return CHOICES[id as CircuitId];
}
