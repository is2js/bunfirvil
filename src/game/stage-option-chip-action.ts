export type StageOptionChipAction =
  | { kind: 'select'; optionId: string }
  | { kind: 'remove'; optionId: string };

interface DatasetCarrier {
  dataset?: {
    stageOptionSelect?: string;
    stageOptionRemove?: string;
  };
}

function datasetAt(value: unknown): DatasetCarrier['dataset'] | undefined {
  if (!value || typeof value !== 'object' || !('dataset' in value)) return undefined;
  return (value as DatasetCarrier).dataset;
}

/** X 삭제를 우선하고, 그 외에는 chip 테두리를 포함한 전체 영역을 선택으로 해석한다. */
export function stageOptionChipActionFromPath(path: readonly unknown[]): StageOptionChipAction | null {
  for (const value of path) {
    const optionId = String(datasetAt(value)?.stageOptionRemove || '');
    if (optionId) return { kind: 'remove', optionId };
  }
  for (const value of path) {
    const optionId = String(datasetAt(value)?.stageOptionSelect || '');
    if (optionId) return { kind: 'select', optionId };
  }
  return null;
}
