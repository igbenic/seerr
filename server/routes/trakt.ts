import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { getTraktRecommendations } from '@server/lib/trakt';
import {
  getTraktHistoryStatus,
  listTraktHistory,
} from '@server/lib/traktHistory';
import { ensureFreshTraktWatchState } from '@server/lib/traktWatched';
import {
  getTraktWatchlist,
  getTraktWatchlistStatus,
} from '@server/lib/traktWatchlist';
import logger from '@server/logger';
import { Router } from 'express';

const traktRoutes = Router();

const boundedNumber = (
  value: unknown,
  { defaultValue, max, min }: { defaultValue: number; max: number; min: number }
) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

traktRoutes.get('/context', async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next({ status: 401, message: 'Authentication required.' });
    }

    const historyTake = boundedNumber(req.query.historyTake, {
      defaultValue: 50,
      max: 200,
      min: 1,
    });
    const recommendationTake = boundedNumber(req.query.recommendationTake, {
      defaultValue: 20,
      max: 60,
      min: 1,
    });
    const watchlistPage = boundedNumber(req.query.watchlistPage, {
      defaultValue: 1,
      max: 100,
      min: 1,
    });

    const user = await getRepository(User).findOneOrFail({
      relations: ['settings'],
      where: { id: userId },
    });

    await ensureFreshTraktWatchState(user.id);

    const [
      historyStatus,
      watchlistStatus,
      recentHistory,
      watchlist,
      movieRecommendations,
      tvRecommendations,
    ] = await Promise.all([
      getTraktHistoryStatus(user.id),
      getTraktWatchlistStatus(user.id),
      listTraktHistory({
        mediaType: 'all',
        skip: 0,
        take: historyTake,
        userId: user.id,
      }),
      getTraktWatchlist({
        page: watchlistPage,
        user,
      }),
      getTraktRecommendations({
        type: 'movie',
        user,
      }),
      getTraktRecommendations({
        type: 'tv',
        user,
      }),
    ]);

    return res.status(200).json({
      history: {
        ...recentHistory,
        status: historyStatus,
      },
      recommendations: {
        movies: {
          ...movieRecommendations,
          results: movieRecommendations.results.slice(0, recommendationTake),
          totalResults: Math.min(
            movieRecommendations.totalResults,
            recommendationTake
          ),
        },
        tv: {
          ...tvRecommendations,
          results: tvRecommendations.results.slice(0, recommendationTake),
          totalResults: Math.min(
            tvRecommendations.totalResults,
            recommendationTake
          ),
        },
      },
      user: {
        id: user.id,
        displayName: user.displayName,
        traktConnected: !!user.traktUsername,
        traktUsername: user.traktUsername,
      },
      watchlist: {
        ...watchlist,
        status: watchlistStatus,
      },
    });
  } catch (error) {
    logger.debug('Something went wrong retrieving Trakt context', {
      label: 'API',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user?.id,
    });

    return next({
      status: 500,
      message: 'Unable to retrieve Trakt context.',
    });
  }
});

export default traktRoutes;
