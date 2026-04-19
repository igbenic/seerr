import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { TraktWatchedMedia } from '@server/entity/TraktWatchedMedia';
import { TraktWatchlist } from '@server/entity/TraktWatchlist';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import type {
  GoogleSheetsSyncStatusResponse,
  GoogleSheetsSyncTargetStatusResponse,
} from '@server/interfaces/api/googleSheetsInterfaces';
import {
  createGoogleApisForUser,
  getGoogleDriveFileUrl,
  type GoogleDriveClient,
} from '@server/lib/googleSheets';
import logger from '@server/logger';
import { Readable } from 'stream';

const WATCHLIST_CSV_NAME_SUFFIX = 'Want to Watch.csv';
const WATCHED_CSV_NAME_SUFFIX = 'Watched.csv';
const GOOGLE_DRIVE_CSV_MIME_TYPE = 'text/csv';

type GoogleSheetsTarget = 'watchlist' | 'watched';

type ManagedDriveFile = {
  fileId: string;
};

const formatDateTime = (value?: Date | null) =>
  value ? value.toISOString() : '';

const getDriveFileName = (user: User, target: GoogleSheetsTarget) =>
  `Seerr - ${user.displayName} - ${
    target === 'watchlist' ? WATCHLIST_CSV_NAME_SUFFIX : WATCHED_CSV_NAME_SUFFIX
  }`;

const ensureUserSettings = async (userId: number): Promise<UserSettings> => {
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
      user,
    })
  );
};

const getTargetStatus = ({
  enabled,
  lastAttemptedSyncAt,
  lastError,
  lastSuccessfulSyncAt,
  spreadsheetId,
}: {
  enabled: boolean;
  lastAttemptedSyncAt?: Date | null;
  lastError?: string | null;
  lastSuccessfulSyncAt?: Date | null;
  spreadsheetId?: string | null;
}): GoogleSheetsSyncTargetStatusResponse => ({
  enabled,
  lastAttemptedSyncAt: lastAttemptedSyncAt ?? null,
  lastError: lastError ?? null,
  lastSuccessfulSyncAt: lastSuccessfulSyncAt ?? null,
  spreadsheetId: spreadsheetId ?? null,
  spreadsheetUrl: spreadsheetId ? getGoogleDriveFileUrl(spreadsheetId) : null,
});

const buildStatusResponse = async (
  userId: number
): Promise<GoogleSheetsSyncStatusResponse> => {
  const user = await getRepository(User).findOne({
    relations: ['settings'],
    where: { id: userId },
    select: ['id', 'googleSheetsEmail'],
  });

  return {
    linked: !!user?.googleSheetsEmail,
    watchlist: getTargetStatus({
      enabled: !!user?.settings?.googleSheetsWatchlistSyncEnabled,
      lastAttemptedSyncAt:
        user?.settings?.googleSheetsWatchlistLastSyncAttemptAt ?? null,
      lastError: user?.settings?.googleSheetsWatchlistLastError ?? null,
      lastSuccessfulSyncAt: user?.settings?.googleSheetsWatchlistLastSyncAt,
      spreadsheetId: user?.settings?.googleSheetsWatchlistSpreadsheetId,
    }),
    watched: getTargetStatus({
      enabled: !!user?.settings?.googleSheetsWatchedSyncEnabled,
      lastAttemptedSyncAt:
        user?.settings?.googleSheetsWatchedLastSyncAttemptAt ?? null,
      lastError: user?.settings?.googleSheetsWatchedLastError ?? null,
      lastSuccessfulSyncAt: user?.settings?.googleSheetsWatchedLastSyncAt,
      spreadsheetId: user?.settings?.googleSheetsWatchedSpreadsheetId,
    }),
  };
};

export const getGoogleSheetsSyncStatus = buildStatusResponse;

const getGoogleApiStatusCode = (error: unknown): number | null => {
  if (typeof error !== 'object' || !error) {
    return null;
  }

  if ('status' in error && typeof error.status === 'number') {
    return error.status;
  }

  if (
    'response' in error &&
    typeof error.response === 'object' &&
    error.response &&
    'status' in error.response &&
    typeof error.response.status === 'number'
  ) {
    return error.response.status;
  }

  return null;
};

const createCsvBody = (csvContent: string) => Readable.from([csvContent]);

const createManagedCsvFile = async ({
  csvContent,
  drive,
  name,
}: {
  csvContent: string;
  drive: GoogleDriveClient;
  name: string;
}): Promise<string> => {
  const response = await drive.files.create({
    fields: 'id',
    media: {
      body: createCsvBody(csvContent),
      mimeType: GOOGLE_DRIVE_CSV_MIME_TYPE,
    },
    requestBody: {
      mimeType: GOOGLE_DRIVE_CSV_MIME_TYPE,
      name,
    },
  });

  if (!response.data.id) {
    throw new Error('Google Drive CSV file creation did not return an id.');
  }

  return response.data.id;
};

const getManagedDriveFile = async ({
  drive,
  fileId,
}: {
  drive: GoogleDriveClient;
  fileId: string;
}): Promise<{ fileId: string; mimeType: string | null } | null> => {
  try {
    const response = await drive.files.get({
      fields: 'id,mimeType',
      fileId,
    });

    if (!response.data.id) {
      return null;
    }

    return {
      fileId: response.data.id,
      mimeType: response.data.mimeType ?? null,
    };
  } catch (error) {
    if (getGoogleApiStatusCode(error) === 404) {
      return null;
    }

    throw error;
  }
};

const updateManagedCsvFile = async ({
  csvContent,
  drive,
  fileId,
  name,
}: {
  csvContent: string;
  drive: GoogleDriveClient;
  fileId: string;
  name: string;
}) => {
  await drive.files.update({
    fileId,
    media: {
      body: createCsvBody(csvContent),
      mimeType: GOOGLE_DRIVE_CSV_MIME_TYPE,
    },
    requestBody: {
      mimeType: GOOGLE_DRIVE_CSV_MIME_TYPE,
      name,
    },
  });
};

const ensureManagedCsvFile = async ({
  csvContent,
  drive,
  existingSpreadsheetId,
  name,
}: {
  csvContent: string;
  drive: GoogleDriveClient;
  existingSpreadsheetId?: string | null;
  name: string;
}): Promise<ManagedDriveFile> => {
  const existingFile = existingSpreadsheetId
    ? await getManagedDriveFile({
        drive,
        fileId: existingSpreadsheetId,
      })
    : null;

  if (
    existingFile?.fileId &&
    existingFile.mimeType === GOOGLE_DRIVE_CSV_MIME_TYPE
  ) {
    await updateManagedCsvFile({
      csvContent,
      drive,
      fileId: existingFile.fileId,
      name,
    });

    return {
      fileId: existingFile.fileId,
    };
  }

  const fileId = await createManagedCsvFile({
    csvContent,
    drive,
    name,
  });

  return {
    fileId,
  };
};

const serializeCsvCell = (value: number | string) => {
  const normalizedValue = String(value);

  if (!/[",\r\n]/.test(normalizedValue)) {
    return normalizedValue;
  }

  return `"${normalizedValue.replace(/"/g, '""')}"`;
};

const rowsToCsv = (rows: (number | string)[][]) =>
  rows.map((row) => row.map(serializeCsvCell).join(',')).join('\r\n') + '\r\n';

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Unknown error';

const getWatchlistRows = async (userId: number) => {
  const entries = await getRepository(TraktWatchlist).find({
    order: {
      rank: 'ASC',
      listedAt: 'DESC',
      id: 'DESC',
    },
    where: { userId },
  });

  return [
    [
      'Title',
      'Year',
      'Media Type',
      'Listed At',
      'Rank',
      'TMDB ID',
      'Trakt ID',
      'IMDb ID',
      'TVDB ID',
    ],
    ...entries.map((entry) => [
      entry.title,
      entry.year ?? '',
      entry.mediaType === MediaType.MOVIE ? 'movie' : 'tv',
      formatDateTime(entry.listedAt),
      entry.rank,
      entry.tmdbId ?? '',
      entry.traktId ?? '',
      entry.imdbId ?? '',
      entry.tvdbId ?? '',
    ]),
  ];
};

const getWatchedRows = async (userId: number) => {
  const entries = await getRepository(TraktWatchedMedia).find({
    order: {
      lastWatchedAt: 'DESC',
      id: 'DESC',
    },
    where: { userId },
  });

  return [
    [
      'Title',
      'Year',
      'Media Type',
      'Last Watched At',
      'TMDB ID',
      'Trakt ID',
      'IMDb ID',
      'TVDB ID',
    ],
    ...entries.map((entry) => [
      entry.title,
      entry.year ?? '',
      entry.mediaType === MediaType.MOVIE ? 'movie' : 'tv',
      formatDateTime(entry.lastWatchedAt),
      entry.tmdbId,
      entry.traktId ?? '',
      entry.imdbId ?? '',
      entry.tvdbId ?? '',
    ]),
  ];
};

const syncGoogleSheetsTargetForUser = async ({
  target,
  userId,
}: {
  target: GoogleSheetsTarget;
  userId: number;
}) => {
  const settings = await ensureUserSettings(userId);
  const linkedUser = await getRepository(User).findOne({
    where: { id: userId },
  });

  if (!linkedUser?.googleSheetsEmail) {
    throw new Error('Google Drive is not linked for this user.');
  }

  if (
    (target === 'watchlist' && !settings.googleSheetsWatchlistSyncEnabled) ||
    (target === 'watched' && !settings.googleSheetsWatchedSyncEnabled)
  ) {
    return buildStatusResponse(userId);
  }

  if (target === 'watchlist') {
    settings.googleSheetsWatchlistLastSyncAttemptAt = new Date();
  } else {
    settings.googleSheetsWatchedLastSyncAttemptAt = new Date();
  }
  await getRepository(UserSettings).save(settings);

  try {
    const clients = await createGoogleApisForUser(userId);

    if (!clients) {
      throw new Error('Google Drive is not linked for this user.');
    }
    const rows =
      target === 'watchlist'
        ? await getWatchlistRows(userId)
        : await getWatchedRows(userId);
    const managedFile = await ensureManagedCsvFile({
      csvContent: rowsToCsv(rows),
      drive: clients.drive,
      existingSpreadsheetId:
        target === 'watchlist'
          ? settings.googleSheetsWatchlistSpreadsheetId
          : settings.googleSheetsWatchedSpreadsheetId,
      name: getDriveFileName(linkedUser, target),
    });

    if (target === 'watchlist') {
      settings.googleSheetsWatchlistLastError = null;
      settings.googleSheetsWatchlistLastSyncAt = new Date();
      settings.googleSheetsWatchlistSpreadsheetId = managedFile.fileId;
    } else {
      settings.googleSheetsWatchedLastError = null;
      settings.googleSheetsWatchedLastSyncAt = new Date();
      settings.googleSheetsWatchedSpreadsheetId = managedFile.fileId;
    }
    await getRepository(UserSettings).save(settings);

    logger.info('Google Drive CSV sync completed', {
      label: 'Google Drive CSV',
      target,
      userId,
    });

    return buildStatusResponse(userId);
  } catch (error) {
    if (target === 'watchlist') {
      settings.googleSheetsWatchlistLastError = getErrorMessage(error);
    } else {
      settings.googleSheetsWatchedLastError = getErrorMessage(error);
    }
    await getRepository(UserSettings).save(settings);

    logger.error('Google Drive CSV sync failed', {
      errorMessage: getErrorMessage(error),
      label: 'Google Drive CSV',
      target,
      userId,
    });
    throw error;
  }
};

export const syncGoogleSheetsWatchlistForUser = async (userId: number) =>
  syncGoogleSheetsTargetForUser({ target: 'watchlist', userId });

export const syncGoogleSheetsWatchedForUser = async (userId: number) =>
  syncGoogleSheetsTargetForUser({ target: 'watched', userId });

export const syncGoogleSheetsWatchlistIfEnabled = async (userId: number) => {
  const settings = await getRepository(UserSettings).findOne({
    where: { user: { id: userId } },
  });

  if (!settings?.googleSheetsWatchlistSyncEnabled) {
    return;
  }

  await syncGoogleSheetsWatchlistForUser(userId);
};

export const syncGoogleSheetsWatchedIfEnabled = async (userId: number) => {
  const settings = await getRepository(UserSettings).findOne({
    where: { user: { id: userId } },
  });

  if (!settings?.googleSheetsWatchedSyncEnabled) {
    return;
  }

  await syncGoogleSheetsWatchedForUser(userId);
};
