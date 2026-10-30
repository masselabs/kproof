/**
 * The tab bar and the panels it switches: the proof request demo, the CU
 * checkout, and the unknown-tab panel for an address naming a tab that does
 * not exist. Switching tabs keeps each tab's state (no reload); the address
 * follows the tab, and Back/Forward return to the previous tab.
 *
 * The CU checkout is a separate bundle, loaded the first time its tab opens.
 */
import { TAB_IDS, lookupTab, routeOf, tabHref, unknownTabText, type Lang, type Route, type TabId } from './tabs';
import type { CuLanguage } from './cu/i18n';
import type { CuEnv } from './cu/env';

export interface CuMounter {
  (host: HTMLElement, props: { env: CuEnv; onLanguageChange: (language: CuLanguage) => void }): { setActive: (active: boolean) => void };
}

export interface ShellDeps {
  cuEnv: CuEnv;
  /** Loads the CU bundle; called once, on first open. */
  loadCu: () => Promise<CuMounter>;
  /** Shown when the CU bundle cannot load. */
  onCuError?: (err: unknown) => void;
}

function el<T extends HTMLElement>(doc: Document, id: string): T {
  const node = doc.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

export function startShell(doc: Document, win: Window, deps: ShellDeps) {
  const nav = el<HTMLElement>(doc, 'tabs');
  const panels: Record<TabId, HTMLElement> = { proof: el(doc, 'panel-proof'), cu: el(doc, 'panel-cu') };
  const unknownPanel = el<HTMLElement>(doc, 'panel-unknown');
  const unknownKo = el<HTMLElement>(doc, 'unknown-ko');
  const unknownEn = el<HTMLElement>(doc, 'unknown-en');
  const iconLink = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!iconLink) throw new Error('Missing <link rel="icon">');
  const icon: HTMLLinkElement = iconLink;

  let route: Route = routeOf(win.location.search);
  let cuLanguage: Lang = 'ko';
  let cu: { setActive: (active: boolean) => void } | 'loading' | undefined;

  const links = new Map<TabId, HTMLAnchorElement>();
  for (const id of TAB_IDS) {
    const a = doc.createElement('a');
    a.href = tabHref(id);
    a.id = `tab-${id}`;
    a.className = 'tab';
    a.setAttribute('role', 'tab');
    a.setAttribute('aria-controls', `panel-${id}`);
    a.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if ('tab' in route && route.tab === id) return;
      win.history.pushState(null, '', tabHref(id));
      show({ tab: id });
    });
    links.set(id, a);
    nav.append(a);
  }

  const lang = (): Lang => ('tab' in route && route.tab === 'cu' ? cuLanguage : 'ko');

  function drawChrome(): void {
    const language = lang();
    doc.documentElement.lang = language;
    for (const [id, a] of links) {
      a.textContent = lookupTab(id).label[language];
      a.setAttribute('aria-selected', String('tab' in route && route.tab === id));
    }
    nav.setAttribute('aria-label', language === 'ko' ? '데모' : 'Demos');
  }

  function openCu(): void {
    if (cu === 'loading') return;
    if (cu) {
      cu.setActive(true);
      return;
    }
    cu = 'loading';
    deps.loadCu().then(
      (mount) => {
        cu = mount(panels.cu, {
          env: deps.cuEnv,
          onLanguageChange: (language) => {
            cuLanguage = language;
            drawChrome();
          },
        });
        cu.setActive('tab' in route && route.tab === 'cu');
      },
      (err: unknown) => {
        cu = undefined;
        deps.onCuError?.(err);
      },
    );
  }

  function show(next: Route): void {
    route = next;
    const active = 'tab' in next ? next.tab : undefined;
    for (const id of TAB_IDS) panels[id].hidden = id !== active;
    unknownPanel.hidden = active !== undefined;
    if ('unknown' in next) {
      const text = unknownTabText(next.unknown);
      unknownKo.textContent = text.ko;
      unknownEn.textContent = text.en;
      doc.title = 'KProof 데모';
      icon.href = lookupTab('proof').icon;
    } else {
      const tab = lookupTab(next.tab);
      if (tab.title) doc.title = tab.title[lang()];
      icon.href = tab.icon;
    }
    if (active === 'cu') openCu();
    else if (cu && cu !== 'loading') cu.setActive(false);
    drawChrome();
  }

  win.addEventListener('popstate', () => show(routeOf(win.location.search)));
  show(route);
  return { show };
}
