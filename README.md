# bunfirvil

분당 퍼스트빌리지 검수맵과 PVP RPG 프론트엔드 렌더링 성능을 공개하는 서버리스 데모입니다.

- 공개 주소: <https://is2js.github.io/bunfirvil/>
- 검수 관리: <https://is2js.github.io/bunfirvil/manage/>
- 건축물 관리: <https://is2js.github.io/bunfirvil/building-admin/>
- 인테리어 관리: <https://is2js.github.io/bunfirvil/interior-admin/>
- Markdown 가이드: <https://is2js.github.io/bunfirvil/guides/>
- 저장 방식: 브라우저 `localStorage`와 JSON 가져오기·내보내기
- 서버 기능: 없음 — 인증, DB, Socket.IO, 전투 판정, 원본 게시 기능을 포함하지 않습니다.

## 포함 범위

- 검수맵 4종: 51A, 55A, 55B, 59A
- 전 평형 A형 원본과 원본 RPG 단지배치 계약의 B형 대칭·회전 변환
- 원본 검수맵의 바닥·방·벽·창호·문·주방 fixture·충돌 구조
- 원본 Three.js 소품 레시피 83종과 Blender GLB 중간 LOD 5종
- 캐릭터 에셋 키 100·200
- 기본 공격, 쇼크스턴, 더블애로우, 텔레포트와 원본 스킬 아이콘·효과
- 인게임 CSS 형태를 옮긴 6칸 로컬 핫바(1·2·3 / 4·5·6), 커서 텔레포트, B옵션 팔레트와 견적·소품 갱신
- 시스템에어컨 일반형·고급형 카드별 설치 대수 증감과 인게임형 좌하단 선택 옵션·합계 바
- 우측 상단 A·B형 실시간 평면 미니맵과 조작 캐릭터 위치·방향 표시
- 맵별 로컬 검수 상태, 메모, 옵션 조합, JSON 백업·복원
- 원본 인테리어 미리보기 83개를 쓰는 메인 PBR 가구 배치와 검수 관리자 2D·3D 배치·이동·회전·반전·복제·크기 조절·JSON 백업
- 건축 구성 트리·2D 평면·Three.js PBR·원본 속성·로컬 검수 JSON을 묶은 독립 건축물 관리자
- 같은 가구 이미지와 배치 좌표를 사용하는 독립 인테리어 관리자

단지 전체맵, 구조·벽 자체 편집, 서버 publish와 revision 복구는 공개본에서 제외합니다. 관리자의 가구 배치는 브라우저 로컬 초안일 뿐 원본 PVP에 반영되지 않습니다.

## 조작법

- `WASD` 또는 방향키: 인게임과 동일한 32×24px 투영에서 420ms마다 정수 셀 한 칸 이동. 이동 중에는 출발 방향을 유지하고 셀 도착 뒤 다음 입력 방향을 적용
- 상단 `A형`·`B형`: 평형별 원본 또는 단지배치용 대칭·회전 건물을 선택하며 구조물·가구·충돌 셀이 함께 변환
- 캐릭터 클릭 또는 상단 선택기: 돌범(100)·피치(200) 조작 대상 전환
- 캐릭터 몸통에 커서를 올리면 이름 표시, HP는 RPG와 같은 머리 위 위치에 표시
- 숫자키 `1`–`6` 또는 핫바 클릭: 액션 실행(5·6번은 기본 빈 슬롯)
- 핫바 드래그: 슬롯 순서 변경
- `1` 또는 마우스 휠 클릭: 현재 커서 위치로 로컬 텔레포트
- 빈 맵 좌클릭 드래그: 손바닥 커서로 카메라 이동(캐릭터 선택 또는 위치 초기화로 추적 복귀)
- 마우스 휠: RPG 기준 100%에서 커서 위치 중심으로 건물·배경·캐릭터를 함께 확대·축소 (`Shift+휠`은 선택 가구 회전)
- 메인 `가구 배치`: 원본 이미지 카드 선택 후 PBR 바닥 클릭, 배치 후 화면이나 `적용만 보기` 목록에서 다시 선택, 드래그 이동·미니 도구 재배치·`Shift+휠` 회전·`Del` 삭제
- B옵션 화면 가구: 좌클릭하면 RPG식 금색 선택 마스크와 이름표 표시, 우클릭하면 조작 메뉴 표시, `L`은 현재 회전을 유지한 채 1.15m 안의 가장 가까운 벽면으로 자석 스냅
- B옵션·가구 팔레트: 탭 본문 전체를 세로 스크롤하며 `적용만 보기`로 현재 적용 옵션 또는 실제 배치 가구만 필터링
- 캐릭터가 실내·북서 방향 벽 뒤로 이동하면 카메라-캐릭터 시선을 가리는 벽만 부드럽게 반투명 처리
- 관리 페이지 2D·3D: 양쪽 화면에서 드래그 이동, 0.05m 스냅, ±90° 회전·반전·복제·크기 조절·삭제
- 직접 링크: `/?map=<mapId>&actor=100|200&variant=A|B`

이 사이트의 스킬 쿨다운과 효과는 프론트엔드 시연용입니다. 실제 피해, 명중, MP, 서버 판정을 표현하지 않습니다.

## Markdown 가이드 추가

`src/guides/content/`에 front matter가 포함된 `.md` 파일을 추가하면 가이드 페이지의 문서 목록과 `?guide=<id>` URL이 빌드 시 자동 생성됩니다. `id`, `title`, `shortTitle`, `category`, `summary`, `updatedAt`, `order`를 지정할 수 있으며 원문은 가이드 페이지에서도 확인할 수 있습니다.

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

추출 결과는 `public/generated/exports/<exportId>/`에 버전 고정되며 `source-export.json`에 원본 HEAD, dirty 여부, 파일별 SHA-256이 기록됩니다. 맵 구조물 JSON, 공개 승인된 GLB, Three.js 소품 레시피, B옵션 미리보기 41개와 가구·가전 팔레트 미리보기 83개도 같은 snapshot에 고정됩니다.

## 현재 원본 snapshot

- export ID: `5847f2bc6867-dirty-f1070a816e46`
- PVP HEAD: `5847f2bc68678bdb8fe65d3a5399018f3fae1284`
- 작업 트리 상태: `dirty` 선별 snapshot
- canonical pointer: [`public/generated/current.json`](public/generated/current.json)

`current.json`과 해당 export의 `source-export.json`이 배포 파일의 기준 기록입니다. 절대 로컬 경로와 작업자 정보는 기록하지 않습니다.

## 공개 자산 정책

추출기는 명시적 화이트리스트만 허용합니다. runtime에 필요한 맵 JSON, minimap, 정제된 캐릭터 manifest와 sheet, 선택된 스킬 아이콘·효과, 공개 승인된 Blender GLB·Three.js 레시피·B옵션 데이터만 포함합니다. 하드코딩된 추출 경로는 [`config/public-assets.allowlist.json`](config/public-assets.allowlist.json)의 유지관리자 검토 공개 승인 목록과 정확히 일치해야 하며, 외부·미확인·권리 불명 자산은 기본 거부됩니다.

이 승인 목록은 프로젝트 운영을 위한 maintainer-reviewed publication approval이며, 소유권이나 재배포 권리에 대한 법적 증명이 아닙니다. 공개 전 최종 권리 확인 책임을 대체하지 않습니다.

다음 항목은 공개하지 않습니다.

- 원본 sprite frame과 작업용 source 폴더
- 참조 사진, 감사 로그, draft, DB와 환경 파일
- 사용자·작업자 식별자와 절대 로컬 경로
- 재배포 권리를 확인하지 못한 외부 자산

원본 런타임의 raster `hud_bottom.png`는 출처가 프로젝트 밖으로 연결되어 공개본에서 제외했습니다. 대신 같은 런타임의 슬롯 크기, 간격, 키 표기와 쿨다운 형태를 CSS로 옮기고 서버리스 데모 액션 4개만 남겼습니다.

GitHub Pages에 포함된 파일은 누구나 내려받을 수 있습니다. `operatorOnly`나 `privateMap` 같은 원본 서버 플래그를 보안 경계로 사용하지 않습니다.

## 배포

`main`에 push하면 GitHub Actions가 단위 테스트, 정적 빌드, 누출 검사와 Chromium 스모크를 한 번 수행한 뒤 Pages artifact를 배포합니다. 빌드 기준 경로는 `/bunfirvil/`이며 모든 자산 URL은 그 하위경로를 기준으로 계산됩니다.
