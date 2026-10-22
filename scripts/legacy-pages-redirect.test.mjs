import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import {
  CANONICAL_BASE_PATH,
  LEGACY_ENTRY_PAGES,
  legacyRedirectPathname,
  legacyRedirectTarget,
  renderLegacyRedirectHtml,
} from "./legacy-pages-redirect.mjs";

test("일곱 기존 경로와 index.html 주소를 새 동일 경로로 정규화한다", () => {
  assert.equal(LEGACY_ENTRY_PAGES.length, 7);
  for (const entry of LEGACY_ENTRY_PAGES) {
    const oldPath = `/bunfirvil/${entry ? `${entry}/` : ""}`;
    const newPath = `${CANONICAL_BASE_PATH}${entry ? `${entry}/` : ""}`;
    assert.equal(legacyRedirectPathname(oldPath), newPath);
    assert.equal(legacyRedirectPathname(`${oldPath}index.html`), newPath);
  }
  for (const value of ["/other/", "/bunfirvil/unknown/", "/bunfirvil/../", "/bunfirvil//", "https://example.com/bunfirvil/", null]) {
    assert.equal(legacyRedirectPathname(value), null);
  }
  assert.throws(() => renderLegacyRedirectHtml("unknown"));
});

test("query와 공유 fragment를 재인코딩하거나 저장소에 접근하지 않고 replace한다", () => {
  const suffixes = [
    { search: "", hash: "" },
    { search: "?map=bundang-first-village-51a-prototype&actor=200&variant=D", hash: "#share=v1.abc_-123" },
    { search: "?guide=b-option&x=%2B+%26&x=second", hash: "#share=v1.ABC_def-123%2B" },
  ];
  for (const entry of LEGACY_ENTRY_PAGES) {
    for (const { search, hash } of suffixes) {
      for (const explicitIndex of [false, true]) {
        const pathname = `/bunfirvil/${entry ? `${entry}/` : ""}${explicitIndex ? "index.html" : ""}`;
        const expected = legacyRedirectTarget(pathname, search, hash);
        const html = renderLegacyRedirectHtml(entry);
        const script = html.match(/<script>\s*([\s\S]*?)\s*<\/script>/u)?.[1];
        assert.ok(script);
        const calls = [];
        const storage = new Proxy({}, { get() { throw new Error("저장소 접근 금지"); } });
        const location = { pathname, search, hash, replace: (target) => calls.push(target) };
        vm.runInNewContext(script, { window: { location, localStorage: storage, sessionStorage: storage }, localStorage: storage, sessionStorage: storage });
        assert.deepEqual(calls, [expected]);
        assert.equal(new URL(expected, "https://is2js.github.io").origin, "https://is2js.github.io");
        assert.ok(html.includes('<noscript>'));
        assert.ok(html.includes('rel="canonical"'));
        assert.ok(html.includes("https://is2js.github.io/naksaeng/bunfirvil/og-playground-v3.jpg"));
        assert.doesNotMatch(script, /localStorage|sessionStorage|fetch|document|history\.pushState/u);
      }
    }
  }
  assert.equal(legacyRedirectTarget("/bunfirvil/", "https://example.com"), null);
  assert.equal(legacyRedirectTarget("/bunfirvil/", "", "javascript:bad"), null);
});
