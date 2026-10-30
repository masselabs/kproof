import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TABS, TAB_IDS, lookupTab, routeOf, tabHref, unknownTabText } from '../tabs';
import { startShell, type CuMounter } from '../shell';
import type { CuLanguage } from '../cu/i18n';

describe('routeOf: the tab comes from ?tab= by key', () => {
  it('the bare address is the proof request demo', () => {
    expect(routeOf('')).toEqual({ tab: 'proof' });
    expect(routeOf('?other=1')).toEqual({ tab: 'proof' });
  });
  it.each(TAB_IDS)('?tab=%s opens that tab', (id) => {
    expect(routeOf(tabHref(id))).toEqual({ tab: id });
  });
  it.each(['', 'CU', 'all', 'toString', '__proto__', 'constructor', '<img src=x onerror=alert(1)>', '100%_', '한국어', '😀', 'cu\n'])(
    '?tab=%j is unknown, not another tab',
    (value) => {
      expect(routeOf(`?tab=${encodeURIComponent(value)}`)).toEqual({ unknown: value });
    },
  );
  it('a very long value stays unknown and whole', () => {
    const value = 'x'.repeat(10_000);
    expect(routeOf(`?tab=${value}`)).toEqual({ unknown: value });
  });
  it('lookupTab throws naming the key and the known ones', () => {
    expect(() => lookupTab('toString')).toThrow("Unknown tab 'toString'. Known: proof, cu.");
    expect(lookupTab('cu')).toBe(TABS.cu);
  });
  it('every tab has a Korean and an English label', () => {
    for (const id of TAB_IDS) {
      expect(TABS[id].label.ko.trim()).not.toBe('');
      expect(TABS[id].label.en.trim()).not.toBe('');
    }
  });
});

const PAGE = `
  <link rel="icon" href="/brand/favicon.svg">
  <nav id="tabs"></nav>
  <main id="panel-proof" hidden></main>
  <div id="panel-cu" hidden></div>
  <main id="panel-unknown" hidden><p id="unknown-ko"></p><p id="unknown-en"></p></main>`;
const ENV = { apiUrl: 'https://relay.example', environment: 'staging' } as const;

function setup(search: string, loadCu?: () => Promise<CuMounter>) {
  document.head.innerHTML = '';
  document.body.innerHTML = PAGE;
  window.history.replaceState(null, '', `/${search}`);
  const setActive = vi.fn();
  let language: ((l: CuLanguage) => void) | undefined;
  const mount = vi.fn<CuMounter>((_host, props) => {
    language = props.onLanguageChange;
    return { setActive };
  });
  const load = vi.fn(loadCu ?? (() => Promise.resolve(mount)));
  const onCuError = vi.fn();
  startShell(document, window, { cuEnv: ENV, loadCu: load, onCuError });
  const visible = () => ['panel-proof', 'panel-cu', 'panel-unknown'].filter((id) => !document.getElementById(id)!.hidden);
  const tab = (id: string) => document.getElementById(`tab-${id}`) as HTMLAnchorElement;
  return { setActive, mount, load, onCuError, visible, tab, language: (l: CuLanguage) => language!(l) };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('startShell: panels, address and history', () => {
  let listeners: Array<[string, EventListenerOrEventListenerObject]> = [];
  beforeEach(() => {
    listeners = [];
    const add = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, fn: EventListenerOrEventListenerObject) => {
      listeners.push([type, fn]);
      add(type, fn);
    });
  });
  afterEach(() => {
    for (const [type, fn] of listeners) window.removeEventListener(type, fn);
    vi.restoreAllMocks();
  });

  it('the bare address shows only the proof panel, Korean, and does not load the CU bundle', () => {
    const s = setup('');
    expect(s.visible()).toEqual(['panel-proof']);
    expect(s.tab('proof').getAttribute('aria-selected')).toBe('true');
    expect(s.tab('cu').getAttribute('aria-selected')).toBe('false');
    expect(s.tab('proof').textContent).toBe('증명 요청');
    expect(document.documentElement.lang).toBe('ko');
    expect(document.title).toBe('KProof 데모');
    expect(s.load).not.toHaveBeenCalled();
  });

  it('?tab=cu loads the CU bundle once with the page environment, active', async () => {
    const s = setup('?tab=cu');
    expect(s.visible()).toEqual(['panel-cu']);
    await flush();
    expect(s.load).toHaveBeenCalledTimes(1);
    expect(s.mount).toHaveBeenCalledWith(document.getElementById('panel-cu'), expect.objectContaining({ env: ENV }));
    expect(s.setActive).toHaveBeenLastCalledWith(true);
    expect(document.querySelector<HTMLLinkElement>('link[rel="icon"]')!.getAttribute('href')).toBe('/cu/cu-symbol.svg');
  });

  it('an unknown tab shows the unknown panel naming the value as text, never markup', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const s = setup(`?tab=${encodeURIComponent(hostile)}`);
    expect(s.visible()).toEqual(['panel-unknown']);
    expect(document.getElementById('unknown-ko')!.textContent).toBe(unknownTabText(hostile).ko);
    expect(document.getElementById('unknown-en')!.textContent).toBe(unknownTabText(hostile).en);
    expect(document.querySelector('#panel-unknown img')).toBeNull();
    expect(s.tab('proof').getAttribute('aria-selected')).toBe('false');
    expect(s.tab('cu').getAttribute('aria-selected')).toBe('false');
    expect(s.load).not.toHaveBeenCalled();
  });

  it('a tab click switches without reload, records history, and Back returns', async () => {
    const s = setup('');
    s.tab('cu').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(window.location.search).toBe('?tab=cu');
    expect(s.visible()).toEqual(['panel-cu']);
    await flush();
    s.tab('proof').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(s.visible()).toEqual(['panel-proof']);
    expect(s.setActive).toHaveBeenLastCalledWith(false);
    window.history.replaceState(null, '', '/?tab=cu');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(s.visible()).toEqual(['panel-cu']);
    expect(s.setActive).toHaveBeenLastCalledWith(true);
    expect(s.load).toHaveBeenCalledTimes(1);
  });

  it('a modified click (new tab) is left to the browser', () => {
    const s = setup('');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true });
    s.tab('cu').dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(s.visible()).toEqual(['panel-proof']);
  });

  it('the tab bar follows the language chosen inside the CU checkout, and back to Korean on the proof tab', async () => {
    const s = setup('?tab=cu');
    await flush();
    s.language('en');
    expect(document.documentElement.lang).toBe('en');
    expect(s.tab('proof').textContent).toBe('Proof request');
    s.tab('proof').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    expect(document.documentElement.lang).toBe('ko');
    expect(s.tab('proof').textContent).toBe('증명 요청');
  });

  it('a CU bundle that fails to load is reported, and the next open tries again', async () => {
    let attempt = 0;
    const s = setup('?tab=cu', () => (++attempt === 1 ? Promise.reject(new Error('chunk failed')) : Promise.resolve(vi.fn<CuMounter>(() => ({ setActive: vi.fn() })))));
    await flush();
    expect(s.onCuError).toHaveBeenCalledWith(expect.objectContaining({ message: 'chunk failed' }));
    s.tab('proof').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    s.tab('cu').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await flush();
    expect(attempt).toBe(2);
  });
});
