# bunfirvil

분당 퍼스트빌리지 검수맵과 PVP RPG 프론트엔드 렌더링 성능을 공개하는 서버리스 데모입니다.

- 공개 주소: <https://is2js.github.io/bunfirvil/>
- 검수 관리: <https://is2js.github.io/bunfirvil/manage/>
- 저장 방식: 브라우저 `localStorage`와 JSON 가져오기·내보내기
- 서버 기능: 없음 — 인증, DB, Socket.IO, 전투 판정, 원본 게시 기능을 포함하지 않습니다.

## 포함 범위

- 검수맵 4종: 51A, 55A, 55B, 59A
- 캐릭터 에셋 키 100·200
- 기본 공격, 쇼크스턴, 더블애로우, 텔레포트
- 8칸 로컬 핫바, B옵션 팔레트와 견적
- FPS·p95 frame time·렌더러·활성 chunk·자산 캐시 표시
- 맵별 로컬 검수 상태, 메모, 옵션 조합, JSON 백업·복원

단지 전체맵, 구조·벽·가구 배치 편집, 서버 publish와 revision 복구는 1차 공개본에서 제외합니다.

## 조작법

- `WASD` 또는 방향키: 선택 캐릭터 이동
- 캐릭터 클릭 또는 상단 선택기: 100·200 조작 대상 전환
- 숫자키 `1`–`8` 또는 핫바 클릭: 액션 실행
- 핫바 드래그: 슬롯 순서 변경
- `B`: B옵션 팔레트 열기·닫기

이 사이트의 스킬 쿨다운과 효과는 프론트엔드 시연용입니다. 실제 피해, 명중, MP, 서버 판정을 표현하지 않습니다.

## 로컬 개발

Node.js 22 이상이 필요합니다.

```bash
npm ci
npm run dev
```

주요 검증 명령:

```bash
npm run test:unit
npm run build
npm run verify:dist
npx playwright install chromium
npm run test:smoke
```

PVP 원본의 선별 자산 snapshot을 갱신할 때만 다음 명령을 사용합니다. 원본 저장소에는 쓰지 않습니다.

```bash
npm run sync:assets -- --source ../pvp
```

추출 결과는 `public/generated/exports/<exportId>/`에 버전 고정되며 `source-export.json`에 원본 HEAD, dirty 여부, 파일별 SHA-256이 기록됩니다.

## 현재 원본 snapshot

- export ID: `cfdeea65422f-dirty-1066b632f6df`
- PVP HEAD: `cfdeea65422f581ef67c1aa11421924fdc29bc39`
- 작업 트리 상태: `dirty` 선별 snapshot
- canonical pointer: [`public/generated/current.json`](public/generated/current.json)

`current.json`과 해당 export의 `source-export.json`이 배포 파일의 기준 기록입니다. 절대 로컬 경로와 작업자 정보는 기록하지 않습니다.

## 공개 자산 정책

추출기는 명시적 화이트리스트만 허용합니다. runtime에 필요한 맵 JSON, minimap, 정제된 캐릭터 manifest와 sheet, 선택된 스킬 효과, 공개 승인된 B옵션 데이터만 포함합니다. 하드코딩된 추출 경로는 [`config/public-assets.allowlist.json`](config/public-assets.allowlist.json)의 유지관리자 검토 공개 승인 목록과 정확히 일치해야 하며, 외부·미확인·권리 불명 자산은 기본 거부됩니다.

이 승인 목록은 프로젝트 운영을 위한 maintainer-reviewed publication approval이며, 소유권이나 재배포 권리에 대한 법적 증명이 아닙니다. 공개 전 최종 권리 확인 책임을 대체하지 않습니다.

다음 항목은 공개하지 않습니다.

- 원본 sprite frame과 작업용 source 폴더
- 참조 사진, 감사 로그, draft, DB와 환경 파일
- 사용자·작업자 식별자와 절대 로컬 경로
- 재배포 권리를 확인하지 못한 외부 자산

GitHub Pages에 포함된 파일은 누구나 내려받을 수 있습니다. `operatorOnly`나 `privateMap` 같은 원본 서버 플래그를 보안 경계로 사용하지 않습니다.

## 배포

`main`에 push하면 GitHub Actions가 단위 테스트, 정적 빌드, 누출 검사와 Chromium 스모크를 한 번 수행한 뒤 Pages artifact를 배포합니다. 빌드 기준 경로는 `/bunfirvil/`이며 모든 자산 URL은 그 하위경로를 기준으로 계산됩니다.
