import type { ApartmentInteriorProp, BOptionEntry } from './types';

interface InteriorNameAsset {
  assetId: string;
  displayNameKo: string;
}

const KOREAN_ASSET_NAMES: Readonly<Record<string, string>> = Object.freeze({
  'living-art-wall-greige-stone': '디자인 월(거실/복도면)',
  'interior-infinity-door-panel': '인피니티 도어',
  'bunfirvil-bedroom-1-pet-full-wall': '침실1 광폭 붙박이장(PET)',
  'bunfirvil-bedroom-1-clothing-care-full-wall': '침실1 의류관리형 붙박이장',
  'bunfirvil-dress-room-powder-vanity': '드레스룸 파우더 화장대',
  'bunfirvil-dress-room-storage-three-bay': '드레스룸 파우더 결합형 수납장',
  'bunfirvil-bathroom-combination-ventilator-rounded': '욕실 복합환풍기',
});

/** 선택 이름은 내부 영문 ID가 아니라 옵션 팔레트와 동일한 이름을 우선한다. */
export function interiorSelectionName(
  prop: ApartmentInteriorProp,
  options: BOptionEntry[],
  assets: InteriorNameAsset[],
): string {
  const optionId = String(prop.sourceOptionId || '');
  const option = optionId ? options.find((candidate) => candidate.id === optionId) : undefined;
  if (option?.label) return option.label;

  const assetId = String(prop.assetId || '');
  const asset = assets.find((candidate) => candidate.assetId === assetId);
  if (asset?.displayNameKo) return asset.displayNameKo;

  for (const value of [prop.displayNameKo, prop.labelKo]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  for (const value of [prop.displayName, prop.label]) {
    if (typeof value === 'string' && /[가-힣]/.test(value)) return value.trim();
  }
  return KOREAN_ASSET_NAMES[assetId] || '인테리어 구성요소';
}
