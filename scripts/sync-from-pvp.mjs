#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const EXPORTER_VERSION = "bunfirvil-static-export-v2";
const EXPORTER_FILE = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_ROOT = path.join(PROJECT_ROOT, "public");
const GENERATED_ROOT = path.join(PUBLIC_ROOT, "generated");
const PUBLICATION_ALLOWLIST_FILE = path.join(PROJECT_ROOT, "config", "public-assets.allowlist.json");

const MAP_IDS = Object.freeze([
  "bundang-first-village-51a-prototype",
  "bundang-first-village-55a-prototype",
  "bundang-first-village-55b-prototype",
  "bundang-first-village-59a-prototype",
]);
const UNIT_TYPES = Object.freeze({
  "bundang-first-village-51a-prototype": "51A",
  "bundang-first-village-55a-prototype": "55A",
  "bundang-first-village-55b-prototype": "55B",
  "bundang-first-village-59a-prototype": "59A",
});
const CHARACTER_IDS = Object.freeze(["100", "200"]);
const CHARACTER_ACTIONS = Object.freeze({
  idle: Object.freeze(["normal"]),
  walk: Object.freeze(["normal"]),
  attack: Object.freeze(["fist1", "bow", "sword", "throw"]),
  cast: Object.freeze(["normal"]),
});
const DIRECTIONS = Object.freeze(["n", "ne", "e", "se", "s", "sw", "w", "nw"]);

const SKILLS = Object.freeze([
  Object.freeze({
    id: "basic-attack",
    name: "기본 공격",
    description: "선택한 캐릭터의 기본 근접 공격 모션을 재생합니다.",
    cooldownMs: 650,
    motion: Object.freeze({ motion: "attack", action: "fist1" }),
    effects: Object.freeze([]),
  }),
  Object.freeze({
    id: "warrior-shock-stun",
    name: "쇼크스턴",
    description: "근접 공격과 머리 위 별 회전 상태 효과를 재생합니다.",
    icon: Object.freeze({
      source: "assets/rpg/skills/icons/history/lk-magic-020/20260730011220546615-b4d02ceb87f6.png",
      output: "icons/shock-stun.png",
    }),
    cooldownMs: 2800,
    motion: Object.freeze({ motion: "attack", action: "sword" }),
    effects: Object.freeze([
      Object.freeze({ effectId: "rpg-shock-stun-status", phase: "impact" }),
    ]),
  }),
  Object.freeze({
    id: "common-double-arrow",
    name: "더블애로우",
    description: "활 모션과 8방향 에너지궁·투사체 효과를 재생합니다.",
    icon: Object.freeze({
      source: "assets/rpg/skills/icons/history/y1000-magic-97/20260730152752853044-724a3363a172.png",
      output: "icons/double-arrow.png",
    }),
    cooldownMs: 1600,
    motion: Object.freeze({ motion: "attack", action: "bow" }),
    effects: Object.freeze([
      Object.freeze({ effectId: "rpg-summoned-bow-energy-overlay", phase: "primary" }),
      Object.freeze({ effectId: "rpg-summoned-bow-energy-projectile", phase: "projectile" }),
    ]),
  }),
  Object.freeze({
    id: "common-teleport",
    name: "텔레포트",
    description: "로컬 맵의 이동 가능한 셀로 순간이동하고 효과를 재생합니다.",
    icon: Object.freeze({
      source: "assets/rpg/skills/icons/regenerated/lk/053.png",
      output: "icons/teleport.png",
    }),
    cooldownMs: 4200,
    motion: Object.freeze({ motion: "cast", action: "normal" }),
    effects: Object.freeze([
      Object.freeze({ effectId: "rpg-teleport-origin", phase: "impact" }),
    ]),
  }),
]);

const EFFECTS = Object.freeze([
  Object.freeze({
    effectId: "rpg-shock-stun-status",
    sourceDir: "assets/rpg/skills/effects/rpg/shock-stun",
    manifest: "manifest.json",
    skillIds: Object.freeze(["warrior-shock-stun"]),
    files: Object.freeze([
      Object.freeze({
        source: "assets/rpg/effects/status/shock-stun/shock-stun-star-orbit.png",
        output: "shock-stun-star-orbit.png",
      }),
    ]),
    urlMap: Object.freeze({
      "/assets/rpg/effects/status/shock-stun/shock-stun-star-orbit.png": "shock-stun-star-orbit.png",
    }),
  }),
  Object.freeze({
    effectId: "rpg-summoned-bow-energy-projectile",
    sourceDir: "assets/rpg/skills/effects/rpg/summoned-bow-energy-projectile",
    manifest: "manifest.json",
    skillIds: Object.freeze(["common-double-arrow"]),
    files: Object.freeze(DIRECTIONS.map((direction) => Object.freeze({
      source: `assets/rpg/skills/effects/rpg/summoned-bow-energy-projectile/variants/${direction}.png`,
      output: `variants/${direction}.png`,
    }))),
    urlMap: Object.freeze(Object.fromEntries(DIRECTIONS.map((direction) => [
      `/assets/rpg/skills/effects/rpg/summoned-bow-energy-projectile/variants/${direction}.png`,
      `variants/${direction}.png`,
    ]))),
  }),
  Object.freeze({
    effectId: "rpg-summoned-bow-energy-overlay",
    sourceDir: "assets/rpg/skills/effects/rpg/summoned-bow-energy-overlay",
    manifest: "manifest.json",
    skillIds: Object.freeze(["common-double-arrow"]),
    files: Object.freeze(DIRECTIONS.flatMap((direction) => ["front", "back"].map((layer) => Object.freeze({
      source: `assets/rpg/skills/effects/rpg/summoned-bow-energy-overlay/variants/${direction}-${layer}.png`,
      output: `variants/${direction}-${layer}.png`,
    })))),
    urlMap: Object.freeze(Object.fromEntries(DIRECTIONS.flatMap((direction) => ["front", "back"].map((layer) => [
      `/assets/rpg/skills/effects/rpg/summoned-bow-energy-overlay/variants/${direction}-${layer}.png`,
      `variants/${direction}-${layer}.png`,
    ])))),
  }),
  Object.freeze({
    effectId: "rpg-teleport-origin",
    sourceDir: "assets/rpg/skills/effects/rpg/teleport-origin",
    manifest: "manifest.json",
    skillIds: Object.freeze(["common-teleport"]),
    files: Object.freeze([
      ...Array.from({ length: 8 }, (_, index) => Object.freeze({
        source: `assets/rpg/skills/effects/rpg/teleport-origin/frames/${String(index).padStart(4, "0")}.png`,
        output: `frames/${String(index).padStart(4, "0")}.png`,
      })),
      Object.freeze({
        source: "assets/rpg/skills/effects/rpg/teleport-origin/variants/00.png",
        output: "variants/00.png",
      }),
    ]),
    urlMap: Object.freeze(Object.fromEntries([
      ...Array.from({ length: 8 }, (_, index) => {
        const frame = String(index).padStart(4, "0");
        return [
          `/assets/rpg/skills/effects/rpg/teleport-origin/frames/${frame}.png`,
          `frames/${frame}.png`,
        ];
      }),
      [
        "/assets/rpg/skills/effects/rpg/teleport-origin/variants/00.png",
        "variants/00.png",
      ],
    ])),
  }),
]);

const MATERIAL_FILES = Object.freeze([
  "bundang-55b-greige-oak-v1.webp",
  "bundang-55b-warm-gray-wall-v1.webp",
  "bundang-55b-gray-grout-tile-v1.webp",
]);
const MATERIAL_IDS = new Set(MATERIAL_FILES.map((name) => name.replace(/\.webp$/, "")));
const INTERIOR_CATALOG_SOURCE = "assets/rpg/objects/bundang-interior-v1/catalog.json";
const INTERIOR_RECIPE_SOURCE = "src/rpg/world/three-pbr-renderer.mjs";
const INTERIOR_MODEL_ROWS = Object.freeze([
  Object.freeze({ assetId: "sofa-three-seat", source: "assets/rpg/objects/bundang-interior-v1/models/sofa-three-seat/a3b5553daff41d1ea18a712d01072fb06ef1dec9ca132439fa3246d35811974f/medium.glb" }),
  Object.freeze({ assetId: "dining-chair", source: "assets/rpg/objects/bundang-interior-v1/models/dining-chair/57a481718c2573c824672398c5ee519a696fa30080b0fbeca4afde38e7ed2c08/medium.glb" }),
  Object.freeze({ assetId: "office-chair", source: "assets/rpg/objects/bundang-interior-v1/models/office-chair/7b67a38957f2f69cafe61e1258e4af933c8f8bb18bfe51864c5492c3cc1e349c/medium.glb" }),
  Object.freeze({ assetId: "toilet-floor-mounted", source: "assets/rpg/objects/bundang-interior-v1/models/toilet-floor-mounted/c94a4d9cbf991c353ef725367a5407765cf968ab65651b5c423870637ad560cb/medium.glb" }),
  Object.freeze({ assetId: "vanity-basin-compact", source: "assets/rpg/objects/bundang-interior-v1/models/vanity-basin-compact/1f229cad6af98b1ea44761948b25651b3f74029d476070da44835333a17b8588/medium.glb" }),
]);

function parseArgs(argv) {
  const args = { source: process.env.BUNFIRVIL_PVP_ROOT || "" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--source") args.source = argv[++index] || "";
    else if (token === "--stage-only") args.stageOnly = true;
    else if (token === "--transaction-file") args.transactionFile = argv[++index] || "";
    else if (token === "--help" || token === "-h") args.help = true;
    else throw new Error(`알 수 없는 인자: ${token}`);
  }
  return args;
}

function printHelp() {
  process.stdout.write([
    "Usage: node scripts/sync-from-pvp.mjs --source <pvp-repository>",
    "",
    "Only the four Bundang prototypes, runtime character sheets, selected skill",
    "effects, and rights-safe B-option metadata are exported.",
    "",
  ].join("\n"));
}

function slash(value) {
  return String(value).replaceAll("\\", "/");
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function git(sourceRoot, args) {
  return execFileSync("git", ["-C", sourceRoot, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  }).trim();
}

function assertSafeRelative(relativePath) {
  const normalized = slash(relativePath);
  if (!normalized || normalized.startsWith("/") || normalized.includes("../") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`안전하지 않은 상대경로: ${relativePath}`);
  }
  return normalized;
}

function sourcePath(sourceRoot, relativePath) {
  const safe = assertSafeRelative(relativePath);
  const resolved = path.resolve(sourceRoot, ...safe.split("/"));
  const relation = path.relative(sourceRoot, resolved);
  if (!relation || relation.startsWith("..") || path.isAbsolute(relation)) {
    throw new Error(`원본 저장소 밖의 경로: ${relativePath}`);
  }
  return resolved;
}

function outputPath(exportRoot, relativePath) {
  const safe = assertSafeRelative(relativePath);
  const resolved = path.resolve(exportRoot, ...safe.split("/"));
  const relation = path.relative(exportRoot, resolved);
  if (!relation || relation.startsWith("..") || path.isAbsolute(relation)) {
    throw new Error(`export 폴더 밖의 경로: ${relativePath}`);
  }
  return resolved;
}

function directChildPath(parentDirectory, candidatePath, label = "대상") {
  const parent = path.resolve(parentDirectory);
  const candidate = path.resolve(candidatePath);
  if (candidate === parent || path.dirname(candidate) !== parent) {
    throw new Error(`${label}이 허용된 부모 폴더를 벗어났습니다: ${candidate}`);
  }
  return candidate;
}

async function pathExists(candidatePath) {
  try {
    await stat(candidatePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function renameWithRetry(source, destination) {
  const retryable = new Set(["EBUSY", "ENOTEMPTY", "EPERM"]);
  let lastError = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await rename(source, destination);
      return;
    } catch (error) {
      lastError = error;
      if (!retryable.has(error?.code)) throw error;
      if (attempt === 19) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (process.platform !== "win32") throw lastError;
  const quotePowerShellLiteral = (value) => {
    const text = String(value);
    if (/[\r\n]/.test(text)) throw new Error("PowerShell 이동 경로에 줄바꿈을 사용할 수 없습니다.");
    return `'${text.replaceAll("'", "''")}'`;
  };
  const command = [
    "$ErrorActionPreference = 'Stop'",
    `Move-Item -LiteralPath ${quotePowerShellLiteral(source)} -Destination ${quotePowerShellLiteral(destination)}`,
  ].join("; ");
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

async function removeDirectChildDirectory(parentDirectory, candidatePath, label = "폴더") {
  const target = directChildPath(parentDirectory, candidatePath, label);
  if (!(await pathExists(target))) return;
  const info = await stat(target);
  if (!info.isDirectory()) throw new Error(`${label}이 폴더가 아닙니다: ${target}`);
  await rm(target, { recursive: true, force: true });
}

async function renameDirectChildDirectory(parentDirectory, fromPath, toPath, label = "폴더 이동") {
  const source = directChildPath(parentDirectory, fromPath, `${label} 원본`);
  const destination = directChildPath(parentDirectory, toPath, `${label} 대상`);
  const info = await stat(source);
  if (!info.isDirectory()) throw new Error(`${label} 원본이 폴더가 아닙니다: ${source}`);
  await renameWithRetry(source, destination);
}

async function stageExportSwap(exportsRoot, stagingRoot, finalRoot, token) {
  const staging = directChildPath(exportsRoot, stagingRoot, "staging export");
  const final = directChildPath(exportsRoot, finalRoot, "final export");
  const backup = directChildPath(exportsRoot, path.join(exportsRoot, `.${path.basename(final)}.previous-${token}`), "backup export");
  await removeDirectChildDirectory(exportsRoot, backup, "stale backup export");
  const hadPrevious = await pathExists(final);
  if (hadPrevious) await renameDirectChildDirectory(exportsRoot, final, backup, "기존 export 백업");
  try {
    await renameDirectChildDirectory(exportsRoot, staging, final, "검증된 export 설치");
  } catch (error) {
    if (hadPrevious && await pathExists(backup) && !(await pathExists(final))) {
      await renameDirectChildDirectory(exportsRoot, backup, final, "기존 export 복구");
    }
    throw error;
  }
  return { backup, final, hadPrevious };
}

async function rollbackExportSwap(exportsRoot, swap) {
  if (!swap) return;
  await removeDirectChildDirectory(exportsRoot, swap.final, "실패한 새 export");
  if (swap.hadPrevious && await pathExists(swap.backup)) {
    await renameDirectChildDirectory(exportsRoot, swap.backup, swap.final, "기존 export 롤백");
  }
}

async function finalizeExportSwap(exportsRoot, swap) {
  if (swap?.hadPrevious) await removeDirectChildDirectory(exportsRoot, swap.backup, "이전 export 백업");
}

async function replacePointerFiles(generatedRoot, documents, token) {
  const root = path.resolve(generatedRoot);
  const states = [];
  for (const document of documents) {
    const final = directChildPath(root, path.join(root, document.name), `${document.name} final`);
    const staged = directChildPath(root, path.join(root, `.${document.name}.staging-${token}`), `${document.name} staging`);
    const backup = directChildPath(root, path.join(root, `.${document.name}.previous-${token}`), `${document.name} backup`);
    await rm(staged, { force: true });
    await rm(backup, { force: true });
    await writeFile(staged, document.text, "utf8");
    states.push({ final, staged, backup, hadPrevious: await pathExists(final), installed: false });
  }
  try {
    for (const state of states) {
      if (state.hadPrevious) await renameWithRetry(state.final, state.backup);
    }
    for (const state of states) {
      await renameWithRetry(state.staged, state.final);
      state.installed = true;
    }
  } catch (error) {
    for (const state of [...states].reverse()) {
      if (state.installed && await pathExists(state.final)) await rm(state.final, { force: true });
      if (state.hadPrevious && await pathExists(state.backup)) await renameWithRetry(state.backup, state.final);
      if (await pathExists(state.staged)) await rm(state.staged, { force: true });
    }
    throw error;
  }
  for (const state of states) {
    if (await pathExists(state.backup)) await rm(state.backup, { force: true });
  }
}

async function pruneOtherExports(exportsRoot, currentExportId) {
  const root = path.resolve(exportsRoot);
  const removed = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === currentExportId) continue;
    const target = directChildPath(root, path.join(root, entry.name), `stale export ${entry.name}`);
    await removeDirectChildDirectory(root, target, `stale export ${entry.name}`);
    removed.push(entry.name);
  }
  return removed.sort((left, right) => left.localeCompare(right, "en"));
}

async function orchestrateSync(args) {
  await mkdir(GENERATED_ROOT, { recursive: true });
  const orchestratorToken = `${process.pid}-${Date.now()}`;
  const transactionFile = directChildPath(
    GENERATED_ROOT,
    path.join(GENERATED_ROOT, `.sync-transaction-${orchestratorToken}.json`),
    "sync transaction",
  );
  await rm(transactionFile, { force: true });
  try {
    execFileSync(process.execPath, [
      EXPORTER_FILE,
      "--source",
      path.resolve(args.source),
      "--stage-only",
      "--transaction-file",
      transactionFile,
    ], {
      stdio: "inherit",
      windowsHide: true,
    });
    const transaction = JSON.parse(await readFile(transactionFile, "utf8"));
    if (transaction.schemaVersion !== 1 || !/^[0-9a-z-]+$/i.test(String(transaction.exportId || ""))) {
      throw new Error("staging worker가 유효한 transaction을 만들지 못했습니다.");
    }
    if (!String(transaction.stagingDirectory || "").startsWith(`.${transaction.exportId}.staging-`)) {
      throw new Error("staging worker의 staging 폴더 이름이 올바르지 않습니다.");
    }
    const exportsRoot = path.resolve(GENERATED_ROOT, "exports");
    const stagingRoot = directChildPath(exportsRoot, path.join(exportsRoot, transaction.stagingDirectory), "worker staging export");
    const finalRoot = directChildPath(exportsRoot, path.join(exportsRoot, transaction.exportId), "worker final export");
    if (!(await pathExists(stagingRoot))) throw new Error("staging worker의 검증된 export 폴더가 없습니다.");

    let swap = null;
    let pointersCommitted = false;
    try {
      swap = await stageExportSwap(exportsRoot, stagingRoot, finalRoot, transaction.transactionToken || orchestratorToken);
      await replacePointerFiles(GENERATED_ROOT, [
        { name: "catalog.v1.json", text: transaction.stableCatalogText },
        { name: "current.json", text: transaction.currentText },
      ], transaction.transactionToken || orchestratorToken);
      pointersCommitted = true;
      await finalizeExportSwap(exportsRoot, swap);
      await writeFile(path.join(PUBLIC_ROOT, ".nojekyll"), "", "utf8");
      const prunedExports = await pruneOtherExports(exportsRoot, transaction.exportId);
      const remainingExports = (await readdir(exportsRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      if (remainingExports.length !== 1 || remainingExports[0] !== transaction.exportId) {
        throw new Error(`export 정리 후 현재 export 하나만 남지 않았습니다: ${remainingExports.join(", ")}`);
      }
      process.stdout.write(`${JSON.stringify({
        ...transaction.summary,
        prunedExports,
        remainingExports,
      }, null, 2)}\n`);
    } catch (error) {
      if (!pointersCommitted && swap) await rollbackExportSwap(exportsRoot, swap);
      if (await pathExists(stagingRoot)) {
        await removeDirectChildDirectory(exportsRoot, stagingRoot, "실패한 worker staging export");
      }
      throw error;
    }
  } finally {
    await rm(transactionFile, { force: true });
  }
}

async function ensureFile(filePath, label) {
  await access(filePath);
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error(`${label} 파일이 아닙니다: ${filePath}`);
}

function mapSourceFiles(mapId) {
  const root = `assets/rpg/worlds/${mapId}`;
  const files = [
    `${root}/manifest.json`,
    `${root}/content.json`,
    `${root}/minimap.png`,
  ];
  for (let chunkX = 0; chunkX < 4; chunkX += 1) {
    for (let chunkY = 0; chunkY < 4; chunkY += 1) {
      files.push(`${root}/chunks/${chunkX}-${chunkY}.json`);
    }
  }
  for (let regionX = 0; regionX < 2; regionX += 1) {
    for (let regionY = 0; regionY < 2; regionY += 1) {
      files.push(`${root}/minimap/${regionX}-${regionY}.png`);
    }
  }
  return files;
}

function characterSourceFiles(characterId) {
  const root = `assets/characters/${characterId}`;
  const files = [`${root}/animation.json`];
  for (const [motion, actions] of Object.entries(CHARACTER_ACTIONS)) {
    for (const action of actions) files.push(`${root}/sheets/${motion}/${action}.png`);
  }
  return files;
}

function effectSourceFiles(effect) {
  return [
    `${effect.sourceDir}/${effect.manifest}`,
    ...effect.files.map((file) => file.source),
  ];
}

function buildSourceAllowlist() {
  const paths = new Set();
  MAP_IDS.flatMap(mapSourceFiles).forEach((entry) => paths.add(entry));
  CHARACTER_IDS.flatMap(characterSourceFiles).forEach((entry) => paths.add(entry));
  EFFECTS.flatMap(effectSourceFiles).forEach((entry) => paths.add(entry));
  SKILLS.flatMap((skill) => skill.icon?.source ? [skill.icon.source] : []).forEach((entry) => paths.add(entry));
  paths.add("assets/rpg/worlds/bundang-first-village-55b-prototype/materials/materials.json");
  MATERIAL_FILES.forEach((name) => paths.add(`assets/rpg/worlds/bundang-first-village-55b-prototype/materials/${name}`));
  paths.add(INTERIOR_CATALOG_SOURCE);
  paths.add(INTERIOR_RECIPE_SOURCE);
  INTERIOR_MODEL_ROWS.forEach((row) => paths.add(row.source));
  paths.add("src/rpg/bundang-apartment-options.mjs");
  return [...paths].sort();
}

function expandApprovalTemplate(template, variables, label) {
  const names = [...String(template).matchAll(/\{([A-Za-z][A-Za-z0-9_-]*)\}/g)].map((match) => match[1]);
  const uniqueNames = [...new Set(names)];
  if (!uniqueNames.length) throw new Error(`${label}: template에 변수가 없습니다.`);
  for (const name of uniqueNames) {
    if (!Array.isArray(variables?.[name]) || variables[name].length === 0) {
      throw new Error(`${label}: 변수 ${name}의 승인 값이 없습니다.`);
    }
  }
  const unused = Object.keys(variables || {}).filter((name) => !uniqueNames.includes(name));
  if (unused.length) throw new Error(`${label}: 사용되지 않은 template 변수: ${unused.join(", ")}`);

  let expanded = [String(template)];
  for (const name of uniqueNames) {
    const next = [];
    for (const candidate of expanded) {
      for (const rawValue of variables[name]) {
        const value = String(rawValue);
        if (!value || /[\\/{}]/.test(value)) throw new Error(`${label}: 안전하지 않은 ${name} 값: ${value}`);
        next.push(candidate.replaceAll(`{${name}}`, value));
      }
    }
    expanded = next;
  }
  if (expanded.some((candidate) => /\{[^}]+\}/.test(candidate))) {
    throw new Error(`${label}: 해석되지 않은 template 변수가 있습니다.`);
  }
  return expanded;
}

function expandApprovalPolicy(document) {
  if (document?.schemaVersion !== 1 || document?.policyType !== "maintainer-reviewed-publication-allowlist") {
    throw new Error("공개 자산 승인 정책 schema가 올바르지 않습니다.");
  }
  if (document.defaultDecision !== "deny" || document.legalRightsProof !== false) {
    throw new Error("공개 자산 승인 정책은 default deny이며 법적 권리 증명이 아니어야 합니다.");
  }
  const denied = new Set((document.deniedCategories || []).map((entry) => String(entry)));
  for (const required of ["external", "unresolved", "rights-unknown"]) {
    if (!denied.has(required)) throw new Error(`공개 자산 승인 정책에 필수 거부 범주가 없습니다: ${required}`);
  }
  if (!Array.isArray(document.approvedCategories) || document.approvedCategories.length === 0) {
    throw new Error("공개 자산 승인 정책에 승인 범주가 없습니다.");
  }

  const approvals = new Map();
  for (const category of document.approvedCategories) {
    const categoryId = String(category?.id || "");
    const rightsClass = String(category?.rightsClass || "");
    if (!categoryId || category.decision !== "approve" || !rightsClass.startsWith("maintainer-reviewed-")) {
      throw new Error(`유효하지 않은 공개 승인 범주: ${categoryId || "(id 없음)"}`);
    }
    if (denied.has(categoryId)) throw new Error(`승인/거부 범주가 중복됩니다: ${categoryId}`);
    if (!Array.isArray(category.sourceRules) || category.sourceRules.length === 0) {
      throw new Error(`${categoryId}: sourceRules가 없습니다.`);
    }
    for (const [ruleIndex, rule] of category.sourceRules.entries()) {
      const label = `${categoryId}.sourceRules[${ruleIndex}]`;
      if (!Array.isArray(rule.bases) || rule.bases.length === 0) throw new Error(`${label}: bases가 없습니다.`);
      const relativeFiles = [];
      if (rule.files !== undefined) {
        if (!Array.isArray(rule.files) || rule.files.length === 0) throw new Error(`${label}: files가 비어 있습니다.`);
        relativeFiles.push(...rule.files.map((entry) => String(entry)));
      }
      if (rule.template !== undefined) {
        relativeFiles.push(...expandApprovalTemplate(rule.template, rule.variables, label));
      }
      if (!relativeFiles.length) throw new Error(`${label}: files 또는 template가 필요합니다.`);

      for (const rawBase of rule.bases) {
        const base = assertSafeRelative(String(rawBase));
        for (const rawFile of relativeFiles) {
          const relativeFile = assertSafeRelative(String(rawFile));
          const sourceRelative = assertSafeRelative(path.posix.join(base, relativeFile));
          if (approvals.has(sourceRelative)) {
            throw new Error(`공개 승인 경로가 중복됩니다: ${sourceRelative}`);
          }
          approvals.set(sourceRelative, { categoryId, rightsClass });
        }
      }
    }
  }
  return approvals;
}

async function loadPublicationApprovalPolicy(sourceAllowlist) {
  await ensureFile(PUBLICATION_ALLOWLIST_FILE, "공개 자산 승인 정책");
  const raw = await readFile(PUBLICATION_ALLOWLIST_FILE);
  let document;
  try {
    document = JSON.parse(raw.toString("utf8"));
  } catch (error) {
    throw new Error(`공개 자산 승인 정책 JSON을 읽을 수 없습니다: ${error.message}`);
  }
  const approvals = expandApprovalPolicy(document);
  const hardcoded = new Set(sourceAllowlist);
  const missing = sourceAllowlist.filter((sourceRelative) => !approvals.has(sourceRelative));
  const unexpected = [...approvals.keys()].filter((sourceRelative) => !hardcoded.has(sourceRelative)).sort();
  if (missing.length || unexpected.length) {
    const detail = [
      ...missing.map((entry) => `승인 누락: ${entry}`),
      ...unexpected.map((entry) => `하드코딩 추출 목록 밖 승인: ${entry}`),
    ];
    throw new Error(`공개 자산 승인 정책과 추출 allowlist가 일치하지 않습니다:\n${detail.join("\n")}`);
  }
  return { document, approvals, sha256: sha256(raw) };
}

async function fingerprintSources(sourceRoot, relativePaths, sourceHead, dirty, exporterSha256, approvalPolicySha256) {
  const digest = createHash("sha256");
  digest.update(`${EXPORTER_VERSION}\0${exporterSha256}\0${approvalPolicySha256}\0${sourceHead}\0${dirty ? "dirty" : "clean"}\0`);
  for (const relativePath of relativePaths) {
    const absolute = sourcePath(sourceRoot, relativePath);
    await ensureFile(absolute, relativePath);
    const data = await readFile(absolute);
    digest.update(relativePath);
    digest.update("\0");
    digest.update(sha256(data));
    digest.update("\0");
  }
  return digest.digest("hex");
}

function stripPrivateFields(value) {
  if (Array.isArray(value)) {
    return value.map(stripPrivateFields).filter((entry) => entry !== undefined);
  }
  if (!value || typeof value !== "object") {
    if (typeof value === "string" && (/^[A-Za-z]:[\\/]/.test(value) || value.includes("WebstormProjects"))) {
      return undefined;
    }
    return value;
  }
  const denied = new Set([
    "accessPolicy",
    "attribution",
    "createPolicy",
    "operatorOnly",
    "privateMap",
    "createRoomAllowed",
    "source",
    "sourceAudit",
    "sourceExportRoot",
    "sourceFile",
    "sourceRef",
    "sourceSha256",
    "audit",
    "auditTrail",
  ]);
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (denied.has(key) || /audit/i.test(key)) continue;
    const sanitized = stripPrivateFields(entry);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

function sanitizeWorldManifest(raw, mapId) {
  const manifest = stripPrivateFields(structuredClone(raw));
  manifest.chunkUrlTemplate = "chunks/{chunkX}-{chunkY}.json";
  manifest.minimapUrl = "minimap.png";
  manifest.contentFile = "content.json";
  manifest.contentManifestUrl = "content.json";
  manifest.minimap = {
    ...(manifest.minimap || {}),
    urlTemplate: "minimap/{regionX}-{regionY}.png",
    overviewUrl: "minimap.png",
  };
  manifest.rendering = {
    ...(manifest.rendering || {}),
    engine: "three-pbr",
    materialManifestUrl: mapId === "bundang-first-village-55b-prototype"
      ? "materials/materials.json"
      : "../bundang-first-village-55b-prototype/materials/materials.json",
    modelPolicy: "procedural-only",
    fallback: "canvas2d",
  };
  delete manifest.rendering.moduleUrl;
  delete manifest.rendering.modelManifestUrl;
  if (manifest.inspectionPolicy) delete manifest.inspectionPolicy.operatorOnly;
  assertNoForbiddenStrings(manifest, `maps/${mapId}/manifest.json`);
  return manifest;
}

function sanitizeCharacterDescriptor(raw, characterId) {
  const motions = {};
  for (const [motion, allowedActions] of Object.entries(CHARACTER_ACTIONS)) {
    const sourceMotion = raw?.motions?.[motion];
    if (!sourceMotion || typeof sourceMotion !== "object") throw new Error(`${characterId}: ${motion} motion 누락`);
    const actions = {};
    for (const action of allowedActions) {
      const sourceAction = sourceMotion?.actions?.[action];
      if (!sourceAction) throw new Error(`${characterId}: ${motion}/${action} action 누락`);
      const expectedSheet = `sheets/${motion}/${action}.png`;
      if (slash(sourceAction.sheet) !== expectedSheet) {
        throw new Error(`${characterId}: 예상하지 않은 sheet 경로 ${sourceAction.sheet}`);
      }
      const directions = {};
      for (const direction of DIRECTIONS) {
        const sourceDirection = sourceAction?.directions?.[direction];
        if (!sourceDirection) throw new Error(`${characterId}: ${motion}/${action}/${direction} 누락`);
        directions[direction] = Number.isFinite(Number(sourceDirection.durationMs))
          ? { durationMs: Number(sourceDirection.durationMs) }
          : {};
      }
      actions[action] = {
        frameCount: Number(sourceAction.frameCount),
        sheet: expectedSheet,
        sheetFrameWidth: Number(sourceAction.sheetFrameWidth),
        sheetFrameHeight: Number(sourceAction.sheetFrameHeight),
        sheetRows: Number(sourceAction.sheetRows),
        sheetColumns: Number(sourceAction.sheetColumns),
        directions,
      };
    }
    motions[motion] = {
      loop: sourceMotion.loop === true,
      durationMs: Number(sourceMotion.durationMs),
      actions,
    };
  }
  const descriptor = {
    schemaVersion: 1,
    assetKey: String(raw.assetKey || characterId),
    name: String(raw.name || `캐릭터 ${characterId}`),
    cellSize: Number(raw.cellSize || 256),
    footY: Number(raw.footY || 0),
    displaySize: Number(raw.displaySize || 96),
    directions: DIRECTIONS,
    defaultActions: Object.fromEntries(Object.keys(CHARACTER_ACTIONS).map((motion) => [
      motion,
      CHARACTER_ACTIONS[motion].includes(raw?.defaultActions?.[motion])
        ? raw.defaultActions[motion]
        : CHARACTER_ACTIONS[motion][0],
    ])),
    actionAliases: stripPrivateFields(raw.actionAliases || {}),
    motions,
    revision: String(raw.revision || ""),
  };
  assertNoForbiddenStrings(descriptor, `characters/${characterId}/animation.json`);
  return descriptor;
}

function sanitizeEffectManifest(raw, effect) {
  const rewrite = (value) => {
    if (Array.isArray(value)) return value.map(rewrite).filter((entry) => entry !== undefined);
    if (value && typeof value === "object") {
      const result = {};
      for (const [key, entry] of Object.entries(value)) {
        if (["sourceRef", "sourceSha256", "sourceFile"].includes(key) || /audit/i.test(key)) continue;
        const rewritten = rewrite(entry);
        if (rewritten !== undefined) result[key] = rewritten;
      }
      return result;
    }
    if (typeof value !== "string") return value;
    if (/^[A-Za-z]:[\\/]/.test(value) || value.includes("WebstormProjects")) return undefined;
    const pathOnly = value.split("?")[0];
    if (pathOnly.startsWith("/api/") || pathOnly.startsWith("/assets/") || pathOnly.startsWith("/src/")) {
      const mapped = effect.urlMap[pathOnly];
      if (!mapped) throw new Error(`${effect.effectId}: 허용되지 않은 URL 참조 ${value}`);
      return mapped;
    }
    return value;
  };
  const manifest = rewrite(raw);
  if (Array.isArray(manifest.suggestedBindings)) {
    manifest.suggestedBindings = manifest.suggestedBindings.filter((binding) => effect.skillIds.includes(binding.skillId));
  }
  manifest.schemaVersion = "bunfirvil-skill-effect-v1";
  assertNoForbiddenStrings(manifest, `skills/effects/${effect.effectId}/manifest.json`);
  return manifest;
}

function sanitizeMaterialManifest(raw) {
  const materials = (Array.isArray(raw.materials) ? raw.materials : [])
    .filter((material) => MATERIAL_IDS.has(String(material?.id || "")))
    .map((material) => ({
      id: String(material.id),
      tileIds: Array.isArray(material.tileIds) ? material.tileIds.map(String) : [],
      repeat: Number(material.repeat || 1),
      maps: { diffuse: { webp: `${material.id}.webp` } },
      networkCompression: "webp",
      gpuCompression: "none",
      colorSpace: String(material.colorSpace || "sRGB"),
      roughness: Number(material.roughness ?? 0.9),
    }));
  if (materials.length !== MATERIAL_FILES.length) {
    throw new Error(`Bundang WebP material ${MATERIAL_FILES.length}개를 찾지 못했습니다.`);
  }
  return {
    schemaVersion: "bunfirvil-pbr-materials-v1",
    materials,
    fallback: "manifest-palette",
  };
}

function assertNoForbiddenStrings(value, label) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const forbidden = [
    { pattern: /\/api\//i, name: "/api/" },
    { pattern: /\/assets\//i, name: "/assets/" },
    { pattern: /\/src\//i, name: "/src/" },
    { pattern: /[A-Za-z]:[\\/]/, name: "로컬 절대경로" },
    { pattern: /WebstormProjects/i, name: "로컬 프로젝트 경로" },
    { pattern: /\.ktx2(?:[?"'\s]|$)/i, name: "KTX2" },
    { pattern: /sourceAudit/i, name: "sourceAudit" },
  ];
  for (const check of forbidden) {
    if (check.pattern.test(text)) throw new Error(`${label}: 금지된 ${check.name} 참조`);
  }
}

function sanitizeOptionRow(row) {
  const allowed = [
    "assetId",
    "label",
    "paletteLabel",
    "groupId",
    "prices",
    "priceVariants",
    "visualMode",
    "exclusiveGroup",
    "requires",
    "requiresAny",
    "requiresAll",
    "availableUnitTypes",
    "systemAcTier",
    "systemAcCount",
    "systemAcPaletteCard",
    "priceStatus",
  ];
  const option = Object.fromEntries(allowed
    .filter((key) => row[key] !== undefined)
    .map((key) => [key, stripPrivateFields(row[key])]));
  return option;
}

function sanitizeProceduralAsset(row) {
  const allowed = [
    "assetId",
    "revision",
    "displayNameKo",
    "descriptionKo",
    "roomCategoryIds",
    "allowedRoomKinds",
    "rendererKind",
    "collisionDefault",
    "placeable",
    "option",
    "badges",
    "defaultDimensionsMeters",
    "defaultMaterialVariantId",
  ];
  return Object.fromEntries(allowed
    .filter((key) => row[key] !== undefined)
    .map((key) => [key, stripPrivateFields(row[key])]));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.source) throw new Error("--source <pvp-repository> 또는 BUNFIRVIL_PVP_ROOT가 필요합니다.");
  if (!args.stageOnly) {
    await orchestrateSync(args);
    return;
  }
  if (!args.transactionFile) throw new Error("내부 staging worker에 --transaction-file이 필요합니다.");

  const sourceRoot = path.resolve(args.source);
  await ensureFile(path.join(sourceRoot, "package.json"), "PVP package.json");
  const sourceHead = git(sourceRoot, ["rev-parse", "HEAD"]);
  if (!/^[0-9a-f]{40}$/i.test(sourceHead)) throw new Error("유효한 PVP HEAD를 읽지 못했습니다.");
  const dirty = git(sourceRoot, ["status", "--porcelain=v1", "--untracked-files=normal"]).length > 0;

  const allowlist = buildSourceAllowlist();
  const publicationApproval = await loadPublicationApprovalPolicy(allowlist);
  const exporterSha256 = sha256(await readFile(EXPORTER_FILE));
  const selectedSourceFingerprint = await fingerprintSources(
    sourceRoot,
    allowlist,
    sourceHead,
    dirty,
    exporterSha256,
    publicationApproval.sha256,
  );
  const exportId = `${sourceHead.slice(0, 12)}-${dirty ? "dirty-" : ""}${selectedSourceFingerprint.slice(0, 12)}`;
  if (!/^[0-9a-z-]+$/i.test(exportId)) throw new Error(`안전하지 않은 exportId: ${exportId}`);

  const exportsRoot = path.resolve(GENERATED_ROOT, "exports");
  const finalExportRoot = directChildPath(exportsRoot, path.join(exportsRoot, exportId), "final export");
  const transactionToken = `${process.pid}-${Date.now()}`;
  const exportRoot = directChildPath(
    exportsRoot,
    path.join(exportsRoot, `.${exportId}.staging-${transactionToken}`),
    "staging export",
  );
  await mkdir(exportsRoot, { recursive: true });
  await removeDirectChildDirectory(exportsRoot, exportRoot, "stale staging export");
  await mkdir(exportRoot, { recursive: true });

  try {
    const generatedAt = new Date().toISOString();
    const records = [];

  const recordOutput = async ({ sourceRelative = null, outputRelative, transform = "copy", data }) => {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const destination = outputPath(exportRoot, outputRelative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, buffer);
    let sourceHash = null;
    if (sourceRelative) sourceHash = sha256(await readFile(sourcePath(sourceRoot, sourceRelative)));
    records.push({
      sourcePath: sourceRelative,
      outputPath: `generated/exports/${exportId}/${slash(outputRelative)}`,
      transform,
      sourceSha256: sourceHash,
      outputSha256: sha256(buffer),
      byteLength: buffer.byteLength,
    });
  };

  const copyAllowed = async (sourceRelative, outputRelative) => {
    if (!allowlist.includes(sourceRelative)) throw new Error(`allowlist 밖의 복사 요청: ${sourceRelative}`);
    const data = await readFile(sourcePath(sourceRoot, sourceRelative));
    await recordOutput({ sourceRelative, outputRelative, transform: "copy", data });
  };

  const mapRows = [];
  for (const mapId of MAP_IDS) {
    const sourceBase = `assets/rpg/worlds/${mapId}`;
    const outputBase = `maps/${mapId}`;
    const manifestRaw = JSON.parse(await readFile(sourcePath(sourceRoot, `${sourceBase}/manifest.json`), "utf8"));
    const manifest = sanitizeWorldManifest(manifestRaw, mapId);
    await recordOutput({
      sourceRelative: `${sourceBase}/manifest.json`,
      outputRelative: `${outputBase}/manifest.json`,
      transform: "sanitize-world-manifest",
      data: jsonText(manifest),
    });

    const contentRaw = JSON.parse(await readFile(sourcePath(sourceRoot, `${sourceBase}/content.json`), "utf8"));
    const content = stripPrivateFields(contentRaw);
    content.localPersistence = false;
    assertNoForbiddenStrings(content, `${outputBase}/content.json`);
    await recordOutput({
      sourceRelative: `${sourceBase}/content.json`,
      outputRelative: `${outputBase}/content.json`,
      transform: "strip-private-fields",
      data: jsonText(content),
    });

    for (let chunkX = 0; chunkX < 4; chunkX += 1) {
      for (let chunkY = 0; chunkY < 4; chunkY += 1) {
        const name = `${chunkX}-${chunkY}.json`;
        const sourceRelative = `${sourceBase}/chunks/${name}`;
        const chunkRaw = JSON.parse(await readFile(sourcePath(sourceRoot, sourceRelative), "utf8"));
        const chunk = stripPrivateFields(chunkRaw);
        assertNoForbiddenStrings(chunk, `${outputBase}/chunks/${name}`);
        await recordOutput({
          sourceRelative,
          outputRelative: `${outputBase}/chunks/${name}`,
          transform: "strip-private-fields",
          data: jsonText(chunk),
        });
      }
    }
    await copyAllowed(`${sourceBase}/minimap.png`, `${outputBase}/minimap.png`);
    for (let regionX = 0; regionX < 2; regionX += 1) {
      for (let regionY = 0; regionY < 2; regionY += 1) {
        const name = `${regionX}-${regionY}.png`;
        await copyAllowed(`${sourceBase}/minimap/${name}`, `${outputBase}/minimap/${name}`);
      }
    }

    mapRows.push({
      id: mapId,
      unitType: UNIT_TYPES[mapId],
      label: String(manifest.displayName || `${UNIT_TYPES[mapId]} 검수맵`),
      displayName: String(manifest.displayName || `${UNIT_TYPES[mapId]} 검수맵`),
      revision: String(manifest.revision || manifest.bundleRevision || ""),
      width: Number(manifest.bounds?.width || 64),
      height: Number(manifest.bounds?.height || 64),
      chunkCount: 16,
      blockedCellCount: Number(manifest.blockedCellCount || 0),
      renderer: "three-pbr",
      fallbackRenderer: "canvas2d",
      manifestUrl: `${outputBase}/manifest.json`,
      minimapUrl: `${outputBase}/minimap.png`,
      spawn: {
        x: Number(manifest.spawn?.x || 0),
        y: Number(manifest.spawn?.y || 0),
      },
    });
  }

  const materialSourceBase = "assets/rpg/worlds/bundang-first-village-55b-prototype/materials";
  const materialOutputBase = "maps/bundang-first-village-55b-prototype/materials";
  const materialManifestRaw = JSON.parse(await readFile(sourcePath(sourceRoot, `${materialSourceBase}/materials.json`), "utf8"));
  const materialManifest = sanitizeMaterialManifest(materialManifestRaw);
  await recordOutput({
    sourceRelative: `${materialSourceBase}/materials.json`,
    outputRelative: `${materialOutputBase}/materials.json`,
    transform: "webp-only-materials",
    data: jsonText(materialManifest),
  });
  for (const name of MATERIAL_FILES) {
    await copyAllowed(`${materialSourceBase}/${name}`, `${materialOutputBase}/${name}`);
  }

  const interiorCatalogRaw = JSON.parse(await readFile(sourcePath(sourceRoot, INTERIOR_CATALOG_SOURCE), "utf8"));
  const interiorModelsById = new Map(INTERIOR_MODEL_ROWS.map((row) => [row.assetId, row]));
  const interiorAssets = (Array.isArray(interiorCatalogRaw.assets) ? interiorCatalogRaw.assets : []).map((asset) => {
    const assetId = String(asset?.assetId || "");
    if (!assetId) throw new Error("인테리어 catalog에 assetId가 없는 항목이 있습니다.");
    const model = interiorModelsById.get(assetId);
    if (String(asset.rendererKind || "procedural") === "glb" && !model) {
      throw new Error(`공개 GLB allowlist가 없는 인테리어 asset입니다: ${assetId}`);
    }
    return {
      assetId,
      revision: String(asset.revision || "1"),
      displayNameKo: String(asset.displayNameKo || assetId),
      category: String(asset.category || "interior"),
      rendererKind: model ? "glb" : "procedural",
      defaultDimensionsMeters: asset.defaultDimensionsMeters,
      materialVariantIds: Array.isArray(asset.materialVariantIds) ? asset.materialVariantIds.map(String) : [],
      rendererRef: model ? { lods: { medium: { url: `models/${assetId}/medium.glb` } } } : { kind: "procedural" },
    };
  });
  const runtimeInteriorCatalog = {
    schemaVersion: "bunfirvil-interior-runtime-v1",
    revision: String(interiorCatalogRaw.revision || "static"),
    assets: interiorAssets,
  };
  assertNoForbiddenStrings(runtimeInteriorCatalog, "interior/catalog.json");
  await recordOutput({
    sourceRelative: INTERIOR_CATALOG_SOURCE,
    outputRelative: "interior/catalog.json",
    transform: "runtime-only-interior-catalog",
    data: jsonText(runtimeInteriorCatalog),
  });
  for (const model of INTERIOR_MODEL_ROWS) {
    await copyAllowed(model.source, `interior/models/${model.assetId}/medium.glb`);
  }

  const rendererRecipes = await import(`${pathToFileURL(sourcePath(sourceRoot, INTERIOR_RECIPE_SOURCE)).href}?export=${selectedSourceFingerprint}`);
  const runtimeRecipeCatalog = {
    schemaVersion: "bunfirvil-interior-recipes-v1",
    assets: interiorAssets.map((asset) => {
      const defaultDimensions = asset.defaultDimensionsMeters && typeof asset.defaultDimensionsMeters === "object"
        ? [
            Number(asset.defaultDimensionsMeters.width || 0.8),
            Number(asset.defaultDimensionsMeters.depth || 0.8),
            Number(asset.defaultDimensionsMeters.height || 0.8),
          ]
        : [0.8, 0.8, 0.8];
      const mountingKind = String(rendererRecipes.worldApartmentInteriorPropMountingKind(asset.assetId));
      return {
        assetId: asset.assetId,
        mountingKind,
        defaultMountHeightMeters: Number(rendererRecipes.worldApartmentInteriorPropMountHeight(
          asset.assetId,
          { geometry: { clearHeightMeters: 2.3 } },
          {},
          defaultDimensions,
        )),
        parts: rendererRecipes.worldApartmentInteriorPropParts(asset.assetId),
      };
    }),
  };
  assertNoForbiddenStrings(runtimeRecipeCatalog, "interior/recipes.json");
  await recordOutput({
    sourceRelative: INTERIOR_RECIPE_SOURCE,
    outputRelative: "interior/recipes.json",
    transform: "runtime-only-procedural-recipes",
    data: jsonText(runtimeRecipeCatalog),
  });

  const characterRows = [];
  for (const characterId of CHARACTER_IDS) {
    const sourceBase = `assets/characters/${characterId}`;
    const outputBase = `characters/${characterId}`;
    const descriptorRaw = JSON.parse(await readFile(sourcePath(sourceRoot, `${sourceBase}/animation.json`), "utf8"));
    const descriptor = sanitizeCharacterDescriptor(descriptorRaw, characterId);
    await recordOutput({
      sourceRelative: `${sourceBase}/animation.json`,
      outputRelative: `${outputBase}/animation.json`,
      transform: "runtime-only-character-descriptor",
      data: jsonText(descriptor),
    });
    for (const [motion, actions] of Object.entries(CHARACTER_ACTIONS)) {
      for (const action of actions) {
        await copyAllowed(
          `${sourceBase}/sheets/${motion}/${action}.png`,
          `${outputBase}/sheets/${motion}/${action}.png`,
        );
      }
    }
    characterRows.push({
      id: characterId,
      assetKey: characterId,
      displayName: descriptor.name,
      revision: descriptor.revision,
      descriptorUrl: `${outputBase}/animation.json`,
      defaultMotion: "idle",
      defaultAction: "normal",
    });
  }

  const effectRows = [];
  for (const effect of EFFECTS) {
    const sourceRelative = `${effect.sourceDir}/${effect.manifest}`;
    const raw = JSON.parse(await readFile(sourcePath(sourceRoot, sourceRelative), "utf8"));
    const manifest = sanitizeEffectManifest(raw, effect);
    const outputBase = `skills/effects/${effect.effectId}`;
    await recordOutput({
      sourceRelative,
      outputRelative: `${outputBase}/manifest.json`,
      transform: "sanitize-effect-manifest",
      data: jsonText(manifest),
    });
    for (const file of effect.files) await copyAllowed(file.source, `${outputBase}/${file.output}`);
    effectRows.push({
      id: effect.effectId,
      displayName: String(manifest.displayName || effect.effectId),
      manifestUrl: `${outputBase}/manifest.json`,
      placementType: String(manifest.suggestedPlacementType || "effect"),
    });
  }

  const optionsModuleRelative = "src/rpg/bundang-apartment-options.mjs";
  const optionsModule = await import(`${pathToFileURL(sourcePath(sourceRoot, optionsModuleRelative)).href}?export=${selectedSourceFingerprint}`);
  const optionGroups = optionsModule.BUNDANG_OPTION_GROUPS.map((group) => ({
    id: String(group.id),
    label: String(group.label),
  }));
  const optionRows = optionsModule.BUNDANG_OPTION_ROWS.map(sanitizeOptionRow);
  const optionCatalog = {
    schemaVersion: "bunfirvil-b-options-v1",
    unitTypes: Object.values(UNIT_TYPES),
    groups: optionGroups,
    options: optionRows,
    cautions: optionsModule.BUNDANG_OPTION_CAUTIONS.map(String),
    proceduralAssets: optionsModule.BUNDANG_VIRTUAL_OPTION_ASSETS.map(sanitizeProceduralAsset),
    previewPolicy: "css-neutral-card",
  };
  assertNoForbiddenStrings(optionCatalog, "options/catalog.json");
  await recordOutput({
    sourceRelative: optionsModuleRelative,
    outputRelative: "options/catalog.json",
    transform: "rights-safe-option-metadata",
    data: jsonText(optionCatalog),
  });
  await copyAllowed(optionsModuleRelative, "options/runtime.mjs");

  const skillRows = [];
  const effectById = new Map(effectRows.map((effect) => [effect.id, effect]));
  for (const skill of SKILLS) {
    const iconUrl = skill.icon ? `skills/${skill.icon.output}` : "";
    if (skill.icon) await copyAllowed(skill.icon.source, iconUrl);
    skillRows.push({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      iconUrl,
      cooldownMs: skill.cooldownMs,
      motion: skill.motion,
      effects: skill.effects.map((binding) => ({
        ...binding,
        manifestUrl: effectById.get(binding.effectId)?.manifestUrl || "",
      })),
      serverAuthority: false,
    });
  }
  const skillCatalog = {
    schemaVersion: "bunfirvil-skills-v1",
    skills: skillRows.map((skill) => ({
      ...skill,
      iconUrl: skill.iconUrl.replace(/^skills\//, ""),
      effects: skill.effects.map((binding) => ({
        ...binding,
        manifestUrl: binding.manifestUrl.replace(/^skills\//, ""),
      })),
    })),
    effects: effectRows.map((effect) => ({
      ...effect,
      manifestUrl: effect.manifestUrl.replace(/^skills\//, ""),
    })),
  };
  await recordOutput({
    sourceRelative: null,
    outputRelative: "skills/catalog.json",
    transform: "selected-skill-catalog",
    data: jsonText(skillCatalog),
  });

  for (const map of mapRows) {
    const prefix = `generated/exports/${exportId}/maps/${map.id}/`;
    map.assetBytes = records
      .filter((record) => record.outputPath.startsWith(prefix))
      .reduce((sum, record) => sum + record.byteLength, 0);
  }

  const addPrefix = (url) => `generated/exports/${exportId}/${url}`;
  const optionGroupById = new Map(optionGroups.map((group) => [group.id, group.label]));
  const stableOptions = optionRows.map((option) => {
    const ownPrices = option.prices && typeof option.prices === "object" ? option.prices : {};
    const unitOrder = Object.values(UNIT_TYPES);
    const priceEntries = Object.entries(ownPrices)
      .map(([unitType, price]) => [String(unitType), Number(price)])
      .filter(([, price]) => Number.isFinite(price))
      .sort(([left], [right]) => {
        const leftIndex = unitOrder.indexOf(left);
        const rightIndex = unitOrder.indexOf(right);
        if (leftIndex >= 0 || rightIndex >= 0) {
          if (leftIndex < 0) return 1;
          if (rightIndex < 0) return -1;
          return leftIndex - rightIndex;
        }
        return left.localeCompare(right, "en");
      });
    const prices = Object.fromEntries(priceEntries);
    const compatibleUnitTypes = Array.isArray(option.availableUnitTypes)
      ? option.availableUnitTypes.map(String)
      : Object.keys(prices);
    const explicitRequired = Array.isArray(option.requires)
      ? option.requires.map(String)
      : option.requires ? [String(option.requires)] : [];
    const requires = [...new Set([
      ...explicitRequired,
      ...(Array.isArray(option.requiresAll) ? option.requiresAll.map(String) : []),
    ])];
    const requiresAny = [...new Set(Array.isArray(option.requiresAny) ? option.requiresAny.map(String) : [])];
    const excludes = option.exclusiveGroup
      ? optionRows
        .filter((candidate) => candidate.assetId !== option.assetId && candidate.exclusiveGroup === option.exclusiveGroup)
        .map((candidate) => String(candidate.assetId))
      : [];
    return {
      id: String(option.assetId),
      label: String(option.paletteLabel || option.label || option.assetId),
      category: String(optionGroupById.get(option.groupId) || option.groupId || "기타"),
      price: Number(priceEntries[0]?.[1] ?? 0),
      prices,
      description: `${String(option.label || option.assetId)} · ${String(option.visualMode || "로컬 미리보기")}`,
      compatibleUnitTypes,
      requires,
      requiresAny,
      excludes,
    };
  });
  const stableOptionIds = new Set(stableOptions.map((option) => option.id));
  for (const option of stableOptions) {
    for (const field of ["requires", "requiresAny", "excludes"]) {
      for (const referenceId of option[field]) {
        if (!stableOptionIds.has(referenceId)) {
          throw new Error(`B옵션 ${option.id}.${field}가 알 수 없는 옵션 ${referenceId}를 참조합니다.`);
        }
      }
    }
  }
  const stableCatalog = {
    schemaVersion: 1,
    exportId,
    generatedAt,
    maps: mapRows.map((map) => ({
      id: map.id,
      label: map.label,
      unitType: map.unitType,
      revision: map.revision,
      width: map.width,
      height: map.height,
      chunkCount: map.chunkCount,
      assetBytes: map.assetBytes,
      renderer: map.renderer,
      manifestUrl: addPrefix(map.manifestUrl),
      minimapUrl: addPrefix(map.minimapUrl),
      spawn: map.spawn,
    })),
    characters: characterRows.map((character) => ({
      key: character.assetKey,
      label: character.displayName,
      manifestUrl: addPrefix(character.descriptorUrl),
    })),
    skills: skillRows.filter((skill) => skill.id !== "basic-attack").map((skill) => ({
      id: skill.id,
      label: skill.name,
      description: skill.description,
      iconUrl: skill.iconUrl ? addPrefix(skill.iconUrl) : "",
      effectUrls: skill.effects.map((binding) => addPrefix(binding.manifestUrl)),
      cooldownMs: skill.cooldownMs,
      manaCost: 0,
    })),
    defaultHotbar: ["basic-attack", "warrior-shock-stun", "common-double-arrow", "common-teleport", null, null, null, null],
    bOptions: stableOptions,
    renderAssets: {
      interiorCatalogUrl: addPrefix("interior/catalog.json"),
      recipeCatalogUrl: addPrefix("interior/recipes.json"),
      optionModuleUrl: addPrefix("options/runtime.mjs"),
      materialManifestUrl: addPrefix("maps/bundang-first-village-55b-prototype/materials/materials.json"),
    },
  };
  const versionedCatalog = {
    schemaVersion: "ShowcaseCatalogV1-rich",
    exportId,
    generatedAt,
    maps: mapRows,
    characters: characterRows,
    skills: skillRows,
    defaultHotbar: stableCatalog.defaultHotbar,
    bOptions: {
      catalogUrl: "options/catalog.json",
      optionCount: optionRows.length,
      unitTypes: Object.values(UNIT_TYPES),
    },
    renderAssets: stableCatalog.renderAssets,
  };
  await recordOutput({
    sourceRelative: null,
    outputRelative: "showcase-catalog.json",
    transform: "versioned-showcase-catalog",
    data: jsonText(versionedCatalog),
  });

  const stableCatalogText = jsonText(stableCatalog);
  const currentDocument = {
    schemaVersion: "bunfirvil-current-v1",
    exportId,
    generatedAt,
    basePath: `exports/${exportId}/`,
    catalogUrl: "catalog.v1.json",
    sourceExportUrl: `exports/${exportId}/source-export.json`,
    source: { head: sourceHead, dirty },
  };
  const currentText = jsonText(currentDocument);
  records.push(
    {
      sourcePath: null,
      outputPath: "generated/catalog.v1.json",
      transform: "stable-showcase-catalog",
      sourceSha256: null,
      outputSha256: sha256(Buffer.from(stableCatalogText)),
      byteLength: Buffer.byteLength(stableCatalogText),
    },
    {
      sourcePath: null,
      outputPath: "generated/current.json",
      transform: "current-export-pointer",
      sourceSha256: null,
      outputSha256: sha256(Buffer.from(currentText)),
      byteLength: Buffer.byteLength(currentText),
    },
  );
  records.sort((left, right) => left.outputPath.localeCompare(right.outputPath, "en"));
  const sourceExport = {
    schemaVersion: 1,
    exportId,
    generatedAt,
    exporterVersion: EXPORTER_VERSION,
    exporterSha256,
    sourceRepository: "pvp",
    sourceHead,
    sourceDirty: dirty,
    source: {
      repository: "pvp",
      head: sourceHead,
      dirty,
      selectedSourceFingerprint,
    },
    publicationApproval: {
      policyType: publicationApproval.document.policyType,
      policyVersion: publicationApproval.document.policyVersion,
      policySha256: publicationApproval.sha256,
      defaultDecision: publicationApproval.document.defaultDecision,
      legalRightsProof: false,
      statement: publicationApproval.document.statement,
    },
    files: records.map((record) => {
      const approval = record.sourcePath ? publicationApproval.approvals.get(record.sourcePath) : null;
      return {
        ...record,
        sourcePath: record.sourcePath || `generated:${record.transform}`,
        publicPath: record.outputPath,
        sha256: record.outputSha256,
        bytes: record.byteLength,
        rightsClass: approval?.rightsClass || "exporter-generated-metadata",
        publicationApprovalCategory: approval?.categoryId || "exporter-generated",
      };
    }),
    exclusions: [
      "map plan-contract/source/audit and operator-only policy fields",
      "KTX2 loaders/transcoders and unrelated OpenMMO materials",
      "interior model binaries and official/reference preview photographs",
      "character source frames, source-export trees, hurt/death/seat sheets",
      "full skill catalog and third-party-derived LK/Y1000 icons",
      "external, unresolved, rights-unknown, and other non-approved publication categories",
      "authentication, database and networked backend runtime code",
    ],
  };
  const sourceExportText = jsonText(sourceExport);
  assertNoForbiddenStrings(sourceExportText, "source-export.json");
  await writeFile(outputPath(exportRoot, "source-export.json"), sourceExportText, "utf8");

  const unresolved = [];
  const expectedOutputs = [
    ...mapRows.flatMap((map) => [map.manifestUrl, map.minimapUrl]),
    ...characterRows.map((character) => character.descriptorUrl),
    ...skillRows.flatMap((skill) => [skill.iconUrl, ...skill.effects.map((effect) => effect.manifestUrl)]).filter(Boolean),
    "options/catalog.json",
    "showcase-catalog.json",
    "source-export.json",
  ];
  for (const relativeUrl of expectedOutputs) {
    try {
      await ensureFile(outputPath(exportRoot, relativeUrl), relativeUrl);
    } catch {
      unresolved.push(relativeUrl);
    }
  }
  if (unresolved.length) throw new Error(`해결되지 않은 export 참조:\n${unresolved.join("\n")}`);
  const versionedPublicPrefix = `generated/exports/${exportId}/`;
  for (const record of records) {
    if (!record.outputPath.startsWith(versionedPublicPrefix)) continue;
    const relativePath = record.outputPath.slice(versionedPublicPrefix.length);
    const stagedFile = outputPath(exportRoot, relativePath);
    const stagedHash = sha256(await readFile(stagedFile));
    if (stagedHash !== record.outputSha256) {
      throw new Error(`staging export 해시가 일치하지 않습니다: ${relativePath}`);
    }
  }

  const totalBytes = records.reduce((sum, record) => sum + record.byteLength, 0) + Buffer.byteLength(sourceExportText);
  const transactionTarget = directChildPath(GENERATED_ROOT, args.transactionFile, "worker transaction file");
  await writeFile(transactionTarget, jsonText({
    schemaVersion: 1,
    exportId,
    transactionToken,
    stagingDirectory: path.basename(exportRoot),
    stableCatalog,
    stableCatalogText,
    currentDocument,
    currentText,
    stableCatalogText,
    currentText,
    summary: {
      exportId,
      sourceHead,
      dirty,
      mapCount: mapRows.length,
      characterCount: characterRows.length,
      skillCount: skillRows.length,
      effectCount: effectRows.length,
      optionCount: optionRows.length,
      fileCount: records.length + 1,
      totalBytes,
      unresolvedReferences: unresolved,
    },
  }), "utf8");
  } catch (error) {
    if (await pathExists(exportRoot)) {
      await removeDirectChildDirectory(exportsRoot, exportRoot, "실패한 staging export");
    }
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(`sync-from-pvp 실패: ${error?.stack || error}\n`);
  process.exitCode = 1;
});
