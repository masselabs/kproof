# @kproof/sdk

[English](README.md) | **한국어**

KProof 사용자에게 모바일 신분증 증명을 요청하고, 응답을 기다리고, 검증합니다. 이 저장소의
데모와 앱이 씁니다.

```ts
import { RelayClient, NETWORKS, buildInputs, verifyAnswer } from '@kproof/sdk';

const relay = new RelayClient({ apiUrl: NETWORKS.staging.relayUrl });
const inputs = buildInputs('mdl_kr_age', { scope: 'my-service:signup', ageThreshold: 19 });
const { requestId, deepLink } = await relay.createRequest('mdl_kr_age', inputs, 'My service');
// deepLink를 QR 코드나 KProof 앱을 여는 링크로 보여 줍니다.
relay.watch(requestId, async (status) => {
  if (status.status !== 'completed') return;
  const outcome = await verifyAnswer({ circuitId: 'mdl_kr_age', inputs }, status, { environment: 'staging' });
  // outcome.valid, outcome.checks(통과 여부와 상관없이 모든 검사), outcome.nullifier
}, console.error);
```

## `verifyAnswer`가 검사하는 것

통과 여부와 상관없이 모든 검사를 돌려주고, 전부 통과해야 `valid`가 true입니다.

| 검사 | 거절하는 경우 |
|---|---|
| status | `completed`가 아닌 응답(그 뒤 검사는 하지 않음) |
| circuit | 요청과 다른 회로의 응답 |
| public_input_count | 회로에 맞지 않는 공개 입력 수(97 / 66 / 96) |
| public_input_format | 32바이트 hex가 아닌 값, hex가 아닌 증명 |
| scope | 다른 scope로 만든 증명(UTF-8 scope의 keccak256) |
| age_threshold | 요청과 다른 나이로 만든 증명 |
| current_year | 올해(한국 시간)가 아닌 연도. 작년은 새해 첫날 하루만 허용 |
| region | 다른 시·도로 만든 증명(이름을 64바이트로 0 채움한 keccak256) |
| on_chain | Base Sepolia의 회로별 검증 컨트랙트가 정확히 `true`를 돌려주지 않은 경우 |

모르는 회로 id와 환경 이름은 이름을 밝혀 오류를 냅니다.

`checkAnswer(request, answer, { environment })`는 위 검사 중 `on_chain`만 빼고
모두 하며, 동기로 돌고 네트워크를 쓰지 않습니다. 응답이 이 요청에 대한 것인지만
확인합니다. 증명을 다른 방법(예: 오프체인)으로 검증하기 전에, 다른 요청의 응답을
먼저 거절할 때 씁니다.

## 오프체인 검증

```ts
import { verifyOffChain } from '@kproof/sdk/offchain';

const { valid, ms } = await verifyOffChain('mdl_kr_age', status.proof, status.publicInputs);
```

체인 없이, 호출한 곳에서 증명을 회로의 검증 키로 확인합니다. 검증 키는 앱이 회로
파일을 받는 것과 같은 커밋의 이 저장소에서 읽고, SHA-256이 `CIRCUITS`에 고정한 값과
다르면 거절합니다. 검증기(약 3MB)는 처음 호출할 때만 불러오므로 패키지 기본
경로를 가져오는 것만으로는 내려받지 않습니다. 모르는 회로, 형식이 맞지 않는 증명이나
공개 입력, 읽을 수 없거나 값이 다른 검증 키처럼 확인할 수 없을 때는 이유를 밝혀
거절합니다.

## 테스트

```bash
npm test            # 단위 테스트(RPC는 흉내), 모든 검사의 통과·실패, 실제 증명의 오프체인 검증
npm run test:e2e    # 실제 증명(fixtures/)을 배포된 검증 컨트랙트에 확인
```

`fixtures/mdl_*`는 zkproofport/circuits가 회로마다 만드는 증명이며, 온체인 검증을
통과합니다(`circuits/scripts/verify-onchain.sh`, 2026-10-27).
