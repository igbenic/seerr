import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import type { GoogleSheetsAuthStatusResponse } from '@server/interfaces/api/googleSheetsInterfaces';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { google, type drive_v3, type sheets_v4 } from 'googleapis';

type GoogleSheetsAuthUser = User & {
  googleSheetsAccessToken?: string | null;
  googleSheetsAccountId?: string | null;
  googleSheetsRefreshToken?: string | null;
  googleSheetsTokenExpiresAt?: Date | null;
};

export const GOOGLE_SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
];

export type GoogleDriveClient = drive_v3.Drive;
export type GoogleSheetsClient = sheets_v4.Sheets;

export const isGoogleSheetsConfigured = () => {
  const googleSheetsSettings = getSettings().googleSheets;

  return (
    googleSheetsSettings.enabled &&
    !!googleSheetsSettings.clientId &&
    !!googleSheetsSettings.clientSecret
  );
};

export const buildGoogleSheetsRedirectUri = ({
  host,
  protocol,
}: {
  host: string;
  protocol: string;
}) => {
  const applicationUrl = getSettings().main.applicationUrl?.trim();
  const baseUrl = applicationUrl || `${protocol}://${host}`;

  return `${baseUrl.replace(/\/$/, '')}/api/v1/auth/google-sheets/callback`;
};

export const loadUserWithGoogleSheetsAuth = async (
  userId: number
): Promise<GoogleSheetsAuthUser | null> => {
  return getRepository(User)
    .createQueryBuilder('user')
    .addSelect([
      'user.googleSheetsAccessToken',
      'user.googleSheetsAccountId',
      'user.googleSheetsRefreshToken',
      'user.googleSheetsTokenExpiresAt',
    ])
    .where('user.id = :userId', { userId })
    .getOne();
};

export const createGoogleSheetsOAuthClient = (redirectUri?: string) => {
  const settings = getSettings().googleSheets;

  return new google.auth.OAuth2(
    settings.clientId,
    settings.clientSecret,
    redirectUri
  );
};

export const clearGoogleSheetsSyncState = async (
  userId: number
): Promise<void> => {
  const user = await getRepository(User).findOne({
    relations: ['settings'],
    where: { id: userId },
  });

  if (!user?.settings) {
    return;
  }

  user.settings.googleSheetsWatchlistLastError = null;
  user.settings.googleSheetsWatchlistLastSyncAt = null;
  user.settings.googleSheetsWatchlistLastSyncAttemptAt = null;
  user.settings.googleSheetsWatchlistSpreadsheetId = null;
  user.settings.googleSheetsWatchedLastError = null;
  user.settings.googleSheetsWatchedLastSyncAt = null;
  user.settings.googleSheetsWatchedLastSyncAttemptAt = null;
  user.settings.googleSheetsWatchedSpreadsheetId = null;
  await getRepository(UserSettings).save(user.settings);
};

export const clearGoogleSheetsConnection = async (
  userId: number
): Promise<void> => {
  await clearGoogleSheetsSyncState(userId);
  await getRepository(User).update(userId, {
    googleSheetsAccessToken: null,
    googleSheetsAccountId: null,
    googleSheetsConnectedAt: null,
    googleSheetsEmail: null,
    googleSheetsRefreshToken: null,
    googleSheetsTokenExpiresAt: null,
  });
};

export const persistGoogleSheetsTokens = async ({
  accessToken,
  accountId,
  connectedAt,
  email,
  refreshToken,
  tokenExpiresAt,
  userId,
}: {
  accessToken?: string | null;
  accountId?: string | null;
  connectedAt?: Date | null;
  email?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  userId: number;
}) => {
  const existingUser = await loadUserWithGoogleSheetsAuth(userId);
  const accountChanged =
    !!existingUser?.googleSheetsAccountId &&
    !!accountId &&
    existingUser.googleSheetsAccountId !== accountId;

  if (accountChanged) {
    await clearGoogleSheetsSyncState(userId);
  }

  await getRepository(User).update(userId, {
    googleSheetsAccessToken:
      accessToken ?? existingUser?.googleSheetsAccessToken,
    googleSheetsAccountId: accountId ?? existingUser?.googleSheetsAccountId,
    googleSheetsConnectedAt:
      connectedAt ??
      (accountChanged ? new Date() : existingUser?.googleSheetsConnectedAt) ??
      new Date(),
    googleSheetsEmail: email ?? existingUser?.googleSheetsEmail,
    googleSheetsRefreshToken:
      refreshToken ?? existingUser?.googleSheetsRefreshToken,
    googleSheetsTokenExpiresAt:
      tokenExpiresAt ?? existingUser?.googleSheetsTokenExpiresAt,
  });
};

export const getGoogleSheetsStatus = async (
  userId: number
): Promise<GoogleSheetsAuthStatusResponse> => {
  const user = await getRepository(User).findOne({
    where: { id: userId },
    select: ['id', 'googleSheetsConnectedAt', 'googleSheetsEmail'],
  });

  return {
    connected: !!user?.googleSheetsEmail,
    connectedAt: user?.googleSheetsConnectedAt ?? null,
    email: user?.googleSheetsEmail ?? null,
    enabled: isGoogleSheetsConfigured(),
  };
};

export const getGoogleDriveProfile = async (
  drive: GoogleDriveClient
): Promise<{ accountId: string | null; email: string | null }> => {
  const response = await drive.about.get({
    fields: 'user(emailAddress,permissionId)',
  });
  const googleUser = response.data.user;

  return {
    accountId: googleUser?.permissionId ?? googleUser?.emailAddress ?? null,
    email: googleUser?.emailAddress ?? null,
  };
};

export const createGoogleApisForUser = async (
  userId: number
): Promise<{
  auth: InstanceType<typeof google.auth.OAuth2>;
  drive: GoogleDriveClient;
  sheets: GoogleSheetsClient;
} | null> => {
  if (!isGoogleSheetsConfigured()) {
    return null;
  }

  const user = await loadUserWithGoogleSheetsAuth(userId);

  if (!user?.googleSheetsAccessToken || !user.googleSheetsRefreshToken) {
    return null;
  }

  const auth = createGoogleSheetsOAuthClient();
  auth.setCredentials({
    access_token: user.googleSheetsAccessToken,
    expiry_date: user.googleSheetsTokenExpiresAt?.getTime(),
    refresh_token: user.googleSheetsRefreshToken,
  });
  auth.on('tokens', (tokens) => {
    void persistGoogleSheetsTokens({
      accessToken: tokens.access_token ?? user.googleSheetsAccessToken,
      accountId: user.googleSheetsAccountId ?? null,
      email: user.googleSheetsEmail ?? null,
      refreshToken: tokens.refresh_token ?? user.googleSheetsRefreshToken,
      tokenExpiresAt: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : (user.googleSheetsTokenExpiresAt ?? null),
      userId,
    }).catch((error) => {
      logger.error('Failed to persist refreshed Google Sheets tokens', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        label: 'Google Sheets',
        userId,
      });
    });
  });

  return {
    auth,
    drive: google.drive({ version: 'v3', auth }),
    sheets: google.sheets({ version: 'v4', auth }),
  };
};

export const getGoogleSheetsSpreadsheetUrl = (spreadsheetId: string) =>
  `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
