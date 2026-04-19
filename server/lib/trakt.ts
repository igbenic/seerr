import TheMovieDb from '@server/api/themoviedb';
import TraktAPI, {
  TraktAuthenticationError,
  type TraktListedMovie,
  type TraktListedShow,
  type TraktMovie,
  type TraktShow,
  type TraktTokenResponse,
} from '@server/api/trakt';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { User } from '@server/entity/User';
import type { WatchlistItem } from '@server/interfaces/api/discoverInterfaces';
import type { UserWatchDataResponse } from '@server/interfaces/api/userInterfaces';
import { getSettings } from '@server/lib/settings';
import { clearLocalTraktData } from '@server/lib/traktUserData';
import logger from '@server/logger';
import {
  mapMovieDetailsToResult,
  mapMovieResult,
  mapTvDetailsToResult,
  mapTvResult,
  type MovieResult,
  type TvResult,
} from '@server/models/Search';
import { buildApplicationUrl } from '@server/utils/basePath';

const TRAKT_PAGE_SIZE = 20;

export interface TraktAuthUser extends User {
  traktAccessToken?: string | null;
  traktRefreshToken?: string | null;
  traktTokenExpiresAt?: Date | null;
}

export interface TraktStatusResponse {
  connected: boolean;
  connectedAt?: Date | null;
  enabled: boolean;
  username?: string | null;
}

type TraktWatchlistResponse = {
  page: number;
  totalPages: number;
  totalResults: number;
  results: WatchlistItem[];
};

type TraktRecommendationsResponse = {
  page: number;
  totalPages: number;
  totalResults: number;
  results: (MovieResult | TvResult)[];
};

export const isTraktConfigured = () => {
  const traktSettings = getSettings().trakt;

  return (
    traktSettings.enabled &&
    !!traktSettings.clientId &&
    !!traktSettings.clientSecret
  );
};

export const loadUserWithTraktAuth = async (
  userId: number
): Promise<TraktAuthUser | null> => {
  return getRepository(User)
    .createQueryBuilder('user')
    .addSelect([
      'user.traktAccessToken',
      'user.traktRefreshToken',
      'user.traktTokenExpiresAt',
    ])
    .where('user.id = :userId', { userId })
    .getOne();
};

export const clearTraktConnection = async (userId: number): Promise<void> => {
  await clearLocalTraktData(userId);
  await getRepository(User).update(userId, {
    traktAccessToken: null,
    traktConnectedAt: null,
    traktRefreshToken: null,
    traktTokenExpiresAt: null,
    traktUsername: null,
  });
};

export const buildTraktRedirectUri = ({
  host,
  protocol,
}: {
  host: string;
  protocol: string;
}) => {
  const baseUrl = buildApplicationUrl({
    applicationUrl: getSettings().main.applicationUrl,
    host,
    protocol,
  });

  return `${baseUrl.replace(/\/$/, '')}/api/v1/auth/trakt/callback`;
};

export const createTraktApiForUser = async (
  userId: number
): Promise<TraktAPI | null> => {
  if (!isTraktConfigured()) {
    return null;
  }

  const user = await loadUserWithTraktAuth(userId);

  if (!user?.traktAccessToken || !user.traktRefreshToken) {
    return null;
  }

  const traktSettings = getSettings().trakt;

  return new TraktAPI({
    accessToken: user.traktAccessToken,
    clientId: traktSettings.clientId,
    clientSecret: traktSettings.clientSecret,
    refreshToken: user.traktRefreshToken,
    tokenExpiresAt: user.traktTokenExpiresAt,
    onTokenRefresh: async (token) => {
      await persistTraktTokens(userId, token, user.traktUsername ?? null);
    },
  });
};

export const persistTraktTokens = async (
  userId: number,
  token: TraktTokenResponse,
  username: string | null
) => {
  const existingUser = await getRepository(User).findOne({
    where: { id: userId },
    select: ['id', 'traktConnectedAt', 'traktUsername'],
  });

  if (
    existingUser?.traktUsername &&
    username &&
    existingUser.traktUsername !== username
  ) {
    await clearLocalTraktData(userId);
  }

  await getRepository(User).update(userId, {
    traktAccessToken: token.access_token,
    traktConnectedAt: existingUser?.traktConnectedAt ?? new Date(),
    traktRefreshToken: token.refresh_token,
    traktTokenExpiresAt: new Date((token.created_at + token.expires_in) * 1000),
    traktUsername: username,
  });
};

const getRelatedMediaMap = async (
  user: User | undefined,
  items: { mediaType: MediaType; tmdbId: number }[]
) => {
  const relatedMedia = await Media.getRelatedMedia(user, items);

  return new Map(
    relatedMedia.map((media) => [`${media.mediaType}:${media.tmdbId}`, media])
  );
};

const shouldExcludeMedia = (media?: Media) => {
  if (!media) {
    return false;
  }

  return (
    media.status === MediaStatus.AVAILABLE ||
    media.status === MediaStatus.PARTIALLY_AVAILABLE ||
    media.status === MediaStatus.BLOCKLISTED ||
    media.status === MediaStatus.PENDING ||
    media.status === MediaStatus.PROCESSING
  );
};

const resolveMovieDetails = async (tmdb: TheMovieDb, item: TraktMovie) => {
  if (item.ids.tmdb) {
    return tmdb.getMovie({ movieId: item.ids.tmdb });
  }

  if (item.ids.imdb) {
    const media = await tmdb.getMediaByImdbId({ imdbId: item.ids.imdb });

    if ('title' in media) {
      return media;
    }
  }

  return null;
};

const resolveShowDetails = async (tmdb: TheMovieDb, item: TraktShow) => {
  if (item.ids.tmdb) {
    return tmdb.getTvShow({ tvId: item.ids.tmdb });
  }

  if (item.ids.tvdb) {
    return tmdb.getShowByTvdbId({ tvdbId: item.ids.tvdb });
  }

  if (item.ids.imdb) {
    const media = await tmdb.getMediaByImdbId({ imdbId: item.ids.imdb });

    if ('first_air_date' in media) {
      return media;
    }
  }

  return null;
};

const mapTraktMoviesToResults = async ({
  items,
  user,
}: {
  items: TraktMovie[];
  user?: User;
}): Promise<MovieResult[]> => {
  const tmdb = new TheMovieDb();
  const details = await Promise.all(
    items.map(async (item) => {
      try {
        return await resolveMovieDetails(tmdb, item);
      } catch (error) {
        logger.debug('Failed to resolve Trakt movie against TMDB', {
          label: 'Trakt',
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
          traktTitle: item.title,
        });

        return null;
      }
    })
  );

  const resolvedItems = details.filter(
    (
      item
    ): item is NonNullable<Awaited<ReturnType<typeof resolveMovieDetails>>> =>
      item !== null
  );
  const mediaMap = await getRelatedMediaMap(
    user,
    resolvedItems.map((item) => ({
      mediaType: MediaType.MOVIE,
      tmdbId: item.id,
    }))
  );

  return resolvedItems
    .map((item) =>
      mapMovieResult(
        mapMovieDetailsToResult(item),
        mediaMap.get(`${MediaType.MOVIE}:${item.id}`)
      )
    )
    .filter((item) => !shouldExcludeMedia(item.mediaInfo));
};

const mapTraktShowsToResults = async ({
  items,
  user,
}: {
  items: TraktShow[];
  user?: User;
}): Promise<TvResult[]> => {
  const tmdb = new TheMovieDb();
  const details = await Promise.all(
    items.map(async (item) => {
      try {
        return await resolveShowDetails(tmdb, item);
      } catch (error) {
        logger.debug('Failed to resolve Trakt show against TMDB', {
          label: 'Trakt',
          errorMessage:
            error instanceof Error ? error.message : 'Unknown error',
          traktTitle: item.title,
        });

        return null;
      }
    })
  );

  const resolvedItems = details.filter(
    (
      item
    ): item is NonNullable<Awaited<ReturnType<typeof resolveShowDetails>>> =>
      item !== null
  );
  const mediaMap = await getRelatedMediaMap(
    user,
    resolvedItems.map((item) => ({
      mediaType: MediaType.TV,
      tmdbId: item.id,
    }))
  );

  return resolvedItems
    .map((item) =>
      mapTvResult(
        mapTvDetailsToResult(item),
        mediaMap.get(`${MediaType.TV}:${item.id}`)
      )
    )
    .filter((item) => !shouldExcludeMedia(item.mediaInfo));
};

const getWatchedSets = async (traktApi: TraktAPI) => {
  const [watchedMovies, watchedShows] = await Promise.all([
    traktApi.getWatchedMovies(),
    traktApi.getWatchedShows(),
  ]);

  return {
    movieIds: new Set(
      watchedMovies
        .map((item) => item.movie.ids.tmdb)
        .filter((id): id is number => typeof id === 'number')
    ),
    playCount:
      watchedMovies.reduce((count, item) => count + item.plays, 0) +
      watchedShows.reduce((count, item) => count + item.plays, 0),
    tvIds: new Set(
      watchedShows
        .map((item) => item.show.ids.tmdb)
        .filter((id): id is number => typeof id === 'number')
    ),
  };
};

const mapTraktWatchlistItems = (
  items: (TraktListedMovie | TraktListedShow)[],
  hideWatched: boolean,
  watched: { movieIds: Set<number>; tvIds: Set<number> }
): WatchlistItem[] => {
  return items.flatMap<WatchlistItem>((item) => {
    if (item.type === 'movie') {
      const tmdbId = item.movie.ids.tmdb;

      if (!tmdbId) {
        return [];
      }

      if (hideWatched && watched.movieIds.has(tmdbId)) {
        return [];
      }

      return [
        {
          id: tmdbId,
          mediaType: MediaType.MOVIE,
          ratingKey: `trakt-movie-${item.id}`,
          title: item.movie.title,
          tmdbId,
        },
      ];
    }

    const tmdbId = item.show.ids.tmdb;

    if (!tmdbId) {
      return [];
    }

    if (hideWatched && watched.tvIds.has(tmdbId)) {
      return [];
    }

    return [
      {
        id: tmdbId,
        mediaType: MediaType.TV,
        ratingKey: `trakt-show-${item.id}`,
        title: item.show.title,
        tmdbId,
      },
    ];
  });
};

export const getTraktStatus = async (
  userId: number
): Promise<TraktStatusResponse> => {
  const user = await getRepository(User).findOne({
    where: { id: userId },
    select: ['id', 'traktUsername', 'traktConnectedAt'],
  });

  return {
    connected: !!user?.traktUsername,
    connectedAt: user?.traktConnectedAt,
    enabled: isTraktConfigured(),
    username: user?.traktUsername,
  };
};

export const getTraktWatchData = async (
  userId: number
): Promise<UserWatchDataResponse | null> => {
  const user = await getRepository(User).findOne({
    where: { id: userId },
    select: ['id', 'traktUsername'],
  });

  if (!user?.traktUsername) {
    return null;
  }

  const traktApi = await createTraktApiForUser(userId);

  if (!traktApi) {
    return null;
  }

  try {
    const [movieHistory, showHistory, watched] = await Promise.all([
      traktApi.getMovieHistory(),
      traktApi.getShowHistory(),
      getWatchedSets(traktApi),
    ]);

    const recentItems = [...movieHistory, ...showHistory]
      .sort(
        (left, right) =>
          new Date(right.watched_at).getTime() -
          new Date(left.watched_at).getTime()
      )
      .flatMap((item) => {
        if (item.type === 'movie') {
          const tmdbId = item.movie.ids.tmdb;

          if (!tmdbId) {
            return [];
          }

          return [
            {
              mediaType: MediaType.MOVIE,
              tmdbId,
              tvdbId: item.movie.ids.tvdb,
            },
          ];
        }

        const tmdbId = item.show.ids.tmdb;

        if (!tmdbId) {
          return [];
        }

        return [
          {
            mediaType: MediaType.TV,
            tmdbId,
            tvdbId: item.show.ids.tvdb,
          },
        ];
      });

    const deduped = recentItems.filter((item, index, array) => {
      return (
        array.findIndex(
          (candidate) =>
            candidate.mediaType === item.mediaType &&
            candidate.tmdbId === item.tmdbId
        ) === index
      );
    });

    const mediaMap = await getRelatedMediaMap(user, deduped);
    const recentlyWatched = deduped.slice(0, 20).map((item) => {
      return (
        mediaMap.get(`${item.mediaType}:${item.tmdbId}`) ??
        new Media({
          id: item.tmdbId,
          mediaType: item.mediaType,
          tmdbId: item.tmdbId,
          tvdbId: item.tvdbId ?? undefined,
        })
      );
    });

    return {
      playCount: watched.playCount,
      recentlyWatched,
      source: 'trakt',
    };
  } catch (error) {
    if (error instanceof TraktAuthenticationError) {
      await clearTraktConnection(userId);
      return null;
    }

    throw error;
  }
};

export const getTraktWatchlist = async ({
  page,
  user,
}: {
  page: number;
  user: User;
}): Promise<TraktWatchlistResponse> => {
  const traktApi = await createTraktApiForUser(user.id);

  if (!traktApi) {
    return {
      page: 1,
      totalPages: 1,
      totalResults: 0,
      results: [],
    };
  }

  try {
    const hideWatched = !!user.settings?.hideWatched;
    const [items, watched] = await Promise.all([
      traktApi.getWatchlist(),
      getWatchedSets(traktApi),
    ]);
    const mappedItems = mapTraktWatchlistItems(items, hideWatched, watched);
    const totalPages = Math.max(
      1,
      Math.ceil(mappedItems.length / TRAKT_PAGE_SIZE)
    );
    const start = (page - 1) * TRAKT_PAGE_SIZE;

    return {
      page,
      totalPages,
      totalResults: mappedItems.length,
      results: mappedItems.slice(start, start + TRAKT_PAGE_SIZE),
    };
  } catch (error) {
    if (error instanceof TraktAuthenticationError) {
      await clearTraktConnection(user.id);
      return {
        page: 1,
        totalPages: 1,
        totalResults: 0,
        results: [],
      };
    }

    throw error;
  }
};

export const getTraktRecommendations = async ({
  type,
  user,
}: {
  type: 'movie' | 'tv';
  user: User;
}): Promise<TraktRecommendationsResponse> => {
  const traktApi = await createTraktApiForUser(user.id);

  if (!traktApi) {
    return {
      page: 1,
      totalPages: 1,
      totalResults: 0,
      results: [],
    };
  }

  try {
    const [recommendations, watchlist, watched] = await Promise.all([
      type === 'movie'
        ? traktApi.getMovieRecommendations()
        : traktApi.getShowRecommendations(),
      traktApi.getWatchlist(),
      getWatchedSets(traktApi),
    ]);

    const watchlistIds = new Set(
      watchlist.flatMap((item) => {
        if (item.type === 'movie') {
          return item.movie.ids.tmdb ? [item.movie.ids.tmdb] : [];
        }

        return item.show.ids.tmdb ? [item.show.ids.tmdb] : [];
      })
    );

    const filteredRecommendations = recommendations.filter((item) => {
      const tmdbId = item.ids.tmdb;

      if (!tmdbId) {
        return false;
      }

      if (watchlistIds.has(tmdbId)) {
        return false;
      }

      if (type === 'movie') {
        return !watched.movieIds.has(tmdbId);
      }

      return !watched.tvIds.has(tmdbId);
    });

    const results =
      type === 'movie'
        ? await mapTraktMoviesToResults({
            items: filteredRecommendations as TraktMovie[],
            user,
          })
        : await mapTraktShowsToResults({
            items: filteredRecommendations as TraktShow[],
            user,
          });

    return {
      page: 1,
      totalPages: 1,
      totalResults: results.length,
      results: results.slice(0, TRAKT_PAGE_SIZE),
    };
  } catch (error) {
    if (error instanceof TraktAuthenticationError) {
      await clearTraktConnection(user.id);
      return {
        page: 1,
        totalPages: 1,
        totalResults: 0,
        results: [],
      };
    }

    throw error;
  }
};
