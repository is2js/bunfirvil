import { loadCatalog, resolveAppUrl } from "./manage/catalog";
import {
  changeOptionSelection,
  compatibleOptions,
  defaultReview,
  makeReviewBundle,
  optionQuote,
  optionUnitPrice,
  validateReviewBundle,
} from "./manage/review-model";
import { loadReview, removeReview, saveReview } from "./manage/review-store";
import { InteriorEditor } from "./manage/interior-editor";
import type {
  BOptionV1,
  LocalReviewV1,
  ReviewStatus,
  ShowcaseCatalogV1,
  StaticMapEntryV1,
} from "./manage/types";
import { guardOperatorPage } from './shared/operator-access';

const STATUS_LABELS: Record<ReviewStatus, string> = {
  unreviewed: "미검수",
  pass: "통과",
  "needs-work": "수정 필요",
};

const moneyFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function mustElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`#${id} 요소를 찾을 수 없습니다.`);
  }
  return element as T;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}

function formatTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? dateFormatter.format(new Date(timestamp)) : value;
}

function buildDemoUrl(mapId?: string): string {
  const url = new URL(resolveAppUrl());
  if (mapId) {
    url.searchParams.set("map", mapId);
    url.searchParams.set("actor", "100");
  }
  return url.href;
}

interface CardView {
  card: HTMLElement;
  badge: HTMLElement;
  select: HTMLSelectElement;
  notes: HTMLTextAreaElement;
  saveLine: HTMLElement;
  optionDetails: HTMLDetailsElement;
  optionContent: HTMLElement;
  optionSummary: HTMLElement;
  optionInputs: Map<string, HTMLInputElement>;
  quote: HTMLElement;
  optionsRendered: boolean;
}

class ReviewWorkspace {
  private catalog: ShowcaseCatalogV1 | null = null;
  private readonly reviews = new Map<string, LocalReviewV1>();
  private readonly cards = new Map<string, CardView>();
  private messageTimer: number | undefined;
  private interiorEditor: InteriorEditor | null = null;

  private readonly loadingState = mustElement<HTMLElement>("loadingState");
  private readonly errorState = mustElement<HTMLElement>("errorState");
  private readonly errorMessage = mustElement<HTMLElement>("errorMessage");
  private readonly workspace = mustElement<HTMLElement>("workspace");
  private readonly mapGrid = mustElement<HTMLElement>("mapGrid");
  private readonly messageRegion = mustElement<HTMLElement>("messageRegion");
  private readonly importFile = mustElement<HTMLInputElement>("importFile");

  constructor() {
    mustElement<HTMLAnchorElement>("homeLink").href = buildDemoUrl();
    mustElement<HTMLAnchorElement>("demoLink").href = buildDemoUrl();
    mustElement<HTMLButtonElement>("retryButton").addEventListener("click", () => void this.initialize());
    mustElement<HTMLButtonElement>("exportButton").addEventListener("click", () => this.exportReviews());
    mustElement<HTMLButtonElement>("resetButton").addEventListener("click", () => this.resetReviews());
    this.importFile.addEventListener("change", () => void this.importReviews());
  }

  async initialize(): Promise<void> {
    this.loadingState.hidden = false;
    this.errorState.hidden = true;
    this.workspace.hidden = true;
    this.clearMessage();

    try {
      this.catalog = await loadCatalog();
      this.reviews.clear();
      this.cards.clear();
      this.mapGrid.replaceChildren();

      const warnings: string[] = [];
      for (const map of this.catalog.maps) {
        const loaded = loadReview(map.id, this.catalog);
        this.reviews.set(map.id, loaded.review);
        if (loaded.warning) warnings.push(loaded.warning);
      }

      this.renderCatalogMeta();
      this.catalog.maps.forEach((map) => this.renderMapCard(map));
      this.updateSummary();
      this.loadingState.hidden = true;
      this.workspace.hidden = false;
      if (!this.interiorEditor) {
        this.interiorEditor = new InteriorEditor(
          this.catalog,
          (mapId) => [...(this.reviews.get(mapId)?.selectedOptionIds || [])],
        );
        await this.interiorEditor.initialize();
      }
      if (warnings.length > 0) {
        this.showMessage(warnings.join(" "), true, 9_000);
      }
    } catch (error) {
      this.loadingState.hidden = true;
      this.errorState.hidden = false;
      this.errorMessage.textContent =
        error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
    }
  }

  private renderCatalogMeta(): void {
    if (!this.catalog) return;
    mustElement("exportId").textContent = this.catalog.exportId;
    const generatedAt = mustElement<HTMLTimeElement>("generatedAt");
    generatedAt.dateTime = this.catalog.generatedAt;
    generatedAt.textContent = formatTimestamp(this.catalog.generatedAt);
    mustElement("totalMapCount").textContent = String(this.catalog.maps.length);
  }

  private renderMapCard(map: StaticMapEntryV1): void {
    if (!this.catalog) return;
    const review = this.reviews.get(map.id) ?? defaultReview(map.id);
    const availableOptions = compatibleOptions(this.catalog.bOptions, map.unitType);

    const card = createElement("article", "map-card");
    card.dataset.mapId = map.id;
    card.dataset.reviewStatus = review.status;

    const preview = createElement("div", "map-preview");
    const rendererBadge = createElement("span", "renderer-badge", map.renderer);
    const fallback = createElement("span", "image-fallback", "MINIMAP PREVIEW UNAVAILABLE");
    fallback.hidden = true;
    const image = createElement("img");
    image.alt = `${map.label} 미니맵`;
    image.loading = "lazy";
    image.decoding = "async";
    image.src = resolveAppUrl(map.minimapUrl);
    image.addEventListener("error", () => {
      image.hidden = true;
      fallback.hidden = false;
    });
    preview.append(image, fallback, rendererBadge);

    const body = createElement("div", "map-card-body");
    const heading = createElement("div", "map-card-heading");
    const titleGroup = createElement("div");
    const title = createElement("h3", undefined, map.label);
    title.id = `map-title-${map.id}`;
    const mapId = createElement("p", "map-id", map.id);
    mapId.title = map.id;
    titleGroup.append(title, mapId);
    const badge = createElement("span", `review-badge ${review.status}`, STATUS_LABELS[review.status]);
    heading.append(titleGroup, badge);
    card.setAttribute("aria-labelledby", title.id);

    const meta = createElement("dl", "map-meta");
    meta.append(
      this.metaItem("UNIT", map.unitType),
      this.metaItem("REVISION", map.revision),
      this.metaItem("SIZE", `${map.width} × ${map.height}`),
      this.metaItem("CHUNKS", `${map.chunkCount} · ${formatBytes(map.assetBytes)}`),
    );

    const form = createElement("div", "review-form");
    const statusField = createElement("div", "field");
    const statusLabel = createElement("label", undefined, "검수 상태");
    const select = createElement("select");
    select.id = `status-${map.id}`;
    statusLabel.htmlFor = select.id;
    (["unreviewed", "pass", "needs-work"] as ReviewStatus[]).forEach((status) => {
      const option = createElement("option", undefined, STATUS_LABELS[status]);
      option.value = status;
      option.selected = review.status === status;
      select.append(option);
    });
    statusField.append(statusLabel, select);

    const noteField = createElement("div", "field");
    const noteLabel = createElement("label", undefined, "검수 메모");
    const notes = createElement("textarea");
    notes.id = `notes-${map.id}`;
    notes.maxLength = 10_000;
    notes.placeholder = "렌더링 차이, 수정 요청, 재확인 지점을 기록하세요.";
    notes.value = review.notes;
    noteLabel.htmlFor = notes.id;
    const saveLine = createElement("span", "save-line", this.savedAtText(review.updatedAt));
    noteField.append(noteLabel, notes, saveLine);

    const optionDetails = createElement("details", "option-panel");
    const optionSummary = createElement("summary");
    const summaryCopy = createElement("span", "option-summary");
    const summaryTitle = createElement("span", undefined, "B옵션 조합");
    const summaryValue = createElement("small");
    summaryCopy.append(summaryTitle, summaryValue);
    optionSummary.append(summaryCopy);
    const optionContent = createElement("div", "option-content");
    optionDetails.append(optionSummary, optionContent);

    const footer = createElement("div", "map-card-footer");
    const quote = createElement("span", "quote");
    const quoteLabel = createElement("span", undefined, "선택 옵션 견적");
    const quoteValue = createElement("strong");
    quote.append(quoteLabel, quoteValue);
    const launch = createElement("a", "button", "이 맵 렌더링 열기");
    launch.href = buildDemoUrl(map.id);
    footer.append(quote, launch);

    form.append(statusField, noteField, optionDetails, footer);
    body.append(heading, meta, form);
    card.append(preview, body);
    this.mapGrid.append(card);

    const view: CardView = {
      card,
      badge,
      select,
      notes,
      saveLine,
      optionDetails,
      optionContent,
      optionSummary: summaryValue,
      optionInputs: new Map(),
      quote: quoteValue,
      optionsRendered: false,
    };
    this.cards.set(map.id, view);
    this.refreshCard(map.id);

    select.addEventListener("change", () => {
      this.patchReview(map.id, { status: select.value as ReviewStatus });
    });
    notes.addEventListener("input", () => {
      this.patchReview(map.id, { notes: notes.value }, false);
    });
    notes.addEventListener("change", () => this.saveCurrentReview(map.id));
    optionDetails.addEventListener("toggle", () => {
      if (optionDetails.open && !view.optionsRendered) {
        this.renderOptions(map, availableOptions, view);
      }
    });
  }

  private metaItem(label: string, value: string): HTMLElement {
    const container = createElement("div");
    container.append(createElement("dt", undefined, label), createElement("dd", undefined, value));
    return container;
  }

  private renderOptions(map: StaticMapEntryV1, options: BOptionV1[], view: CardView): void {
    view.optionsRendered = true;
    view.optionContent.replaceChildren();
    view.optionInputs.clear();
    if (options.length === 0) {
      view.optionContent.append(
        createElement("p", "option-empty", `${map.unitType}에 공개 가능한 B옵션이 없습니다.`),
      );
      return;
    }

    const byCategory = new Map<string, BOptionV1[]>();
    options.forEach((option) => {
      const group = byCategory.get(option.category) ?? [];
      group.push(option);
      byCategory.set(option.category, group);
    });

    for (const [category, categoryOptions] of byCategory) {
      const section = createElement("section", "option-category");
      section.append(createElement("h4", undefined, category));
      for (const option of categoryOptions) {
        const row = createElement("label", "option-row");
        const input = createElement("input");
        input.type = "checkbox";
        input.value = option.id;
        input.checked = this.reviews.get(map.id)?.selectedOptionIds.includes(option.id) ?? false;
        input.setAttribute("aria-label", `${option.label} 선택`);

        const copy = createElement("span", "option-copy");
        const optionTitle = createElement("strong", undefined, option.label);
        const constraints: string[] = [];
        if (option.requires.length > 0) constraints.push(`필수 ${option.requires.join(", ")}`);
        if (option.requiresAny.length > 0) {
          constraints.push(`다음 중 하나 필수 ${option.requiresAny.join(", ")}`);
        }
        if (option.excludes.length > 0) constraints.push(`동시 불가 ${option.excludes.join(", ")}`);
        const description = createElement(
          "small",
          undefined,
          [option.description, ...constraints].filter(Boolean).join(" · "),
        );
        copy.append(optionTitle, description);

        if (option.previewUrl) {
          const preview = createElement("img", "option-preview");
          preview.src = resolveAppUrl(option.previewUrl);
          preview.alt = "";
          preview.loading = "lazy";
          preview.addEventListener("error", () => preview.remove());
          copy.prepend(preview);
        }

        row.append(
          input,
          copy,
          createElement(
            "span",
            "option-price",
            moneyFormatter.format(optionUnitPrice(option, map.unitType)),
          ),
        );
        section.append(row);
        view.optionInputs.set(option.id, input);

        input.addEventListener("change", () => {
          const review = this.reviews.get(map.id) ?? defaultReview(map.id);
          try {
            const change = changeOptionSelection(
              review.selectedOptionIds,
              option.id,
              input.checked,
              map.unitType,
              this.catalog?.bOptions ?? [],
            );
            this.patchReview(map.id, { selectedOptionIds: change.selectedOptionIds });
            const addedDependencies = change.addedOptionIds.filter((id) => id !== option.id);
            const removedRelated = change.removedOptionIds.filter((id) => id !== option.id);
            if (addedDependencies.length > 0 || removedRelated.length > 0) {
              const messages: string[] = [];
              if (addedDependencies.length > 0) {
                messages.push(`필수 옵션 ${addedDependencies.join(", ")}도 선택했습니다.`);
              }
              if (removedRelated.length > 0) {
                messages.push(`의존·배타 조건에 따라 ${removedRelated.join(", ")} 선택을 해제했습니다.`);
              }
              this.showMessage(messages.join(" "));
            }
          } catch (error) {
            input.checked = !input.checked;
            this.showMessage(error instanceof Error ? error.message : "옵션을 변경할 수 없습니다.", true);
          }
        });
      }
      view.optionContent.append(section);
    }
  }

  private patchReview(
    mapId: string,
    patch: Partial<Pick<LocalReviewV1, "status" | "notes" | "selectedOptionIds">>,
    announceSave = true,
  ): void {
    const current = this.reviews.get(mapId) ?? defaultReview(mapId);
    const next: LocalReviewV1 = {
      ...current,
      ...patch,
      selectedOptionIds: patch.selectedOptionIds
        ? [...patch.selectedOptionIds]
        : [...current.selectedOptionIds],
      updatedAt: new Date().toISOString(),
    };
    this.reviews.set(mapId, next);
    this.saveCurrentReview(mapId, announceSave);
    this.refreshCard(mapId);
    this.updateSummary();
    this.interiorEditor?.refreshSelectedOptions(mapId);
  }

  private saveCurrentReview(mapId: string, announceSave = true): void {
    const review = this.reviews.get(mapId);
    if (!review) return;
    try {
      saveReview(review);
      if (announceSave) {
        this.cards.get(mapId)?.saveLine.replaceChildren(document.createTextNode(this.savedAtText(review.updatedAt)));
      }
    } catch {
      this.showMessage("브라우저 저장공간에 기록하지 못했습니다. JSON 내보내기로 내용을 보관해 주세요.", true);
    }
  }

  private savedAtText(updatedAt: string): string {
    return `이 브라우저에 자동 저장 · ${formatTimestamp(updatedAt)}`;
  }

  private refreshCard(mapId: string): void {
    if (!this.catalog) return;
    const review = this.reviews.get(mapId);
    const view = this.cards.get(mapId);
    if (!review || !view) return;

    view.card.dataset.reviewStatus = review.status;
    view.badge.className = `review-badge ${review.status}`;
    view.badge.textContent = STATUS_LABELS[review.status];
    view.select.value = review.status;
    if (document.activeElement !== view.notes) view.notes.value = review.notes;
    view.saveLine.textContent = this.savedAtText(review.updatedAt);
    view.optionInputs.forEach((input, optionId) => {
      input.checked = review.selectedOptionIds.includes(optionId);
    });
    const map = this.catalog.maps.find((entry) => entry.id === mapId);
    const options = map ? compatibleOptions(this.catalog.bOptions, map.unitType) : [];
    view.optionSummary.textContent = `${review.selectedOptionIds.length}개 · ${moneyFormatter.format(optionQuote(review.selectedOptionIds, options, map?.unitType))}`;
    view.quote.textContent = moneyFormatter.format(
      optionQuote(review.selectedOptionIds, options, map?.unitType),
    );
  }

  private updateSummary(): void {
    if (!this.catalog) return;
    const reviews = [...this.reviews.values()];
    mustElement("passCount").textContent = String(reviews.filter((review) => review.status === "pass").length);
    mustElement("needsWorkCount").textContent = String(
      reviews.filter((review) => review.status === "needs-work").length,
    );
    mustElement("selectedOptionCount").textContent = String(
      reviews.reduce((total, review) => total + review.selectedOptionIds.length, 0),
    );
    const totalQuote = reviews.reduce((total, review) => {
      const map = this.catalog?.maps.find((entry) => entry.id === review.mapId);
      const options = map ? compatibleOptions(this.catalog?.bOptions ?? [], map.unitType) : [];
      return total + optionQuote(review.selectedOptionIds, options, map?.unitType);
    }, 0);
    mustElement("totalQuote").textContent = moneyFormatter.format(totalQuote);
  }

  private exportReviews(): void {
    if (!this.catalog) return;
    const reviews = this.catalog.maps.map(
      (map) => this.reviews.get(map.id) ?? defaultReview(map.id),
    );
    const blob = new Blob([`${JSON.stringify(makeReviewBundle(reviews), null, 2)}\n`], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bunfirvil-reviews-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    this.showMessage("네 개 맵의 로컬 검수자료를 JSON으로 내보냈습니다.");
  }

  private async importReviews(): Promise<void> {
    const file = this.importFile.files?.[0];
    this.importFile.value = "";
    if (!file || !this.catalog) return;
    if (file.size > 2 * 1024 * 1024) {
      this.showMessage("검수 JSON은 2 MiB 이하여야 합니다.", true);
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const result = validateReviewBundle(parsed, this.catalog);
      if (!result.ok) {
        this.showMessage(`가져오기 검증 실패: ${result.errors.join(" ")}`, true, 12_000);
        return;
      }

      for (const imported of result.value.reviews) {
        const review = { ...imported, selectedOptionIds: [...imported.selectedOptionIds] };
        this.reviews.set(review.mapId, review);
        saveReview(review);
        this.refreshCard(review.mapId);
      }
      this.updateSummary();
      this.showMessage(`${result.value.reviews.length}개 맵의 검수자료를 가져왔습니다.`);
    } catch (error) {
      this.showMessage(
        error instanceof SyntaxError
          ? "가져올 파일이 올바른 JSON이 아닙니다."
          : "검수자료를 가져오는 중 브라우저 저장 오류가 발생했습니다.",
        true,
      );
    }
  }

  private resetReviews(): void {
    if (!this.catalog) return;
    const confirmed = window.confirm(
      "이 브라우저에 저장된 네 개 검수맵의 상태, 메모, B옵션 조합을 모두 초기화할까요? 이 작업은 되돌릴 수 없습니다.",
    );
    if (!confirmed) return;

    try {
      for (const map of this.catalog.maps) {
        removeReview(map.id);
        this.reviews.set(map.id, defaultReview(map.id));
        this.refreshCard(map.id);
      }
      this.updateSummary();
      this.showMessage("이 브라우저의 검수자료를 초기화했습니다.");
    } catch {
      this.showMessage("브라우저 저장공간을 초기화하지 못했습니다.", true);
    }
  }

  private showMessage(message: string, isError = false, duration = 5_000): void {
    if (this.messageTimer !== undefined) window.clearTimeout(this.messageTimer);
    this.messageRegion.hidden = false;
    this.messageRegion.classList.toggle("error", isError);
    this.messageRegion.textContent = message;
    this.messageTimer = window.setTimeout(() => this.clearMessage(), duration);
  }

  private clearMessage(): void {
    if (this.messageTimer !== undefined) window.clearTimeout(this.messageTimer);
    this.messageTimer = undefined;
    this.messageRegion.hidden = true;
    this.messageRegion.textContent = "";
    this.messageRegion.classList.remove("error");
  }
}

if (guardOperatorPage('검수맵 관리')) {
  const workspace = new ReviewWorkspace();
  void workspace.initialize();
}
