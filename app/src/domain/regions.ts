/**
 * The 17 current si/do (시·도) names, in their official forms. 전라북도 became
 * 전북특별자치도 on 2024-01-18 and 강원도 became 강원특별자치도 on 2023-06-11;
 * the old names are not in the list and a request for one is refused.
 *
 * Same list as the KProof demo (demo/src/requests.ts). The region circuit
 * compares keccak of the zero-padded name with the first whitespace-separated
 * token of the ID's address, so the spelling must be exact.
 */
export const SI_DO = [
  '서울특별시',
  '부산광역시',
  '대구광역시',
  '인천광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시',
  '세종특별자치시',
  '경기도',
  '강원특별자치도',
  '충청북도',
  '충청남도',
  '전북특별자치도',
  '전라남도',
  '경상북도',
  '경상남도',
  '제주특별자치도',
] as const;

export type SiDo = (typeof SI_DO)[number];

export function isSiDo(value: unknown): value is SiDo {
  return typeof value === 'string' && (SI_DO as readonly string[]).includes(value);
}

/**
 * What the region circuit extracts from the address: the first run of bytes
 * that are not space, tab or NUL (`extract_region_token` in mdl/kr-common).
 * Mirrored here so the app can tell the person BEFORE proving that the
 * address does not match, instead of failing inside the prover.
 */
export function firstAddressToken(address: string): string {
  const match = /^[ \t\u0000]*([^ \t\u0000]+)/.exec(address);
  return match ? match[1] : '';
}
