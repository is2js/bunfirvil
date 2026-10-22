#!/usr/bin/env node

import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LEGACY_BASE_PATH = "/bunfirvil/";
export const CANONICAL_BASE_PATH = "/naksaeng/bunfirvil/";
export const LEGACY_ENTRY_PAGES = Object.freeze([
  "", "manage", "building-admin", "interior-admin", "guides", "households", "calculator",
]);

export function legacyRedirectPathname(pathname) {
  if (typeof pathname !== "string") return null;
  for (const entry of LEGACY_ENTRY_PAGES) {
    const suffix = entry ? `${entry}/` : "";
    const legacyPath = `${LEGACY_BASE_PATH}${suffix}`;
    if (pathname === legacyPath || pathname === `${legacyPath}index.html`) {
      return `${CANONICAL_BASE_PATH}${suffix}`;
    }
  }
  return null;
}

export function legacyRedirectTarget(pathname, search = "", hash = "") {
  const targetPath = legacyRedirectPathname(pathname);
  if (!targetPath || typeof search !== "string" || typeof hash !== "string"
    || (search !== "" && !search.startsWith("?")) || (hash !== "" && !hash.startsWith("#"))) return null;
  return `${targetPath}${search}${hash}`;
}

export function renderLegacyRedirectHtml(entryPage = "") {
  if (!LEGACY_ENTRY_PAGES.includes(entryPage)) throw new Error("알 수 없는 기존 진입 페이지입니다.");
  const targetPath = `${CANONICAL_BASE_PATH}${entryPage ? `${entryPage}/` : ""}`;
  const canonicalUrl = `https://is2js.github.io${targetPath}`;
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="분당퍼스트빌리지 놀이터가 낙생지구의 새 주소로 이동했습니다." />
    <meta name="theme-color" content="#071018" />
    <link rel="canonical" href="${canonicalUrl}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="e편한세상 분당퍼스트빌리지 · 돌아온범생의 놀이터" />
    <meta property="og:description" content="낙생지구의 새 주소에서 가상 놀이터와 입주·자금 계획을 확인하세요." />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:image" content="https://is2js.github.io/naksaeng/bunfirvil/og-playground-v3.jpg" />
    <meta name="twitter:card" content="summary_large_image" />
    <title>새 주소로 이동 · 분당퍼스트빌리지 놀이터</title>
    <script>
      "use strict";
      window.location.replace(${JSON.stringify(targetPath)} + window.location.search + window.location.hash);
    </script>
    <style>body{margin:0;padding:64px 24px;background:#071018;color:#edf4f2;font:16px/1.7 system-ui,sans-serif}main{max-width:640px;margin:auto}h1{font-size:26px}a{color:#89f2dc}p{color:#a2b7bb}</style>
  </head>
  <body>
    <main>
      <h1>놀이터가 새 주소로 이동했습니다.</h1>
      <p>선택한 평면과 공유 링크를 유지하여 낙생지구의 새 놀이터로 연결합니다.</p>
      <a href="${canonicalUrl}">새 놀이터로 이동</a>
      <noscript><p>자동 이동하려면 JavaScript를 켜거나 위 링크를 눌러 주세요.</p></noscript>
    </main>
  </body>
</html>
`;
}

export async function overlayLegacyRedirects(directory = path.join(PROJECT_ROOT, "dist")) {
  const distRoot = path.resolve(directory);
  const expectedDistRoot = path.join(await realpath(PROJECT_ROOT), "dist");
  if (distRoot !== path.join(PROJECT_ROOT, "dist") || await realpath(distRoot) !== expectedDistRoot) {
    throw new Error("기존 저장소의 실제 dist 폴더에만 리다이렉트를 적용할 수 있습니다.");
  }
  // Validate every existing entry first. Never delete or replace asset directories.
  const targets = await Promise.all(LEGACY_ENTRY_PAGES.map(async (entryPage) => {
    const target = path.join(distRoot, entryPage, "index.html");
    if (!(await stat(target)).isFile() || await realpath(target) !== target) {
      throw new Error(`정상적인 기존 진입 HTML이 아닙니다: ${entryPage || "root"}`);
    }
    if (!(await readFile(target, "utf8")).includes("<html")) {
      throw new Error(`기존 HTML이 없습니다: ${entryPage || "root"}`);
    }
    return { target, entryPage };
  }));
  for (const { target, entryPage } of targets) {
    await writeFile(target, renderLegacyRedirectHtml(entryPage), "utf8");
  }
  return targets.map(({ target }) => target);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  overlayLegacyRedirects().then((files) => {
    console.log(`기존 자산을 유지하고 진입 HTML ${files.length}개만 새 주소로 연결했습니다.`);
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
