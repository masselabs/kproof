import QRCode from 'qrcode';
import './tokens.css';
import './style.css';
import { RelayClient, SI_DO, buildInputs, verifyAnswer, type CircuitId } from '@kproof/sdk';
import { verifyOffChain } from '@kproof/sdk/offchain';
import { CHOICES, lookupChoice } from './choices';
import { ENVIRONMENTS, loadConfig } from './config';
import { describeError } from './messages';
import { createVerifier } from './verification';
import { renderResult, statusText } from './view';
import { startShell } from './shell';

const DAPP_NAME = 'KProof 데모';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

const config = loadConfig();
const relay = new RelayClient({ apiUrl: config.apiUrl });

const form = el<HTMLFormElement>('request-form');
const choices = el<HTMLFieldSetElement>('circuit-choices');
const submit = el<HTMLButtonElement>('submit');
const formError = el<HTMLParagraphElement>('form-error');
const panel = el<HTMLElement>('request-panel');
const statusLine = el<HTMLParagraphElement>('status');
const result = el<HTMLDivElement>('result');
const openApp = el<HTMLAnchorElement>('open-app');
const requestIdText = el<HTMLElement>('request-id');
const qr = el<HTMLCanvasElement>('qr');
const regionSelect = form.elements.namedItem('targetRegion') as HTMLSelectElement;

const { badge, verify: verifyEnvironment } = ENVIRONMENTS[config.env];
el('env-badge').textContent = badge;

startShell(document, window, {
  cuEnv: { apiUrl: config.apiUrl, environment: verifyEnvironment },
  loadCu: () => import('./cu/mount').then((m) => m.mountCu),
  onCuError: (err) => {
    el('panel-cu').textContent = `CU 데모를 불러오지 못했습니다: ${err instanceof Error ? err.message : String(err)}`;
  },
});

for (const name of SI_DO) {
  const option = document.createElement('option');
  option.value = name;
  option.textContent = name;
  regionSelect.append(option);
}

let selected: CircuitId = 'mdl_kr_age';
for (const [id, spec] of Object.entries(CHOICES) as Array<[CircuitId, typeof CHOICES[CircuitId]]>) {
  const label = document.createElement('label');
  label.className = 'choice';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'circuit';
  input.value = id;
  input.checked = id === selected;
  const title = document.createElement('strong');
  title.textContent = spec.title;
  const question = document.createElement('span');
  question.textContent = spec.question;
  label.append(input, title, question);
  choices.append(label);
}

function showFields(): void {
  const spec = lookupChoice(selected);
  for (const field of ['ageThreshold', 'targetRegion'] as const) {
    el(`field-${field}`).hidden = !spec.fields.includes(field);
  }
}
choices.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  if (target.name === 'circuit') {
    lookupChoice(target.value);
    selected = target.value as CircuitId;
    showFields();
  }
});
showFields();

function formValues() {
  const get = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement).value;
  return { scope: get('scope'), ageThreshold: get('ageThreshold'), targetRegion: get('targetRegion') };
}

function showFormError(message: string): void {
  formError.textContent = message;
  formError.hidden = false;
}

let stopWatching: (() => void) | undefined;

/** Shows the answer at once, then each verification as it settles; only the latest answer draws. */
const verifier = createVerifier(verifyEnvironment, { verifyAnswer, verifyOffChain }, (s, v) => {
  result.replaceChildren(renderResult(document, s, v));
  result.hidden = false;
});
let busy = false;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (busy) return;
  formError.hidden = true;

  let inputs: Record<string, unknown>;
  try {
    inputs = buildInputs(selected, formValues());
  } catch (err) {
    showFormError(describeError(err));
    return;
  }

  busy = true;
  submit.disabled = true;
  submit.textContent = '요청 만드는 중…';
  try {
    const circuitId = selected;
    const created = await relay.createRequest(circuitId, inputs, DAPP_NAME);
    await QRCode.toCanvas(qr, created.deepLink, { width: 220, margin: 1, errorCorrectionLevel: 'L' });
    openApp.href = created.deepLink;
    requestIdText.textContent = created.requestId;
    verifier.cancel();
    result.hidden = true;
    result.replaceChildren();
    statusLine.textContent = statusText({ requestId: created.requestId, status: 'pending' });
    form.hidden = true;
    panel.hidden = false;
    stopWatching = relay.watch(
      created.requestId,
      (s) => {
        statusLine.textContent = statusText(s);
        if (s.status !== 'pending' && s.status !== 'generating') verifier.show(circuitId, inputs, s);
      },
      (err) => {
        statusLine.textContent = `상태를 확인하지 못했습니다: ${err.message}`;
      },
    );
  } catch (err) {
    showFormError(describeError(err));
  } finally {
    busy = false;
    submit.disabled = false;
    submit.textContent = '증명 요청 만들기';
  }
});

el<HTMLButtonElement>('reset').addEventListener('click', () => {
  stopWatching?.();
  stopWatching = undefined;
  verifier.cancel();
  panel.hidden = true;
  form.hidden = false;
});
