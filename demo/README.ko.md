# KProof 데모

[English](README.md) | **한국어**

서비스 역할을 하는 정적 페이지입니다. 질문(신분증 소유, 최소 나이, 거주 시·도)을 고르면
kproof-server의 relay에서 요청을 받아 딥링크를 QR 코드와 버튼으로 보여 주고, KProof 앱의
응답을 Socket.IO로 기다립니다(연결이 안 되면 주기적으로 조회). 앱은 아직 없어서 실제
요청은 "기다리는 중"에서 끝납니다.

스테이징: https://stg-demo.koreanproof.com (서버 https://stg-api.koreanproof.com)

## 빌드와 실행

relay 주소와 환경 이름은 빌드할 때 정해지고 기본값이 없습니다. 없으면 빌드가 실패합니다.

```bash
npm ci
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
| 빈 값, 공백만, 256자와 257자(글자 수로 세므로 이모지는 한 글자), 한국어와 여러 문자 혼합, U+2028을 포함한 제어 문자, SQL·HTML·와일드카드 문자열은 그대로 유지 | `src/__tests__/requests.test.ts` |
| 나이 0, 1, 150, 151, 소수, 지수 표기, 전각 숫자; 현재 목록에 없는 시·도(전라북도는 거절, 전북특별자치도는 허용) | `src/__tests__/requests.test.ts` |
| relay로 보내는 요청 본문 전체; 400/429/502/네트워크 실패 문구; 응답의 필드 누락; 조회 주소의 요청 ID 인코딩 | `src/__tests__/relay.test.ts` |
| 소켓 최종 응답이 오면 조회 중단; 다른 요청의 이벤트 무시; 5xx와 네트워크 오류는 계속 조회; 404는 만료; 모르는 상태는 거절 | `src/__tests__/relay.test.ts` |
| 서버 문자열은 절대 마크업이 되지 않음; 완료 응답은 증명 크기와 입력 수를 보여 주고, 빠진 값은 빠졌다고 표시 | `src/__tests__/view.test.ts` |
| 실제 relay: 회로마다 딥링크가 만든 요청을 그대로 담음; 앱의 generating→cancelled 응답이 페이지에 도착; 두 번째 응답은 거절; 악의적 오류 문자열은 데이터로 유지; 모르는 회로와 증명 없는 완료 응답은 거절 | `e2e/demo.e2e.test.ts` |
| 서빙된 페이지: 이 relay 전용으로 빌드됨, CSP가 연결 대상을 그 relay로 제한, 브랜드 파일과 폰트 제공 | `e2e/demo.e2e.test.ts` |

다루지 않는 것: 증명 검증(아직 KProof 검증기가 없고, 페이지가 그렇게 표시함), 실제 휴대폰의
응답(앱이 아직 없음).

`public/brand`의 브랜드 파일과 `public/fonts`의 Pretendard 폰트는 KProof 브랜드 킷 v1.0
(`masselabs/kproof-website` `brand/`, 커밋 `d6eb2c1`)에서 가져왔습니다. 이 저장소의 MIT
라이선스는 이 파일들에 적용되지 않으며, 폰트는 SIL Open Font License(`public/fonts/OFL.txt`)를
따릅니다.
