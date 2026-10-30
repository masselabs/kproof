/**
 * The demo's tabs, chosen by `?tab=` in the address. Keyed by tab id; a value
 * that is not a row here is shown as an unknown tab, never as another tab.
 *
 * The address without `?tab=` is the proof request demo: that is the page
 * itself, not a stand-in for a value the table does not hold. `?tab=` with an
 * empty value is unknown like any other.
 */
export type Lang = 'ko' | 'en';

export interface Tab {
  label: Readonly<Record<Lang, string>>;
  /** Page title while the tab is open; null when the tab sets its own. */
  title: Readonly<Record<Lang, string>> | null;
  icon: string;
}

export const TABS = {
  proof: { label: { ko: '증명 요청', en: 'Proof request' }, title: { ko: 'KProof 데모', en: 'KProof demo' }, icon: '/brand/favicon.svg' },
  cu: { label: { ko: 'CU × KProof', en: 'CU × KProof' }, title: null, icon: '/cu/cu-symbol.svg' },
} as const satisfies Record<string, Tab>;

export type TabId = keyof typeof TABS;
export const TAB_IDS = Object.keys(TABS) as TabId[];
const PAGE_TAB: TabId = 'proof';

export type Route = { tab: TabId } | { unknown: string };

export function routeOf(search: string): Route {
  const raw = new URLSearchParams(search).get('tab');
  if (raw === null) return { tab: PAGE_TAB };
  if (!Object.prototype.hasOwnProperty.call(TABS, raw)) return { unknown: raw };
  return { tab: raw as TabId };
}

export function lookupTab(id: string): Tab {
  if (!Object.prototype.hasOwnProperty.call(TABS, id)) {
    throw new Error(`Unknown tab '${id}'. Known: ${TAB_IDS.join(', ')}.`);
  }
  return TABS[id as TabId];
}

export function tabHref(id: TabId): string {
  return `?tab=${id}`;
}

/** What the unknown-tab panel says, in both languages, naming the value it was given. */
export function unknownTabText(value: string): Record<Lang, string> {
  return {
    ko: `'${value}' 탭은 없습니다. 위 탭 중 하나를 고르세요.`,
    en: `There is no '${value}' tab. Choose one of the tabs above.`,
  };
}
