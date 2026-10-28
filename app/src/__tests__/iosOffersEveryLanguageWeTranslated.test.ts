/**
 * iOS is told about every language we have translations for.
 *
 * Mirrors the ZKProofport app's test. iOS gives an app a locale drawn only from
 * the app's declared CFBundleLocalizations; declare English alone and a Korean
 * phone is handed en-US, so a complete ko.json is never reached. Nothing on a
 * simulator in English shows this. The permission texts iOS itself shows
 * (camera, Face ID) come from <lang>.lproj/InfoPlist.strings, one per language.
 */
// Node built-ins, typed locally so node's types do not leak into app code (as in config.test.ts).
declare const __dirname: string;
declare function require(id: 'fs'): {
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string): string[];
  existsSync(path: string): boolean;
};
declare function require(id: 'path'): {join(...parts: string[]): string};
const fs = require('fs');
const path = require('path');

const app = path.join(__dirname, '..', '..');
const ios = path.join(app, 'ios', 'KProof');
const plist = fs.readFileSync(path.join(ios, 'Info.plist'), 'utf8');
const pbxproj = fs.readFileSync(path.join(app, 'ios', 'KProof.xcodeproj', 'project.pbxproj'), 'utf8');

const translated = fs
  .readdirSync(path.join(app, 'src', 'i18n', 'locales'))
  .filter((n: string) => n.endsWith('.json'))
  .map((n: string) => n.replace(/\.json$/, ''))
  .sort();

function declaredLanguages(): string[] {
  const block = plist.match(/<key>CFBundleLocalizations<\/key>\s*<array>([\s\S]*?)<\/array>/);
  if (!block) return [];
  return [...block[1].matchAll(/<string>([^<]*)<\/string>/g)].map((m) => m[1]);
}

/** Every *UsageDescription key Info.plist declares. */
const usageKeys = [...plist.matchAll(/<key>(NS\w+UsageDescription)<\/key>/g)].map((m) => m[1]).sort();

function stringsKeys(language: string): string[] {
  const file = path.join(ios, `${language}.lproj`, 'InfoPlist.strings');
  if (!fs.existsSync(file)) return [];
  const text = fs.readFileSync(file, 'utf8');
  return [...text.matchAll(/^"(\w+)"\s*=\s*"[^"]+";$/gm)].map((m) => m[1]).sort();
}

describe('iOS is told about every language we translated', () => {
  it('finds translation files to compare against', () => {
    expect(translated).toEqual(['en', 'ko']);
  });

  it('declares exactly the languages that have a translation file', () => {
    expect(declaredLanguages().slice().sort()).toEqual(translated);
  });

  it('falls back to English, as the app does', () => {
    expect(plist).toMatch(/<key>CFBundleDevelopmentRegion<\/key>\s*<string>en<\/string>/);
  });

  it('declares permission texts at all', () => {
    expect(usageKeys).toEqual(expect.arrayContaining(['NSCameraUsageDescription', 'NSFaceIDUsageDescription']));
  });

  it.each(['en', 'ko'])('%s.lproj/InfoPlist.strings words every permission iOS shows', (language) => {
    expect(stringsKeys(language)).toEqual(usageKeys);
  });

  it('the Xcode project bundles both InfoPlist.strings and knows both regions', () => {
    for (const language of translated) {
      expect(pbxproj).toContain(`path = KProof/${language}.lproj/InfoPlist.strings;`);
    }
    expect(pbxproj).toMatch(/InfoPlist\.strings in Resources \*\/,/);
    const regions = pbxproj.match(/knownRegions = \(([^)]*)\)/)?.[1] ?? '';
    for (const language of translated) expect(regions).toMatch(new RegExp(`\\b${language}\\b`));
  });

  it('is a plist iOS can still read', () => {
    expect((plist.match(/<dict>/g) || []).length).toBe((plist.match(/<\/dict>/g) || []).length);
    expect((plist.match(/<array>/g) || []).length).toBe((plist.match(/<\/array>/g) || []).length);
  });
});

export {};
