# KProof

[English](README.md) | **한국어**

KProof는 한국의 신원 증명 수단으로 영지식 증명(zero-knowledge proof)을 만드는
앱입니다. 첫 대상은 모바일 신분증입니다. 사용자는 일정 나이 이상이라는 것처럼 자신에
관한 사실 하나를 증명하고, 증명을 요청한 서비스는 그 사실만 알게 될 뿐 신분증의 다른
정보는 받지 않습니다.

증명은 사용자의 휴대폰에서 만들어집니다. 증명의 바탕이 되는 신분증 정보는 기기 밖으로
나가지 않습니다.

## 진행 상황

스테이징에서 테스트 중입니다.

## 구조

KProof의 공개 코드를 모두 이 저장소 하나에 둡니다. 회로를 바꾸면 앱, SDK, 회로가 한
커밋 안에서 함께 바뀌도록 하기 위해서입니다.

```
app/        KProof 모바일 앱 (iOS, Android): 모바일 신분증을 읽고 기기에서 증명 생성
sdk/        서비스용 SDK: 증명 요청을 만들고 받은 응답을 검증
circuits/   모바일 신분증 증명용 Noir 회로 (mdl/kr-ownership, kr-age, kr-region)
mopro/      기기 안 증명기 Rust 크레이트. scripts/mopro_build.sh가 app/mopro_bindings를 만듦
demo/       데모 페이지: 증명 요청을 만들고 응답을 기다림
```

서버(증명 요청 relay와 KOMSCO와 통신하는 SP 모듈)는 별도의 비공개 저장소
`kproof-server`에 있습니다.

## 증명기와 회로 빌드

- 회로: 도구 버전은 `circuits/toolchain.env`에 고정(nargo 1.0.0-beta.19, bb
  4.2.0-aztecnr-rc.2). `circuits/scripts/install-toolchain.sh` 후
  `circuits/scripts/build.sh mdl/kr-age`. 커밋된 `target/` 파일은
  zkproofport/circuits의 CI 빌드를 복사한 것입니다(커밋 973b9e9, `mdl/`은 Base Sepolia
  검증 컨트랙트를 배포한 35a8df4 이후 바뀌지 않음). 로컬에서 다시 빌드하면 바이트코드와 검증
  키는 같고, nargo가 `file_map`에 적는 절대 경로만 달라지므로 로컬 빌드는 커밋하지 않습니다.
- 기기 안 증명기: `scripts/install-mopro-toolchain.sh` 후 `scripts/mopro_build.sh`.
  네이티브 라이브러리를 `app/mopro_bindings/`에 쓰며, 이 바이너리는 빌드 결과물이라
  커밋하지 않습니다.

## 링크

- 웹사이트: [koreanproof.com](https://koreanproof.com) (준비 중)
- 서버 API: `api.koreanproof.com` (예정), 스테이징 `stg-api.koreanproof.com`
- 데모(스테이징): [stg-demo.koreanproof.com](https://stg-demo.koreanproof.com)

## 라이선스

[MIT](LICENSE). 이 라이선스는 코드에만 적용되며, KProof 이름과 브랜드 이미지에는
적용되지 않습니다.

## 연락처

KProof는 마세랩스(Masse Labs, GitHub [masselabs](https://github.com/masselabs))가 만듭니다.
문의나 제보는 이 저장소에 issue를 열어 주십시오.
