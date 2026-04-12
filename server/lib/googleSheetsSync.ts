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
  getGoogleSheetsSpreadsheetUrl,
  type GoogleDriveClient,
  type GoogleSheetsClient,
} from '@server/lib/googleSheets';
import logger from '@server/logger';

const WATCHLIST_SPREADSHEET_NAME_SUFFIX = 'Want to Watch';
const WATCHED_SPREADSHEET_NAME_SUFFIX = 'Watched';
const WATCHLIST_SHEET_TITLE = 'Want to Watch';
const WATCHED_SHEET_TITLE = 'Watched';

type GoogleSheetsTarget = 'watchlist' | 'watched';

type ManagedSpreadsheet = {
  sheetTitle: string;
  spreadsheetId: string;
};

const formatDateTime = (value?: Date | null) =>
  value ? value.toISOString() : '';

const quoteSheetTitle = (sheetTitle: string) =>
  `'${sheetTitle.replace(/'/g, "''")}'`;

const getSpreadsheetName = (user: User, target: GoogleSheetsTarget) =>
  `Seerr - ${user.displayName} - ${
    target === 'watchlist'
      ? WATCHLIST_SPREADSHEET_NAME_SUFFIX
      : WATCHED_SPREADSHEET_NAME_SUFFIX
  }`;

const getExpectedSheetTitle = (target: GoogleSheetsTarget) =>
  target === 'watchlist' ? WATCHLIST_SHEET_TITLE : WATCHED_SHEET_TITLE;

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
  spreadsheetUrl: spreadsheetId
    ? getGoogleSheetsSpreadsheetUrl(spreadsheetId)
    : null,
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

const createManagedSpreadsheet = async ({
  drive,
  name,
}: {
  drive: GoogleDriveClient;
  name: string;
}): Promise<string> => {
  const response = await drive.files.create({
    fields: 'id',
    requestBody: {
      mimeType: 'application/vnd.google-apps.spreadsheet',
      name,
    },
  });

  if (!response.data.id) {
    throw new Error('Google Sheets spreadsheet creation did not return an id.');
  }

  return response.data.id;
};

const ensureSpreadsheet = async ({
  drive,
  existingSpreadsheetId,
  name,
  target,
}: {
  drive: GoogleDriveClient;
  existingSpreadsheetId?: string | null;
  name: string;
  target: GoogleSheetsTarget;
}): Promise<ManagedSpreadsheet> => {
  const sheetTitle = getExpectedSheetTitle(target);

  if (existingSpreadsheetId) {
    return {
      sheetTitle,
      spreadsheetId: existingSpreadsheetId,
    };
  }

  const spreadsheetId = await createManagedSpreadsheet({
    drive,
    name,
  });

  return {
    sheetTitle,
    spreadsheetId,
  };
};

const ensureSheetTitle = async ({
  sheetTitle,
  sheets,
  spreadsheetId,
}: {
  sheetTitle: string;
  sheets: GoogleSheetsClient;
  spreadsheetId: string;
}) => {
  const response = await sheets.spreadsheets.get({
    fields: 'sheets.properties(sheetId,title)',
    spreadsheetId,
  });
  const matchingSheet = response.data.sheets?.find(
    (sheet) => sheet.properties?.title === sheetTitle
  );

  if (matchingSheet) {
    return {
      sheetId: matchingSheet.properties?.sheetId ?? 0,
      sheetTitle,
    };
  }

  const firstSheet = response.data.sheets?.[0];

  if (firstSheet?.properties?.sheetId == null) {
    throw new Error(
      'Google Sheets spreadsheet does not contain a writable tab.'
    );
  }

  if (firstSheet.properties.title !== sheetTitle) {
    await sheets.spreadsheets.batchUpdate({
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              fields: 'title',
              properties: {
                sheetId: firstSheet.properties.sheetId,
                title: sheetTitle,
              },
            },
          },
        ],
      },
      spreadsheetId,
    });
  }

  return {
    sheetId: firstSheet.properties.sheetId,
    sheetTitle,
  };
};

const writeSpreadsheetRows = async ({
  rows,
  spreadsheetId,
  target,
  sheets,
}: {
  rows: (number | string)[][];
  spreadsheetId: string;
  target: GoogleSheetsTarget;
  sheets: GoogleSheetsClient;
}) => {
  const { sheetId, sheetTitle } = await ensureSheetTitle({
    sheetTitle: getExpectedSheetTitle(target),
    sheets,
    spreadsheetId,
  });
  const rangePrefix = quoteSheetTitle(sheetTitle);

  await sheets.spreadsheets.values.clear({
    range: `${rangePrefix}!A:Z`,
    spreadsheetId,
  });
  await sheets.spreadsheets.values.update({
    range: `${rangePrefix}!A1`,
    requestBody: {
      values: rows,
    },
    spreadsheetId,
    valueInputOption: 'RAW',
  });
  await sheets.spreadsheets.batchUpdate({
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            fields: 'gridProperties.frozenRowCount',
            properties: {
              gridProperties: {
                frozenRowCount: 1,
              },
              sheetId,
            },
          },
        },
      ],
    },
    spreadsheetId,
  });
};

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
    throw new Error('Google Sheets is not linked for this user.');
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
      throw new Error('Google Sheets is not linked for this user.');
    }

    const managedSpreadsheet = await ensureSpreadsheet({
      drive: clients.drive,
      existingSpreadsheetId:
        target === 'watchlist'
          ? settings.googleSheetsWatchlistSpreadsheetId
          : settings.googleSheetsWatchedSpreadsheetId,
      name: getSpreadsheetName(linkedUser, target),
      target,
    });
    const rows =
      target === 'watchlist'
        ? await getWatchlistRows(userId)
        : await getWatchedRows(userId);

    await writeSpreadsheetRows({
      rows,
      sheets: clients.sheets,
      spreadsheetId: managedSpreadsheet.spreadsheetId,
      target,
    });

    if (target === 'watchlist') {
      settings.googleSheetsWatchlistLastError = null;
      settings.googleSheetsWatchlistLastSyncAt = new Date();
      settings.googleSheetsWatchlistSpreadsheetId =
        managedSpreadsheet.spreadsheetId;
    } else {
      settings.googleSheetsWatchedLastError = null;
      settings.googleSheetsWatchedLastSyncAt = new Date();
      settings.googleSheetsWatchedSpreadsheetId =
        managedSpreadsheet.spreadsheetId;
    }
    await getRepository(UserSettings).save(settings);

    logger.info('Google Sheets sync completed', {
      label: 'Google Sheets',
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

    logger.error('Google Sheets sync failed', {
      errorMessage: getErrorMessage(error),
      label: 'Google Sheets',
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
