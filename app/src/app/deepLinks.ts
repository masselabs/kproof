/**
 * Incoming `kproof://` links, wired to the real stores. A link that fails
 * validation is shown as an error and never answered (its callbackUrl is
 * whatever its author wrote). The rules live in ./incoming.ts.
 */
import {currentEnv} from '../config/buildEnv';
import {decline} from '../services/answerFlow';
import {isClaimed} from '../services/relayAnswer';
import {session} from '../state/session';
import {answered, answerFlowDeps} from './deps';
import {createIncomingHandler} from './incoming';

export const handleIncomingUrl = createIncomingHandler({
  env: currentEnv,
  answered,
  isAnswering: isClaimed,
  pending: () => session.get().pendingRequest,
  setPending: (request) => session.setPendingRequest(request),
  pendingIsBusy: () => {
    const {pendingRequest, provingRequestId} = session.get();
    return pendingRequest !== null && provingRequestId === pendingRequest.requestId;
  },
  queued: () => session.get().queuedRequest,
  setQueued: (request) => session.setQueuedRequest(request),
  focus: () => session.focusRequest(),
  showError: (code, detail) => session.showError(code, detail),
  declineReplaced: async (previous) => {
    await decline(answerFlowDeps, previous, 'Replaced by a newer request on the phone', undefined);
  },
  log: (message) => console.log(message),
});
