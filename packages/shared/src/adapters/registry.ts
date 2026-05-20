import type { FileExportAdapterId } from '../types';
import type { FileExportAdapter } from './interface';
import { AccountEdgeAdapter } from './accountedge';
import { UniversalCsvAdapter } from './universal-csv';
import { IIFAdapter } from './iif';

export const ADAPTERS: Record<FileExportAdapterId, () => FileExportAdapter> = {
  accountedge:   () => new AccountEdgeAdapter(),
  universal_csv: () => new UniversalCsvAdapter(),
  qb_desktop:    () => new IIFAdapter(),
  // Sage 50 CSV adapter — TODO (Phase 1.5)
  sage50:        () => new UniversalCsvAdapter(),
};

export function selectAdapter(id: FileExportAdapterId): FileExportAdapter {
  const factory = ADAPTERS[id];
  if (!factory) throw new Error(`Unknown file export adapter: ${id}`);
  return factory();
}
