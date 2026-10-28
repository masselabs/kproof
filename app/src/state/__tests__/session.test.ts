import type {ProofRequest} from '../../domain/request';
import {session} from '../session';

const req = (requestId: string) => ({requestId}) as unknown as ProofRequest;

beforeEach(() => {
  session.setPendingRequest(null);
  session.setPendingRequest(null);
});

test('finishing a proved request shows the one queued behind it', () => {
  session.setPendingRequest(req('a'));
  session.startProving('a');
  session.setQueuedRequest(req('b'));
  session.setPendingRequest(null);
  expect(session.get().pendingRequest?.requestId).toBe('b');
  expect(session.get().queuedRequest).toBeNull();
  expect(session.get().provingRequestId).toBeNull();
  session.setPendingRequest(null);
  expect(session.get().pendingRequest).toBeNull();
});

test('a proof that failed without an answer goes back to review', () => {
  session.setPendingRequest(req('a'));
  session.startProving('a');
  session.stopProving();
  expect(session.get().provingRequestId).toBeNull();
  expect(session.get().pendingRequest?.requestId).toBe('a');
});
