import type Media from '@server/entity/Media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type { User } from '@server/entity/User';
import type { PaginatedResponse } from './common';

export interface UserResultsResponse extends PaginatedResponse {
  results: User[];
}

export interface UserRequestsResponse extends PaginatedResponse {
  results: MediaRequest[];
}

export interface QuotaStatus {
  days?: number;
  limit?: number;
  used: number;
  remaining?: number;
  restricted: boolean;
}

export interface QuotaResponse {
  movie: QuotaStatus;
  tv: QuotaStatus;
}

export interface UserWatchDataResponse {
  recentlyWatched: Media[];
  playCount: number;
  source?: 'tautulli' | 'trakt';
}

export type TraktHistoryMediaType = 'all' | 'movie' | 'tv';

export interface TraktHistoryItemResponse {
  id: number;
  imdbId?: string | null;
  mediaType: 'movie' | 'tv';
  title: string;
  tmdbId?: number | null;
  traktId?: number | null;
  tvdbId?: number | null;
  watchedAt: Date;
  year?: number | null;
}

export interface TraktHistoryListResponse extends PaginatedResponse {
  results: TraktHistoryItemResponse[];
}

export interface TraktHistoryStatusResponse {
  enabled: boolean;
  lastAttemptedSyncAt?: Date | null;
  lastSuccessfulSyncAt?: Date | null;
  latestImportedWatchedAt?: Date | null;
  watchStateBootstrapped: boolean;
  watchStateLastAttemptedSyncAt?: Date | null;
  watchStateLastSuccessfulSyncAt?: Date | null;
  totalItems: number;
  traktConnected: boolean;
}

export interface TraktWatchlistStatusResponse {
  enabled: boolean;
  lastAttemptedSyncAt?: Date | null;
  lastError?: string | null;
  lastSuccessfulSyncAt?: Date | null;
  totalItems: number;
  traktConnected: boolean;
}
