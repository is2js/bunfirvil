# Bunfirvil Google Sheet 인증 설치

이 코드는 공개 GitHub Pages에서 받은 `동·호수·닉네임` 세 값이 비공개 Google Sheet의 한 행과 일치하는지만 확인합니다. Sheet 전체 내용이나 일치한 행은 응답하지 않습니다.

## 1. Google Sheet 준비

1. 새 Google Sheet를 만듭니다.
2. `확장 프로그램 → Apps Script`를 엽니다.
3. 기본 코드를 지우고 이 폴더의 `Code.gs` 전체를 붙여 넣어 저장합니다.
4. 함수 선택에서 `setupVerificationSheet`를 선택하고 `실행`합니다.
5. 최초 권한 요청을 승인합니다.

실행이 끝나면 `인증명단` 탭과 다음 헤더가 자동으로 준비됩니다.

| A | B | C |
|---|---|---|
| 동 | 호수 | 닉네임 |

2행부터 `105 | 2501 | 돌범이웃`처럼 입력합니다. `105동`, `2501호`도 허용되지만 숫자만 쓰는 형식을 권장합니다. 닉네임은 앞뒤 공백과 Unicode 표현만 정리하며 내부 공백과 영문 대소문자는 구분합니다.

## 2. 웹앱 배포

1. Apps Script 우측 상단 `배포 → 새 배포`를 선택합니다.
2. 유형은 `웹 앱`을 선택합니다.
3. 실행 사용자는 `나`, 액세스 사용자는 `모든 사용자`로 지정합니다.
4. 배포 후 발급된 `https://script.google.com/macros/s/.../exec` 주소를 복사합니다.

코드를 수정한 뒤에는 기존 배포의 `배포 관리 → 수정 → 새 버전`으로 다시 배포해야 합니다. `/dev` 테스트 주소는 공개 사이트 설정에 사용하지 않습니다.

## 3. Bunfirvil 연결

`public/config/household-verification.v1.json`을 다음처럼 변경합니다.

```json
{
  "schemaVersion": 1,
  "enabled": true,
  "provider": "google-apps-script",
  "endpoint": "https://script.google.com/macros/s/배포_ID/exec",
  "timeoutMs": 8000
}
```

Apps Script 주소는 브라우저에서 확인 가능한 공개 연결 주소이며 비밀키가 아닙니다. Spreadsheet ID와 실제 인증 명단은 저장소나 설정 파일에 넣지 않습니다.

## 4. 연결 확인

실제 명단을 넣기 전 임시 행 하나로 다음 두 경우를 확인합니다.

- 같은 동·호수·닉네임: 인증 성공
- 닉네임 한 글자 변경: 동일한 일반 실패 문구

확인이 끝나면 임시 행을 삭제합니다. Apps Script는 `GET` 조회를 허용하지 않으며 JSON `POST`에만 결과를 반환합니다.
