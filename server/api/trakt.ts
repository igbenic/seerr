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
    return this.authenticatedGet<(TraktListedMovie | TraktListedShow)[]>(
      '/users/me/watchlist/movie,show/rank',
      {
        params: {
          extended: 'full',
          limit,
        },
      },
      300
    );
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
