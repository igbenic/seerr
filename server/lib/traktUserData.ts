import { getRepository } from '@server/datasource';
import { TraktHistory } from '@server/entity/TraktHistory';
import { TraktWatchedEpisode } from '@server/entity/TraktWatchedEpisode';
import { TraktWatchedMedia } from '@server/entity/TraktWatchedMedia';
import { TraktWatchedShowSummary } from '@server/entity/TraktWatchedShowSummary';
import { TraktWatchlist } from '@server/entity/TraktWatchlist';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import { getSettings } from '@server/lib/settings';

export const ensureTraktUserSettings = async (
  userId: number
): Promise<UserSettings> => {
  const settingsRepository = getRepository(UserSettings);
  const existing = await settingsRepository.findOne({
    where: { user: { id: userId } },
  });

  if (existing) {
    return existing;
  }

  const user = await getRepository(User).findOneOrFail({
    where: { id: userId },
  });

  return settingsRepository.save(
    new UserSettings({
      traktHistorySyncEnabled: !!user.traktUsername,
      user,
    })
  );
};

export const clearLocalTraktData = async (userId: number): Promise<void> => {
  await Promise.all([
    getRepository(TraktHistory).delete({ userId }),
    getRepository(TraktWatchlist).delete({ userId }),
    getRepository(TraktWatchedMedia).delete({ userId }),
    getRepository(TraktWatchedEpisode).delete({ userId }),
    getRepository(TraktWatchedShowSummary).delete({ userId }),
  ]);

  const settings = await getRepository(UserSettings).findOne({
    relations: ['user'],
    where: { user: { id: userId } },
  });

  if (!settings) {
    return;
  }

  settings.traktHistoryLastSyncAt = null;
  settings.traktHistoryLastSyncAttemptAt = null;
  settings.traktHistoryLatestWatchedAt = null;
  settings.traktWatchStateLastSyncAt = null;
  settings.traktWatchStateLastSyncAttemptAt = null;
  settings.traktWatchStateBootstrappedAt = null;
  settings.traktWatchStateLastActivityAt = null;
  settings.traktWatchlistLastSyncAt = null;
  settings.traktWatchlistLastSyncAttemptAt = null;
  settings.traktWatchlistLastError = null;

  await getRepository(UserSettings).save(settings);
};

const getStaleThresholdMs = (schedule: string) => {
  switch (schedule) {
    case '0 0 * * * *':
      return 60 * 60 * 1000;
    case '0 0 */6 * * *':
      return 6 * 60 * 60 * 1000;
    case '0 0 */12 * * *':
      return 12 * 60 * 60 * 1000;
    default:
      return 60 * 60 * 1000;
  }
};

export const getTraktHistoryStaleThresholdMs = () =>
  getStaleThresholdMs(getSettings().jobs['trakt-history-sync'].schedule);

export const shouldRefreshTraktData = (
  lastSyncAt: Date | null | undefined,
  thresholdMs: number
) => {
  if (!lastSyncAt) {
    return true;
  }

  return Date.now() - new Date(lastSyncAt).getTime() >= thresholdMs;
};
