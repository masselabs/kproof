# KProof

[English](README.md) | **한국어**

KProof는 한국의 신원 증명 수단으로 영지식 증명(zero-knowledge proof)을 만드는
앱입니다. 첫 대상은 모바일 신분증입니다. 사용자는 일정 나이 이상이라는 것처럼 자신에
관한 사실 하나를 증명하고, 증명을 요청한 서비스는 그 사실만 알게 될 뿐 신분증의 다른
정보는 받지 않습니다.

증명은 사용자의 휴대폰에서 만들어집니다. 증명의 바탕이 되는 신분증 정보는 기기 밖으로
나가지 않습니다.

## 진행 상황

초기 개발 단계입니다. 지금 들어 있는 코드는 데모 페이지(`demo/`)뿐입니다. 서비스가 증명
요청을 만들어 서버로 보내고 앱의 응답을 기다리는 흐름까지 동작하며, 앱과 회로는 아직
없습니다. 모바일 신분증 검증 서비스를 발급·운영하는 KOMSCO(한국조폐공사)와의 연동을
준비하면서 설계를 함께 정리하고 있습니다.

## 계획 중인 구조

KProof의 공개 코드를 모두 이 저장소 하나에 둡니다. 회로를 바꾸면 앱, SDK, 회로가 한
커밋 안에서 함께 바뀌도록 하기 위해서입니다.

```
app/        KProof 모바일 앱 (iOS, Android): 모바일 신분증을 읽고 기기에서 증명 생성
sdk/        서비스용 SDK: 증명 요청을 만들고 받은 응답을 검증 (있음)
circuits/   모바일 신분증 증명용 Noir 회로
demo/       데모 페이지: 증명 요청을 만들고 응답을 기다림 (있음)
```

서버(증명 요청 relay와 KOMSCO와 통신하는 SP 모듈)는 별도의 비공개 저장소
`kproof-server`에 있습니다.

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
