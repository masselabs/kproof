/**
 * Incoming `kproof://` links. A link that fails validation is shown as an
 * error and never answered (its callbackUrl is whatever its author wrote).
 * A request this phone already answered is not shown again (E1007).
 */
import {currentEnv} from '../config/buildEnv';
import {parseProofRequestUrl} from '../domain/request';
import {toAppError} from '../errors';
import {decline} from '../services/answerFlow';
import {session} from '../state/session';
import {answered, answerFlowDeps} from './deps';

export async function handleIncomingUrl(url: string): Promise<void> {
  let request;
  try {
    request = parseProofRequestUrl(url, currentEnv());
  } catch (err) {
    const e = toAppError(err, 'E1001');
    session.showError(e.code, e.detail);
    return;
  }
  if (await answered.has(request.requestId)) {
    session.showError('E1007', `request ${request.requestId} was answered earlier on this phone`);
    return;
  }
  const previous = session.get().pendingRequest;
  if (previous && previous.requestId !== request.requestId) {
    // One request on screen at a time; the one it replaces is told so.
    await decline(answerFlowDeps, previous, 'Replaced by a newer request on the phone', undefined);
  }
  console.log(`[link] request ${request.requestId} for ${request.circuitId}`);
  session.setPendingRequest(request);
}
