# 제작·프로젝트 반영 기준

## 원본과 승인 기준

2026-10-15에 내장 이미지 생성 도구로 제작했다. 생성 모델명·seed는 확인 가능한 기록이 없으므로 임의로 기입하지 않는다. [제작 기록](approved-generation.v1.json)의 `prompt`는 당시 사용한 전문이며, 원본 이미지 2개를 참고해 생성했다. 승인된 JPEG는 추가 생성의 시각 기준이다.

스킬의 세 이미지는 이미 Bunfirvil 공개 저장소에서 쓰던 프로젝트 표지·놀이터 화면이다. 실제 입주자 사진·원본 명단은 포함하지 않는다. 이 이미지를 보유했다는 사실이 다른 자산의 공개 허가나 공식 상표 사용 승인을 뜻하지 않는다.

같은 구도·색감·형상은 재사용할 수 있지만 생성 결과는 달라질 수 있다. 단순 크롭·색 변경을 새로 생성한 일러스트로 보고하지 않는다.

## 프롬프트 적용

- 전문을 읽고 원래의 `Image 1 (og.png)`, `Image 2 (og-playground-v2.jpg)` 순서로 참고한다.
- 승인 표지까지 참고할 때에만 다음 문장을 덧붙인다. 원문을 조용히 수정하지 말고 실제 제출한 최종 프롬프트를 별도 이력에 저장한다.

```text
Image 3 (og-playground-v3.jpg) is the USER-APPROVED RESULT STYLE reference.
Match its warm readable apartment, dark navy/mint/gold finish, title hierarchy
and small avatar scale. Create a fresh illustration, not a pasted copy.
Keep the exact Korean copy from the main prompt unless explicitly changed.
```

- 사용자 지시가 없다면 색감·정확한 문구·공간 주인공 원칙을 유지한다. 요청이 없는 변형 세트나 추가 캐릭터를 만들지 않는다.
- 예시 호출: `$bunfirvil-playground-illustration 승인된 분위기로 분퍼빌 링크 표지를 새로 한 장 만들어줘.`

## Windows 웹 표지 변환

PowerShell과 Windows의 `System.Drawing`을 사용한다. 이미지 생성에는 API 키나 CLI가 필요하지 않으며 아래 스크립트는 로컬 변환만 한다. 비 Windows 환경에서는 이 스크립트를 실행하지 않고 호스트의 승인된 이미지 변환 도구로 같은 치수·크롭을 적용한다.

프로젝트 루트에서 이미 존재하는 출력 디렉터리와 아직 없는 새 버전 파일을 지정한다.

```powershell
# Source는 도구가 반환한 실제 생성 파일 경로로 교체한다.
pwsh -NoProfile -File .agents/skills/bunfirvil-playground-illustration/scripts/prepare-link-preview.ps1 -Source "<생성 원본.png>" -Output "<기존 출력 디렉터리>/og-playground-v4.jpg"
```

1200×630 중앙 크롭, JPEG 품질 88로 저장하며 기존 출력 파일은 거부한다. 가로세로비가 다르면 제목이 잘릴 수 있으므로 원본과 변환 결과를 모두 직접 확인한다. 작은 원본을 키워도 세부 품질이 회복되지는 않는다.

## Bunfirvil에서 사용할 때

- 배포본은 `public/og-playground-vN.jpg`, 제작 이력은 `docs/assets/og-playground-vN.json`의 새 버전으로 둔다. 원본 생성 이미지는 `output/imagegen/bunfirvil-playground/images/` 등 배포 밖 작업 경로에 보관한다.
- 링크 표지 교체를 요청받았을 때만 `index.html`의 Open Graph·Twitter 이미지 URL과 한글 대체 설명을 함께 갱신한다. 절대 공개 URL을 사용하고 선언 치수와 실제 1200×630 치수가 일치하게 한다.
- 기존 소비 경로와 호환성을 위해 과거 표지는 임의 삭제하지 않는다.
- 스킬과 참고 이미지 폴더는 `public/` 아래로 복사하지 않는다. 이 패키지는 앱에 번들하지 않는 제작 자료다.
- 배포가 범위에 포함될 때 `npm run build`, `npm run verify:dist`와 현재 저장소 배포 절차를 따른다. 공개 이미지 접근, OG/Twitter 연결과 캐시용 버전 URL을 확인한다.

## PVP RPG에서 사용할 때

- 루트 `AGENTS.md`와 `docs/agent/domains/assets.md`, `docs/agent/skills/imagegen-skill-operating-policy.md`의 해당 지침을 먼저 읽는다. 출력 보관·갤러리 경로는 `docs/agent/skills/imagegen-output-reference.md`를 따른다.
- 생성 후보는 `output/imagegen/bunfirvil-playground/images/` 등 프로젝트가 정한 카테고리에 원본과 함께 보관한다. 갤러리 계약이 적용되면 기존 운영 파일도 갱신한다.
- PVP용 반영 경로와 소비 지점을 먼저 찾는다. Bunfirvil의 `public/` 경로나 GitHub Pages URL을 PVP의 런타임 경로로 가정하지 않는다.
- 이 표지의 그림체를 쓴다고 분퍼빌 검수맵·단지 배치도·캐릭터·가구 recipe를 재생성하지 않는다. 기존 dirty 변경과 생성 snapshot을 보존한다.
- 커밋·푸시·서버 게시를 자동 수행하는 스킬이 아니다. 현재 요청의 별도 승인과 저장소 규칙에 따른다.

## 검수와 인계

- 한글 3줄이 정확하고 글자가 프레임 밖으로 잘리지 않는지, 썸네일 크기에서도 아파트가 읽히는지 확인한다.
- 원래 표지의 영어·실제 화면의 HUD·금액·미니맵이 새 이미지에 섞이지 않았는지 확인한다.
- 캐릭터가 주택보다 과도하게 커지거나 분리된 방·창호가 무너지지 않았는지 확인한다. 실측 정확성을 주장하지 않는다.
- 파일을 다시 열어 치수·JPEG 형식·파일 크기와 크롭 결과를 확인한다.
- 결과 파일과 실제 제출 프롬프트·사용 참고 이미지·변환 명령·검수 내용을 전달한다. 생성하지 않았다면 재생성했다고 말하지 않는다.

## 두 프로젝트의 스킬 유지

이 폴더는 두 프로젝트의 `.agents/skills/bunfirvil-playground-illustration/`에 자체 완결 복사본으로 둔다. 다른 저장소의 위치나 개인 계정 경로가 없어도 참고 이미지를 사용할 수 있다. 스킬을 개선하면 두 복사본의 같은 파일을 함께 갱신하고 상대 링크·스크립트·파일 해시를 확인한다. 호스트 프로젝트 정책은 복사하지 않고 위 경로에서 읽는다.
