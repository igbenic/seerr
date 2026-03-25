export type ImdbAuthType = 'password' | 'cookie';

export type ImdbImportItemStatus = 'eligible' | 'existing' | 'skipped';

export interface ImdbImportItem {
  imdbId: string;
  imdbType: string;
  status: ImdbImportItemStatus;
  title: string;
  reason?: string;
}

export interface ImdbImportSummary {
  alreadyOnTrakt: number;
  eligibleToAdd: number;
  skippedUnsupported: number;
  total: number;
}

export interface ImdbImportPreviewResponse {
  items: ImdbImportItem[];
  previewToken: string;
  summary: ImdbImportSummary;
}

export interface ImdbImportConfirmResponse {
  added: ImdbImportItem[];
  notFound: ImdbImportItem[];
  skippedUnsupported: ImdbImportItem[];
  summary: {
    added: number;
    existing: number;
    notFound: number;
    skippedUnsupported: number;
  };
}
