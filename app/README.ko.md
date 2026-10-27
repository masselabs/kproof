# KProof 앱

[English](README.md) | **한국어**

KProof 모바일 앱입니다(React Native 0.81.4, iOS 우선). 모바일 신분증을 한 번 가져와
휴대폰에 보관하고, 서비스의 증명 요청에 기기 안에서 만든 영지식 증명으로 답합니다.

- 지갑, 계정, 서버 쪽 증명 생성이 없습니다.
- 번들 ID `com.masselabs.kproof`, 표시 이름 `KProof`, URL 스킴 `kproof`.
- 회로: `mdl_kr_ownership`, `mdl_kr_age`, `mdl_kr_region`. 한 저장소의 한 커밋에
  고정합니다(아래 "회로").

## 휴대폰 밖으로 나가는 것

| 데이터 | 가는 곳 | 언제 |
|---|---|---|
| 신분증 정보(이름, 생년월일, 주소, CI, 전화번호) | RAON OACX 서버(`cx.raonsecure.co.kr`). 정부 모바일 신분증 앱의 제출을 휴대폰으로 중계합니다 | 신분증을 가져올 때만("신분증 추가"). 지금 모바일 신분증 제출이 앱에 닿는 경로가 이것뿐이라 피할 수 없습니다 |
| 증명과 공개 입력(scope 해시, nullifier, 요청한 나이 기준이나 시·도 해시) | 요청의 callback URL. 허용 목록에 있는 KProof relay여야 합니다 | 사용자가 요청을 승인할 때 |
| `generating`, `cancelled`, `error`와 오류 코드 | 같은 callback | 요청에 답하는 동안 |
| 회로 파일(내려받기만) | `raw.githubusercontent.com/masselabs/kproof/<고정 커밋>/circuits/...` | 회로마다 첫 증명 때 |

그 밖에는 아무것도 보내지 않습니다. 가져온 신분증 정보는 Keychain 항목 하나(Android:
Keystore, AES-GCM)에 저장하고, 이 항목은 생체 인증(`BIOMETRY_CURRENT_SET`)이 있어야
열립니다. 생체 인증이 등록되지 않은 기기에서는 기기 암호로 엽니다. Face ID나 지문을
다시 등록하면 항목이 무효가 되고, 앱은 신분증을 다시 가져오라고 안내합니다. 기록은
휴대폰에만 남습니다(AsyncStorage, 평문: 무엇을 누구에게 언제 증명했고 결과가 어땠는지.
신분증 정보는 없음).

## 빌드

준비물: Node `>=20.19.4`(`.nvmrc`는 24), iOS 시뮬레이터가 있는 Xcode, `.ruby-version`의
Ruby와 Bundler(`Gemfile`이 CocoaPods 1.16.1 고정), 증명기 빌드 도구
(`../scripts/install-mopro-toolchain.sh`).

```bash
../scripts/mopro_build.sh         # ../mopro에서 증명기를 빌드해 app/mopro_bindings에 넣음
cd app
npm install                       # .npmrc: ignore-scripts (아래 참고)
(cd ios && bundle install && bundle exec pod install)
npm run typecheck && npm test
npx react-native run-ios          # 또는 ios/KProof.xcworkspace 열기
```

### 증명기 바인딩(`mopro_bindings/`)

`package.json`은 `"mopro-ffi": "file:./mopro_bindings"`에 의존합니다. 바인딩 패키지의
소스와 템플릿(podspec, `package.json`, `cpp/`, `ios/`, `src/`, `lib/`, Android 빌드 파일)은
git에 들어 있습니다. 네이티브 라이브러리는 빌드 결과물이라 커밋하지 않습니다:
`MoproFfiFramework.xcframework/**/*.a`(iOS 슬라이스마다 약 150 MB)와
`android/src/main/jniLibs/`. `../scripts/mopro_build.sh`가 `../mopro`(mopro-ffi 0.3.7,
noir_rs v1.0.0-beta.19, barretenberg 4.2.0-aztecnr-rc.2 — 회로 산출물을 만든 것과 같은
barretenberg)로 빌드하고 `../scripts/sync-mopro-bindings.sh`가 여기에 씁니다.

`.npmrc`는 `ignore-scripts=true`입니다. 의존성 중 설치 스크립트가 있는 것은 바인딩
패키지의 devDependencies로 들어오는 lefthook뿐인데, 첫 설치 때 저장소 루트에
`lefthook.yml`을, `.git/hooks`에 git hook을 만들었습니다.

### 회로

`src/config/circuits.ts`는 출처를 하나만 둡니다: `{repo, commit, root}` —
`masselabs/kproof`의 `2eecca9958c4527765111386645e1654408eb3a0`, `circuits/` 아래.
그리고 거기서 내려받는 모든 파일(회로 JSON, SRS, 검증 키)의 sha256을 그 커밋의
`SHA256SUMS`에서 옮겨 적어 둡니다. 다이제스트가 다른 파일은 지우고 증명을 멈춥니다.
브랜치, "최신", 대체 출처는 없습니다. 이 파일들은 `zkproofport/circuits` `35a8df4`와
바이트 단위로 같고, SDK가 확인하는 Base Sepolia 검증 컨트랙트가 그 커밋에서 배포되었습니다.
각 검증 컨트랙트의 바이트코드에 고정된 키의 `vk_hash`가 들어 있습니다.

## 실제 iPhone

```bash
# 환경 변수에 ASC_KEY_ID, ASC_ISSUER_ID, ASC_API_KEY(base64로 인코딩한 .p8)
scripts/build-device.sh <기기-UDID> staging
```

빌드 스크립트가 부르는 `scripts/dev-profile.py`는 팀 R4G32CVY29에 앱 ID
`com.masselabs.kproof`를 등록하고, 그 기기용 "KProof Development" 프로필을 설치합니다.
이미 있는 것은 다시 씁니다. 기기는 팀에 미리 등록되어 있어야 합니다. 빌드는 Release(JS
번들 포함, Metro 불필요)이고, 서명과 번들을 확인한 뒤 `devicectl`로 설치합니다. 처음 실행:
2026-10-27, iPhone 16 Pro Max, 프로필 유효기간 2027-10-27.

## 환경

`src/config/env.ts`에 환경(`development`, `staging`)마다 한 행이 있습니다: relay
callback 허용 목록, 회로 출처, RAON 주소. 모르는 환경 이름은 예외를 던집니다. 빌드의
환경은 `src/config/buildEnv.ts`에서 정합니다.

## 예외 상황

코드보다 먼저 정리한 예외 상황 표와 각 행을 지키는 테스트 이름은
[README.md의 "Edge cases"](README.md#edge-cases-written-before-the-code-each-row-names-its-test)에
있습니다. 테스트 이름이 영어라 한 곳에만 둡니다.

### 끝에서 끝까지(사람과 실제 휴대폰이 필요)

정부 모바일 신분증 앱은 실기기에서만 돌아가므로, 전체 경로는 모바일 신분증이 설치된
휴대폰에서 수동으로 확인합니다.

1. 신분증 종류(주민등록증, 운전면허증, 국가보훈등록증, 외국인등록증)마다 가져오고, 신분증
   화면에서 저장된 항목을 확인합니다.
2. https://stg-demo.koreanproof.com 에서 회로마다 요청을 하나씩 만들고, 휴대폰에서
   딥링크를 열어 승인한 뒤, 데모가 `completed`를 받고 SDK가 고정된 Base Sepolia 검증
   컨트랙트로 증명을 검증하는지 봅니다.
3. 하나는 거절(데모에 `cancelled`), 하나는 시간 초과(데모에 `expired`, 늦은 답에는 앱이
   E1003), 이미 답한 링크를 다시 열기(앱이 E1007, 아무것도 보내지 않음).

이 저장소의 시뮬레이터 확인은 실제 스테이징 요청으로 만든 증명 요청 화면까지입니다.

## 아직 안 된 것

- QR 스캔("QR로 요청 받기"): 카메라 라이브러리가 필요합니다. 지금은 딥링크로만 요청을 받습니다.
- 앱 아이콘: 브랜드 키트의 512 px 원본이 비공개 `masselabs/kproof-website`에 있어 템플릿 아이콘 그대로입니다.
- 정부 서명 확인: 회로가 아직 발급자 서명을 검증하지 않습니다(RAON HS256 무결성 필드가 회로에서 주석 처리됨). 그래서 디자인의 "정부 서명 확인" 표시는 넣지 않았습니다.
- 나이 회로는 출생 연도와 올해를 비교합니다(`mdl/kr-common`의 `assert_age`). 즉 만 나이가 아니라 연 나이를 증명하며, 화면에도 "출생 연도 기준"이라고 씁니다.

## 라이선스

코드: MIT([../LICENSE](../LICENSE)). Pretendard(`assets/fonts`, v1.3.9 릴리스의 정적 OTF를
수정 없이 사용)는 SIL Open Font License(`assets/fonts/OFL.txt`)를 따릅니다.
`assets/brand`의 KProof 마크는 브랜드 키트에서 왔으며 MIT 라이선스 대상이 아닙니다.
