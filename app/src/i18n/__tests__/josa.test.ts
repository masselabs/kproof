import {josa} from '../josa';
import {ko} from '../ko';
import {SI_DO} from '../../domain/regions';
import {IN_APP_DAPP_NAME} from '../../services/inAppProof';

function endsInConsonant(word: string): boolean {
  const c = word.codePointAt(word.length - 1) ?? 0;
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
}

describe('josa', () => {
  test('은/는, 이/가, 을/를, 과/와 follow the final consonant', () => {
    expect(josa('KProof 앱', '는')).toBe('KProof 앱은');
    expect(josa('데모', '은')).toBe('데모는');
    expect(josa('서울특별시', '이')).toBe('서울특별시가');
    expect(josa('본인 확인', '가')).toBe('본인 확인이');
    expect(josa('모바일 주민등록증', '를')).toBe('모바일 주민등록증을');
    expect(josa('사과', '을')).toBe('사과를');
    expect(josa('책', '와')).toBe('책과');
  });

  test('으로/로: a word ending in ㄹ takes 로', () => {
    expect(josa('지문', '로')).toBe('지문으로');
    expect(josa('얼굴 인식', '로')).toBe('얼굴 인식으로');
    expect(josa('서울', '으로')).toBe('서울로');
    expect(josa('기기 암호', '으로')).toBe('기기 암호로');
  });

  test('Latin letters and digits are read aloud', () => {
    expect(josa('Face ID', '로')).toBe('Face ID로');
    expect(josa('KProof', '는')).toBe('KProof는');
    expect(josa('HTML', '은')).toBe('HTML은');
    expect(josa('버전 1', '이')).toBe('버전 1이');
    expect(josa('버전 2', '이')).toBe('버전 2가');
  });

  test('empty word, trailing space or bracket, emoji', () => {
    expect(josa('', '는')).toBe('는');
    expect(josa('지문 ', '로')).toBe('지문 으로');
    expect(josa('(지문)', '로')).toBe('(지문)으로');
    expect(josa('😀', '이')).toBe('😀가');
  });
});

describe('screen text built from run-time words', () => {
  test('every card name', () => {
    for (const t of Object.values(ko.cardTypes)) {
      expect(ko.request.useCard(t.name)).toBe(`${t.name}으로 증명`);
      expect(ko.home.removeTitle(t.name)).toBe(`${t.name}을 지울까요?`);
      expect(ko.addId.mismatch(t.name, t.name, 'x')).toBe(
        `${t.name}을 골랐는데 모바일 신분증 앱이 ${t.name}을 보냈습니다. 모바일 신분증 앱에서 대표 신분증을 ${t.name}으로 바꾼 뒤 다시 가져오세요. (x)`,
      );
    }
  });

  test('every region', () => {
    for (const r of SI_DO) {
      expect(ko.cannot.regionDiffers(r)).toBe(`이 신분증의 주소는 ${r}${endsInConsonant(r) ? '이' : '가'} 아닙니다.`);
    }
  });

  test('every biometry label', () => {
    expect(ko.lock.unlockBiometric(ko.biometry.Fingerprint)).toBe('지문으로 잠금 해제');
    expect(ko.request.approve(ko.biometry.Face)).toBe('얼굴 인식으로 확인하고 증명');
    expect(ko.request.approve(ko.biometry.FaceID)).toBe('Face ID로 확인하고 증명');
    for (const label of Object.values(ko.biometry)) {
      expect(ko.lock.unlockBiometric(label)).toBe(`${label}${endsInConsonant(label) ? '으로' : '로'} 잠금 해제`);
    }
  });

  test('the done line', () => {
    expect(ko.done.body(IN_APP_DAPP_NAME, ko.facts.mdl_kr_ownership)).toBe('KProof 앱은 본인 확인만 받았습니다.');
    expect(ko.done.body('데모 쇼핑몰', '나이')).toBe('데모 쇼핑몰은 나이만 받았습니다.');
    expect(ko.done.body('데모 사이트', '나이')).toBe('데모 사이트는 나이만 받았습니다.');
  });

  test('off-chain time never reads 0.0초', () => {
    expect(ko.done.passIn(0)).toBe('통과 · 0.01초 미만');
    expect(ko.done.passIn(42)).toBe('통과 · 0.04초');
    expect(ko.done.passIn(1830)).toBe('통과 · 1.8초');
  });
});
