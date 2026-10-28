jest.mock('react-native', () => ({Platform: {OS: 'ios'}, NativeModules: {}}));

import {isParticle, josa} from '../josa';
import i18n from '..';
import ko from '../locales/ko.json';
import en from '../locales/en.json';
import {SI_DO} from '../../domain/regions';

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

describe('Korean screen text built from run-time words', () => {
  const t = i18n.getFixedT('ko');
  const cards = Object.values(ko.cardTypes).map((c) => c.name);
  const biometry = Object.values(ko.biometry);

  test('every card name', () => {
    expect(cards).toHaveLength(5);
    for (const name of cards) {
      expect(t('request.useCard', {card: name})).toBe(`${name}으로 증명`);
      expect(t('home.removeTitle', {card: name})).toBe(`${name}을 지울까요?`);
      expect(t('addId.mismatch', {chose: name, received: name, detail: 'x'})).toBe(
        `${name}을 골랐는데 모바일 신분증 앱이 ${name}을 보냈습니다. 모바일 신분증 앱에서 대표 신분증을 ${name}으로 바꾼 뒤 다시 가져오세요. (x)`,
      );
    }
  });

  test('every region', () => {
    for (const r of SI_DO) {
      expect(t('cannot.regionDiffers', {region: r})).toBe(`이 신분증의 주소는 ${r}${endsInConsonant(r) ? '이' : '가'} 아닙니다.`);
    }
  });

  test('every biometry label', () => {
    expect(t('lock.unlockBiometric', {kind: ko.biometry.Fingerprint})).toBe('지문으로 잠금 해제');
    expect(t('request.approve', {kind: ko.biometry.Face})).toBe('얼굴 인식으로 확인하고 증명');
    expect(t('request.approve', {kind: ko.biometry.FaceID})).toBe('Face ID로 확인하고 증명');
    for (const label of biometry) {
      expect(t('lock.unlockBiometric', {kind: label})).toBe(`${label}${endsInConsonant(label) ? '으로' : '로'} 잠금 해제`);
    }
  });

  test('the done line', () => {
    expect(t('done.body', {who: ko.request.inAppName, what: ko.facts.mdl_kr_ownership})).toBe('KProof 앱은 본인 확인만 받았습니다.');
    expect(t('done.body', {who: '데모 쇼핑몰', what: '나이'})).toBe('데모 쇼핑몰은 나이만 받았습니다.');
    expect(t('done.body', {who: '데모 사이트', what: '나이'})).toBe('데모 사이트는 나이만 받았습니다.');
  });

  test('every josa use in ko.json resolves through the formatter, never raw', () => {
    // A misspelled formatter name or particle makes i18next print the bare
    // word, which reads as broken Korean rather than failing.
    const raw = JSON.stringify(ko);
    const uses = [...raw.matchAll(/\{\{\w+, josa\(p: ([^)]*)\)\}\}/g)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThanOrEqual(9);
    for (const p of uses) expect(isParticle(p)).toBe(true);
    expect(raw).not.toMatch(/josa(?!\(p: )/);
  });
});

describe('English never runs Korean particles', () => {
  test('en.json has no josa formatter', () => {
    expect(JSON.stringify(en)).not.toMatch(/josa/);
  });

  test('English sentences take the word as it is', () => {
    const t = i18n.getFixedT('en');
    expect(t('request.useCard', {card: en.cardTypes.comdl_v1_5.name})).toBe("Prove with your Mobile Driver's License");
    expect(t('lock.unlockBiometric', {kind: en.biometry.Fingerprint})).toBe('Unlock with fingerprint');
  });
});
