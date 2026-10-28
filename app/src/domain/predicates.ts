/**
 * Can this card prove what the request asks? Checked BEFORE proving, with the
 * same arithmetic the circuits use, so a request the card cannot satisfy is
 * explained to the person instead of failing inside the prover.
 */
import type {RequestInputs} from './request';
import {firstAddressToken} from './regions';
import type {CardSecrets} from './mdlInputs';

/**
 * `why` is what the screen explains (in the person's language); `reason` is
 * the developer detail logged and sent to the relay, without personal data.
 */
export type Infeasible = 'ageBelow' | 'noAddress' | 'regionDiffers';
export type Feasibility = {ok: true} | {ok: false; why: Infeasible; reason: string};

/** Birth year from "YYYYMMDD", as `assert_age` reads the first four bytes. */
export function birthYear(birth: string): number {
  if (!/^\d{8}$/.test(birth)) throw new Error('birth must be eight digits (YYYYMMDD)');
  return Number(birth.slice(0, 4));
}

export function canProve(card: CardSecrets, request: RequestInputs, currentYear: number): Feasibility {
  switch (request.circuitId) {
    case 'mdl_kr_ownership':
      return {ok: true};
    case 'mdl_kr_age': {
      const year = birthYear(card.birth);
      if (currentYear < year || currentYear - year < request.ageThreshold) {
        return {ok: false, why: 'ageBelow', reason: `card is under the requested age ${request.ageThreshold}`};
      }
      return {ok: true};
    }
    case 'mdl_kr_region': {
      if (card.address === undefined || card.address.trim().length === 0) {
        return {ok: false, why: 'noAddress', reason: 'card has no address'};
      }
      if (firstAddressToken(card.address) !== request.targetRegion) {
        return {ok: false, why: 'regionDiffers', reason: 'card address is not in the requested region'};
      }
      return {ok: true};
    }
  }
}
