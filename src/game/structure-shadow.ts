export function isExteriorWall(value: Record<string, unknown>): boolean {
  return String(value.kind || value.structuralRole || '').toLowerCase() === 'exterior';
}

/** 외부 지면에 투영되는 구조 그림자는 외벽만 허용한다. */
export function castsExteriorStructureShadow(value: Record<string, unknown>, cutaway = false): boolean {
  return isExteriorWall(value) && !cutaway;
}
