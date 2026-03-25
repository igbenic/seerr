import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';
import { requestInterceptorFunction } from '@server/utils/customProxyAgent';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import axios from 'axios';

export interface TraktTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  created_at: number;
}

interface TraktSyncWatchlistPayload {
  movies?: { ids: Pick<TraktIds, 'imdb'> }[];
  shows?: { ids: Pick<TraktIds, 'imdb'> }[];
}

interface TraktEpisode {
  ids: TraktIds;
  number: number;
  season: number;
  title?: string | null;
}

interface TraktSyncHistoryPayload {
  movies?: {
    ids: Partial<Pick<TraktIds, 'imdb' | 'tmdb' | 'trakt'>>;
    watched_at?: string;
  }[];
  shows?: {
    ids: Partial<Pick<TraktIds, 'imdb' | 'tmdb' | 'trakt' | 'tvdb'>>;
    seasons: {
      number: number;
      episodes: {
        number: number;
        watched_at?: string;
      }[];
    }[];
  }[];
}

interface TraktSyncHistoryResultGroup {
  episodes?: number;
  movies?: number;
  shows?: number;
}

interface TraktSyncHistoryResponseBody {
  added?: TraktSyncHistoryResultGroup;
  deleted?: TraktSyncHistoryResultGroup;
}

interface TraktSyncWatchlistResultGroup {
  episodes?: number;
  movies?: number;
  people?: number;
  shows?: number;
}

interface TraktSyncWatchlistNotFound {
  movies?: { ids: Pick<TraktIds, 'imdb'> }[];
  shows?: { ids: Pick<TraktIds, 'imdb'> }[];
}

interface TraktSyncWatchlistResponseBody {
  added?: TraktSyncWatchlistResultGroup;
  existing?: TraktSyncWatchlistResultGroup;
  not_found?: TraktSyncWatchlistNotFound;
}

interface TraktUserSettingsResponse {
  user: {
    username: string;
    ids: {
      slug: string;
      trakt?: number | null;
      uuid: string;
    };
  };
}

interface TraktIds {
  trakt: number;
  slug?: string;
  imdb?: string | null;
  tmdb?: number | null;
  tvdb?: number | null;
}

export interface TraktMovie {
  title: string;
  year?: number | null;
  ids: TraktIds;
  overview?: string | null;
  released?: string | null;
  rating?: number | null;
  votes?: number | null;
}

export interface TraktShow {
  title: string;
  year?: number | null;
  ids: TraktIds;
  overview?: string | null;
  first_aired?: string | null;
  rating?: number | null;
  votes?: number | null;
}

export interface TraktListedMovie {
  rank: number;
  id: number;
  listed_at: string;
  type: 'movie';
  movie: TraktMovie;
}

export interface TraktListedShow {
  rank: number;
  id: number;
  listed_at: string;
  type: 'show';
  show: TraktShow;
}

export interface TraktMovieHistoryItem {
  id: number;
  watched_at: string;
  action: string;
  type: 'movie';
  movie: TraktMovie;
}

export interface TraktEpisodeHistoryItem {
  id: number;
  watched_at: string;
  action: string;
  type: 'episode';
  show: TraktShow;
  episode: TraktEpisode;
}

export interface TraktHistoryPage<T> {
  items: T[];
  itemCount: number;
  page: number;
  pageCount: number;
}

export interface TraktWatchlistPage<T> {
  items: T[];
  itemCount: number;
  page: number;
  pageCount: number;
}

export interface TraktWatchedMovie {
  plays: number;
  last_watched_at: string;
  last_updated_at: string;
  movie: TraktMovie;
}

export interface TraktWatchedShow {
  plays: number;
  last_watched_at: string;
  last_updated_at: string;
  show: TraktShow;
}

export interface TraktRatedMovie {
  rated_at: string;
  rating: number;
  type: 'movie';
  movie: TraktMovie | null;
}

export interface TraktRatedShow {
  rated_at: string;
  rating: number;
  type: 'show';
  show: TraktShow | null;
}

export interface TraktWatchlistSyncItem {
  ids: Pick<TraktIds, 'imdb'>;
  type: 'movie' | 'show';
}

export interface TraktWatchlistSyncNotFoundItem {
  ids: Pick<TraktIds, 'imdb'>;
  type: 'movie' | 'show';
}

export interface TraktWatchlistSyncResponse {
  added: number;
  existing: number;
  notFound: TraktWatchlistSyncNotFoundItem[];
}

export interface TraktHistorySyncResponse {
  affected: number;
}

export class TraktAuthenticationError extends Error {
  constructor(message = 'Trakt authentication failed') {
    super(message);
    this.name = 'TraktAuthenticationError';
  }
}

type TraktAPIOptions = {
  accessToken?: string | null;
  clientId: string;
  clientSecret?: string;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  onTokenRefresh?: (token: TraktTokenResponse) => Promise<void>;
};

class TraktAPI {
  private axios: AxiosInstance;
  private accessToken?: string | null;
  private clientId: string;
  private clientSecret?: string;
  private onTokenRefresh?: (token: TraktTokenResponse) => Promise<void>;
  private refreshToken?: string | null;
  private tokenExpiresAt?: Date | null;

  constructor({
    accessToken,
    clientId,
    clientSecret,
    refreshToken,
    tokenExpiresAt,
    onTokenRefresh,
  }: TraktAPIOptions) {
    this.accessToken = accessToken;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
    this.tokenExpiresAt = tokenExpiresAt;
    this.onTokenRefresh = onTokenRefresh;

    this.axios = axios.create({
      baseURL: 'https://api.trakt.tv',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'trakt-api-key': clientId,
        'trakt-api-version': '2',
      },
      timeout: getSettings().network.apiRequestTimeout,
    });
    this.axios.interceptors.request.use(requestInterceptorFunction);
  }

  public static buildAuthorizationUrl({
    clientId,
    redirectUri,
    state,
  }: {
    clientId: string;
    redirectUri: string;
    state: string;
  }): string {
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
    });

    return `https://trakt.tv/oauth/authorize?${query.toString()}`;
  }

  public static async exchangeCode({
    clientId,
    clientSecret,
    code,
    redirectUri,
  }: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
  }): Promise<TraktTokenResponse> {
    const client = axios.create({
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'trakt-api-key': clientId,
        'trakt-api-version': '2',
      },
      timeout: getSettings().network.apiRequestTimeout,
    });
    client.interceptors.request.use(requestInterceptorFunction);

    const response = await client.post<TraktTokenResponse>(
      'https://api.trakt.tv/oauth/token',
      {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }
    );

    return response.data;
  }

  public async getCurrentUserSettings(): Promise<TraktUserSettingsResponse> {
    return this.authenticatedGet<TraktUserSettingsResponse>(
      '/users/settings',
      {
        params: {
          extended: 'full',
        },
      },
      300
    );
  }

  public async getMovieRecommendations(limit = 60): Promise<TraktMovie[]> {
    return this.authenticatedGet<TraktMovie[]>(
      '/recommendations/movies',
      {
        params: {
          extended: 'full',
          ignore_collected: true,
          ignore_watchlisted: true,
          limit,
        },
      },
      300
    );
  }

  public async getShowRecommendations(limit = 60): Promise<TraktShow[]> {
    return this.authenticatedGet<TraktShow[]>(
      '/recommendations/shows',
      {
        params: {
          extended: 'full',
          ignore_collected: true,
          ignore_watchlisted: true,
          limit,
        },
      },
      300
    );
  }

  public async getWatchlist(
    limit = 100
  ): Promise<(TraktListedMovie | TraktListedShow)[]> {
    const items: (TraktListedMovie | TraktListedShow)[] = [];
    let page = 1;
    let pageCount = 1;

    do {
      const response = await this.getWatchlistPage(page, limit);
      items.push(...response.items);
      pageCount = response.pageCount;
      page += 1;
    } while (page <= pageCount);

    return items;
  }

  public async getWatchlistPage(
    page = 1,
    limit = 100
  ): Promise<TraktWatchlistPage<TraktListedMovie | TraktListedShow>> {
    const response = await this.authenticatedGetWithResponse<
      (TraktListedMovie | TraktListedShow)[]
    >('/users/me/watchlist/movie,show/rank', {
      params: {
        extended: 'full',
        limit,
        page,
      },
    });

    return {
      itemCount: Number(response.headers['x-pagination-item-count'] ?? 0),
      items: response.data,
      page,
      pageCount: Number(response.headers['x-pagination-page-count'] ?? 1),
    };
  }

  public async addToWatchlist(
    items: TraktWatchlistSyncItem[]
  ): Promise<TraktWatchlistSyncResponse> {
    const payload: TraktSyncWatchlistPayload = {
      movies: items
        .filter((item) => item.type === 'movie')
        .map((item) => ({ ids: item.ids })),
      shows: items
        .filter((item) => item.type === 'show')
        .map((item) => ({ ids: item.ids })),
    };

    const response = await this.authenticatedPost<
      TraktSyncWatchlistResponseBody,
      TraktSyncWatchlistPayload
    >('/sync/watchlist', payload);

    return {
      added: (response.added?.movies ?? 0) + (response.added?.shows ?? 0),
      existing:
        (response.existing?.movies ?? 0) + (response.existing?.shows ?? 0),
      notFound: [
        ...(response.not_found?.movies ?? []).map((item) => ({
          ids: item.ids,
          type: 'movie' as const,
        })),
        ...(response.not_found?.shows ?? []).map((item) => ({
          ids: item.ids,
          type: 'show' as const,
        })),
      ],
    };
  }

  public async getMovieHistory(limit = 50): Promise<TraktMovieHistoryItem[]> {
    return this.authenticatedGet<TraktMovieHistoryItem[]>(
      '/users/me/history/movies',
      {
        params: {
          extended: 'full',
          limit,
        },
      },
      120
    );
  }

  public async getShowHistory(limit = 50): Promise<TraktEpisodeHistoryItem[]> {
    return this.authenticatedGet<TraktEpisodeHistoryItem[]>(
      '/users/me/history/shows',
      {
        params: {
          extended: 'full',
          limit,
        },
      },
      120
    );
  }

  public async getMovieHistoryPage(
    page = 1,
    limit = 100
  ): Promise<TraktHistoryPage<TraktMovieHistoryItem>> {
    return this.getHistoryPage<TraktMovieHistoryItem>(
      '/users/me/history/movies',
      page,
      limit
    );
  }

  public async getShowHistoryPage(
    page = 1,
    limit = 100
  ): Promise<TraktHistoryPage<TraktEpisodeHistoryItem>> {
    return this.getHistoryPage<TraktEpisodeHistoryItem>(
      '/users/me/history/shows',
      page,
      limit
    );
  }

  public async getWatchedMovies(): Promise<TraktWatchedMovie[]> {
    return this.authenticatedGet<TraktWatchedMovie[]>(
      '/users/me/watched/movies',
      undefined,
      300
    );
  }

  public async getWatchedShows(): Promise<TraktWatchedShow[]> {
    return this.authenticatedGet<TraktWatchedShow[]>(
      '/users/me/watched/shows',
      {
        params: {
          extended: 'noseasons',
        },
      },
      300
    );
  }

  public async getMovieRatings(): Promise<TraktRatedMovie[]> {
    return this.authenticatedGet<TraktRatedMovie[]>(
      '/users/me/ratings/movies',
      {
        params: {
          extended: 'full',
        },
      },
      300
    );
  }

  public async getShowRatings(): Promise<TraktRatedShow[]> {
    return this.authenticatedGet<TraktRatedShow[]>(
      '/users/me/ratings/shows',
      {
        params: {
          extended: 'full',
        },
      },
      300
    );
  }

  public async addToHistory(
    payload: TraktSyncHistoryPayload
  ): Promise<TraktHistorySyncResponse> {
    const response = await this.authenticatedPost<
      TraktSyncHistoryResponseBody,
      TraktSyncHistoryPayload
    >('/sync/history', payload);

    return {
      affected: (response.added?.movies ?? 0) + (response.added?.episodes ?? 0),
    };
  }

  public async removeFromHistory(
    payload: TraktSyncHistoryPayload
  ): Promise<TraktHistorySyncResponse> {
    const response = await this.authenticatedPost<
      TraktSyncHistoryResponseBody,
      TraktSyncHistoryPayload
    >('/sync/history/remove', payload);

    return {
      affected:
        (response.deleted?.movies ?? 0) + (response.deleted?.episodes ?? 0),
    };
  }

  private applyToken(token: TraktTokenResponse) {
    this.accessToken = token.access_token;
    this.refreshToken = token.refresh_token;
    this.tokenExpiresAt = new Date(
      (token.created_at + token.expires_in) * 1000
    );
  }

  private authHeaders() {
    return this.accessToken
      ? {
          Authorization: `Bearer ${this.accessToken}`,
        }
      : undefined;
  }

  private async authenticatedGet<T>(
    endpoint: string,
    config?: AxiosRequestConfig,
    ttl = 300
  ): Promise<T> {
    await this.ensureAccessToken();

    try {
      const response = await this.axios.get<T>(endpoint, {
        ...config,
        headers: {
          ...config?.headers,
          ...this.authHeaders(),
        },
      });

      if (ttl !== 0) {
        const cache = cacheManager.getCache('trakt').data;
        const cacheKey = this.cacheKey(endpoint, config);
        cache.set(cacheKey, response.data, ttl);
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        await this.refreshAccessToken(true);

        const response = await this.axios.get<T>(endpoint, {
          ...config,
          headers: {
            ...config?.headers,
            ...this.authHeaders(),
          },
        });

        if (ttl !== 0) {
          const cache = cacheManager.getCache('trakt').data;
          const cacheKey = this.cacheKey(endpoint, config);
          cache.set(cacheKey, response.data, ttl);
        }

        return response.data;
      }

      throw error;
    }
  }

  private async authenticatedPost<TResponse, TBody>(
    endpoint: string,
    body: TBody,
    config?: AxiosRequestConfig
  ): Promise<TResponse> {
    await this.ensureAccessToken();

    try {
      const response = await this.axios.post<TResponse>(endpoint, body, {
        ...config,
        headers: {
          ...config?.headers,
          ...this.authHeaders(),
        },
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        await this.refreshAccessToken(true);

        const response = await this.axios.post<TResponse>(endpoint, body, {
          ...config,
          headers: {
            ...config?.headers,
            ...this.authHeaders(),
          },
        });

        return response.data;
      }

      throw error;
    }
  }

  private async getHistoryPage<T>(
    endpoint: string,
    page: number,
    limit: number
  ): Promise<TraktHistoryPage<T>> {
    const response = await this.authenticatedGetWithResponse<T[]>(endpoint, {
      params: {
        extended: 'full',
        limit,
        page,
      },
    });

    return {
      itemCount: Number(response.headers['x-pagination-item-count'] ?? 0),
      items: response.data,
      page,
      pageCount: Number(response.headers['x-pagination-page-count'] ?? 1),
    };
  }

  private async authenticatedGetWithResponse<T>(
    endpoint: string,
    config?: AxiosRequestConfig
  ) {
    await this.ensureAccessToken();

    try {
      return await this.axios.get<T>(endpoint, {
        ...config,
        headers: {
          ...config?.headers,
          ...this.authHeaders(),
        },
      });
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        await this.refreshAccessToken(true);

        return this.axios.get<T>(endpoint, {
          ...config,
          headers: {
            ...config?.headers,
            ...this.authHeaders(),
          },
        });
      }

      throw error;
    }
  }

  private cacheKey(endpoint: string, config?: AxiosRequestConfig) {
    return JSON.stringify({
      endpoint,
      params: config?.params,
      user: this.accessToken?.slice(0, 12),
    });
  }

  private async ensureAccessToken(): Promise<void> {
    const cache = cacheManager.getCache('trakt').data;
    const cacheKey = this.cacheKey('token-validity');
    const cachedValidity = cache.get<boolean>(cacheKey);

    if (cachedValidity) {
      return;
    }

    if (
      !this.accessToken ||
      !this.tokenExpiresAt ||
      this.tokenExpiresAt.getTime() <= Date.now() + 60_000
    ) {
      await this.refreshAccessToken();
    }

    cache.set(cacheKey, true, 30);
  }

  private async refreshAccessToken(force = false): Promise<void> {
    if (
      !this.refreshToken ||
      !this.clientSecret ||
      (!force &&
        this.tokenExpiresAt &&
        this.tokenExpiresAt.getTime() > Date.now() + 60_000)
    ) {
      return;
    }

    try {
      const response = await this.axios.post<TraktTokenResponse>(
        '/oauth/token',
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
        }
      );

      this.applyToken(response.data);

      if (this.onTokenRefresh) {
        await this.onTokenRefresh(response.data);
      }
    } catch (error) {
      throw new TraktAuthenticationError(
        axios.isAxiosError(error)
          ? error.response?.data?.error_description || error.message
          : 'Unable to refresh Trakt access token'
      );
    }
  }
}

export default TraktAPI;
