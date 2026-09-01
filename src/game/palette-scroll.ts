interface CenteredScrollTopInput {
  scrollTop: number;
  viewportTop: number;
  viewportHeight: number;
  contentHeight: number;
  itemTop: number;
  itemHeight: number;
}

/** 현재 rect를 기준으로 항목 중앙이 스크롤 뷰포트 중앙에 오도록 제한한다. */
export function centeredScrollTop({
  scrollTop,
  viewportTop,
  viewportHeight,
  contentHeight,
  itemTop,
  itemHeight,
}: CenteredScrollTopInput): number {
  const desired = scrollTop + itemTop - viewportTop - (viewportHeight - itemHeight) / 2;
  const max = Math.max(0, contentHeight - viewportHeight);
  return Math.min(max, Math.max(0, desired));
}
