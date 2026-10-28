/**
 * Korean particles after a word only known at run time (a card name, a region,
 * a biometry label, a service name). The particle depends on whether the last
 * syllable ends in a consonant (받침), so a fixed '는' or '로' reads wrong for
 * half the words: "KProof 앱에서 직접 증명는", "지문로".
 */
export type Particle = '은' | '는' | '이' | '가' | '을' | '를' | '과' | '와' | '으로' | '로';

const PAIRS: Readonly<Record<Particle, readonly [withFinal: string, withoutFinal: string]>> = {
  은: ['은', '는'],
  는: ['은', '는'],
  이: ['이', '가'],
  가: ['이', '가'],
  을: ['을', '를'],
  를: ['을', '를'],
  과: ['과', '와'],
  와: ['과', '와'],
  으로: ['으로', '로'],
  로: ['으로', '로'],
};

export function isParticle(value: unknown): value is Particle {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PAIRS, value);
}

const RIEUL = 8;

// How a trailing digit or Latin letter is read aloud, as the final consonant
// of that reading: 0 영, 1 일, 3 삼, 6 육, 7 칠, 8 팔, L 엘, M 엠, N 엔, R 알.
// Everything else (2 이, D 디, ID 아이디, ...) ends in a vowel.
const READ_FINAL: Readonly<Record<string, number>> = {
  '0': 21, '1': RIEUL, '3': 16, '6': 1, '7': RIEUL, '8': RIEUL,
  l: RIEUL, m: 16, n: 4, r: RIEUL,
};

/** The final consonant index of the word's last readable character (0 = none). */
function finalOf(word: string): number {
  const chars = Array.from(word.replace(/[\s)\]}'"”’.,!?]+$/u, ''));
  const last = chars[chars.length - 1];
  if (last === undefined) return 0;
  const code = last.codePointAt(0)!;
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28;
  return READ_FINAL[last.toLowerCase()] ?? 0;
}

/** `word` followed by the particle that fits it: josa('지문', '로') -> '지문으로'. */
export function josa(word: string, particle: Particle): string {
  const [withFinal, withoutFinal] = PAIRS[particle];
  const fin = finalOf(word);
  if (particle === '으로' || particle === '로') {
    return word + (fin === 0 || fin === RIEUL ? withoutFinal : withFinal);
  }
  return word + (fin === 0 ? withoutFinal : withFinal);
}
