import { createRoot } from 'react-dom/client';
import CuDemo, { type CuDemoProps } from './CuDemo';

/** Renders the CU checkout into `host`; the page tells it when its tab is shown or hidden. */
export function mountCu(host: HTMLElement, props: Omit<CuDemoProps, 'isActive'>): { setActive: (active: boolean) => void } {
  const root = createRoot(host);
  return { setActive: (active) => root.render(<CuDemo {...props} isActive={active} />) };
}
