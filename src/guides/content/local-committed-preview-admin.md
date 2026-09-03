---
id: local-committed-preview-admin
title: 로컬 커밋 배포 확인
shortTitle: 커밋 미리보기
category: 운영자
summary: GitHub Pages 배포 전에 현재 HEAD 커밋만 별도 복사해 빌드·검증·미리보기하는 방법입니다.
updatedAt: 2026-09-04
order: 95
operatorOnly: true
---

# 로컬 커밋 배포 확인

> 이 문서는 운영자 인증 세션에서만 가이드 목록에 표시됩니다. 현재 작업 트리가 아니라 **마지막 로컬 커밋(HEAD)** 상태를 확인하는 절차입니다.

## 기본 실행

PowerShell에서 저장소 루트로 이동한 뒤 실행합니다.

```powershell
npm run preview:commit
```

스크립트는 `git archive HEAD`로 임시 복사본을 만들고, 그 안에서 `npm ci`, production build, `verify:dist`, Vite preview를 순서대로 실행합니다. 브라우저는 `http://127.0.0.1:4173/bunfirvil/`로 열립니다. 종료하려면 터미널에서 `Ctrl+C`를 누르세요. 임시 디렉터리는 종료 시 삭제됩니다.

## 선택 인자

```powershell
pwsh -NoProfile -File scripts/preview-committed-pages.ps1 -Port 5180 -NoBrowser
pwsh -NoProfile -File scripts/preview-committed-pages.ps1 -WithUnitTests
```

- `-Port`: 미리보기 포트를 변경합니다.
- `-NoBrowser`: 브라우저를 자동으로 열지 않습니다.
- `-WithUnitTests`: 빌드 전에 단위 테스트 전체를 실행합니다.

## 확인 범위

- 커밋되지 않은 파일은 임시 복사본에 들어가지 않습니다.
- `/bunfirvil/` 하위 경로와 정적 산출물 계약을 실제 Pages와 같은 기준으로 확인합니다.
- Google Apps Script는 별도 서비스입니다. `backend/apps-script/Code.gs` 변경은 Apps Script 편집기에 반영하고 새 웹앱 버전으로 재배포해야 합니다.
- 이 절차는 로컬 확인만 수행하며 GitHub에 push하거나 Pages를 배포하지 않습니다.
