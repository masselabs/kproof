# KProof 데모

[English](README.md) | **한국어**

서비스 역할을 하는 정적 페이지입니다. 질문(신분증 소유, 최소 나이, 거주 시·도)을 고르면
kproof-server의 relay에서 요청을 받아 딥링크를 QR 코드와 버튼으로 보여 주고, KProof 앱의
응답을 Socket.IO로 기다립니다(연결이 안 되면 주기적으로 조회). 응답이 오면 `@kproof/sdk`(`../sdk`)로
두 번 검증하고 각각 끝나는 대로 보여 줍니다. 오프체인 검증은 이 브라우저에서 회로의 검증 키로,
온체인 검증은 Base Sepolia의 회로별 검증 컨트랙트로 하며(체인과 컨트랙트 주소 표시), 그 아래에
나머지 검사(scope, 나이나 지역, 연도)를 보여 줍니다.

스테이징: https://stg-demo.koreanproof.com (서버 https://stg-api.koreanproof.com)

## 탭

탭은 주소의 `?tab=`으로 정합니다(`src/tabs.ts`). `?tab=` 없는 주소는 위의 증명 요청 데모,
`?tab=cu`는 CU × KProof 결제 화면이고, 그 밖의 값은 그 값을 밝히는 '없는 탭' 화면을 보여 주며
다른 탭으로 바꾸지 않습니다. 탭을 바꿔도 각 탭의 상태는 남고 주소가 따라 바뀌며, 뒤로/앞으로
가기로 이전 탭에 돌아갑니다.

CU 결제 화면(`src/cu/`, React, 처음 열 때 불러옴)은 19세 이상 상품 하나를 팝니다. 매번 새 scope
(`kproof-demo:cu:checkout:<uuid>`)와 `ageThreshold: 19`로 `mdl_kr_age` 증명을 요청하고, QR과 앱
링크를 보여 주며, 증명이 도착하고 2초 뒤에 수신 내역을 엽니다. 이어서 온체인 검증(dKRW 결제
영수증까지, 화면 표시용이며 지갑·송금 없음)이나 브라우저 안의 오프체인 검증을 고릅니다. 두 방법
모두 먼저 이 요청에 대한 응답이 아니면 검증기를 부르지 않고 거절합니다(SDK의 `checkAnswer`).
한국어와 영어를 지원하며, 고른 언어는 로컬 저장소에 남습니다. 페이지의 나머지와 같은 relay와
환경을 씁니다. zkproofport/proofport-app-demo(20d631c, dca9e53, hsy822)에서 옮겨 왔습니다.

## 빌드와 실행

relay 주소와 환경 이름은 빌드할 때 정해지고 기본값이 없습니다. 없으면 빌드가 실패합니다.

```bash
npm ci   # 저장소 루트에서 (npm workspace)
VITE_KPROOF_API_URL=https://stg-api.koreanproof.com VITE_KPROOF_ENV=staging npm run dev
npm test                                           # 단위 테스트 (jsdom)
scripts/e2e.sh https://stg-api.koreanproof.com staging   # E2E, 아래 참고
```

`scripts/e2e.sh`는 그 relay용 nginx 이미지를 만들어 로컬 컨테이너로 띄우고, 컨테이너와 실제
relay를 상대로 `e2e/`를 실행합니다. 앱 쪽은 앱과 똑같이 relay의 callback에 응답을 보내는
방식으로 대신합니다. 배포된 페이지를 시험하려면 `KPROOF_E2E_DEMO_URL`을 지정하십시오.

배포: `.github/workflows/deploy-demo.yml` (workflow_dispatch, main에서만). 공개 페이지의
`/version.txt`가 빌드한 커밋을 보고하는지 확인합니다.

## 테스트가 지키는 것

| 경우 | 위치 |
|---|---|
| relay 주소 누락, https 아님, 경로·쿼리·계정 포함; 모르는 환경 이름(`toString`, `__proto__` 포함) | `src/__tests__/config.test.ts` |
| 입력 규칙, relay 클라이언트, 응답 검증 | SDK 자체 테스트(`sdk/`) |
| SDK의 모든 오류 코드와 검사 이름에 한국어 문구가 있음; 모르는 것은 오류 | `src/__tests__/view.test.ts` |
| 서버 문자열은 절대 마크업이 되지 않음; 완료 응답은 증명 크기와 입력 수를 보여 주고, 빠진 값은 빠졌다고 표시 | `src/__tests__/view.test.ts` |
| 오프체인·온체인 줄: 확인 중, 통과(시간 / 체인 / 컨트랙트), 실패와 이유(검증기 불러오기 실패, RPC 실패, 거절된 증명); 둘 다 통과해야 검증 완료 | `src/__tests__/view.test.ts` |
| 두 검증은 완료 응답에만 시작; 이전 요청의 늦은 결과가 새 결과를 덮지 않음; 새 요청 뒤에는 아무것도 그리지 않음; 예외를 던진 검사도 실패로 끝남 | `src/__tests__/verification.test.ts` |
| 실제 relay: 회로마다 딥링크가 만든 요청을 그대로 담음; 앱의 generating→cancelled 응답이 페이지에 도착; 두 번째 응답은 거절; 악의적 오류 문자열은 데이터로 유지; 모르는 회로와 증명 없는 완료 응답은 거절 | `e2e/demo.e2e.test.ts` |
| 실제 증명을 담은 완료 응답: relay → SDK → Base Sepolia 검증 컨트랙트가 true; 알 수 없는 견본 scope만 실패 | `e2e/demo.e2e.test.ts` |
| 서빙된 페이지: 이 relay 전용으로 빌드됨, CSP가 연결 대상을 relay, 검증 RPC, 검증 키를 읽는 곳으로 제한, 브랜드 파일과 폰트 제공 | `e2e/demo.e2e.test.ts` |
| 탭: `?tab=` 없는 주소, 탭 id별, 모르는 값(빈 값, 대소문자, `toString`, `__proto__`, 마크업, UTF-8, 10,000자)은 어떤 탭도 되지 않음; 없는 탭 문구는 글자로만; 클릭, 뒤로 가기, 보조키 클릭; CU는 한 번만 늦게 불러오고 실패하면 다시 시도; 탭 줄이 결제 화면 언어를 따름 | `src/__tests__/tabs.test.ts` |
| CU 결제: 요청 모양과 새 scope, 페이지의 relay와 환경, 2초 대기, 취소·만료·화면 해제 뒤 남는 것 없음, 검증기 각각과 둘 다, scope·나이·연도·회로가 다르거나 형식이 틀린 응답은 검증기 호출 전에 거절, 검증기 실패와 시간 초과, 온체인 성공 뒤에만 결제 영수증, 한국어/영어 | `src/__tests__/cu.test.tsx` |
| 실제 relay의 CU: 한국어·영어 요청 이름이 딥링크에 그대로 담김; 다른 요청용 실제 증명은 `checkAnswer`가 거절; 그림 파일과 늦게 불러오는 묶음이 제공되며 그 묶음에는 자체 relay 주소가 없음 | `e2e/demo.e2e.test.ts` |

`public/brand`의 브랜드 파일과 `public/fonts`의 Pretendard 폰트는 KProof 브랜드 킷 v1.0
(`masselabs/kproof-website` `brand/`, 커밋 `d6eb2c1`)에서 가져왔습니다. 이 저장소의 MIT
라이선스는 이 파일들에 적용되지 않으며, 폰트는 SIL Open Font License(`public/fonts/OFL.txt`)를
따릅니다.

`public/cu/`는 CU 탭의 그림입니다. `cu-symbol.svg`는 CU 브랜드 색상 가이드의 벡터 도형(CU 상표는
BGF리테일 소유), `budweiser.png`는 손대지 않은 버드와이저 제품 사진(권리는 AB InBev 소유)이며,
둘 다 이 저장소의 라이선스가 적용되지 않습니다.
