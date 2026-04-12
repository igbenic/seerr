export interface GoogleSheetsAuthStatusResponse {
  connected: boolean;
  connectedAt?: Date | null;
  email?: string | null;
  enabled: boolean;
}

export interface GoogleSheetsSyncTargetStatusResponse {
  enabled: boolean;
  lastAttemptedSyncAt?: Date | null;
  lastError?: string | null;
  lastSuccessfulSyncAt?: Date | null;
  spreadsheetId?: string | null;
  spreadsheetUrl?: string | null;
}

export interface GoogleSheetsSyncStatusResponse {
  linked: boolean;
  watchlist: GoogleSheetsSyncTargetStatusResponse;
  watched: GoogleSheetsSyncTargetStatusResponse;
}
