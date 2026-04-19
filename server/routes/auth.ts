import JellyfinAPI from '@server/api/jellyfin';
import PlexTvAPI from '@server/api/plextv';
import TraktAPI from '@server/api/trakt';
import { ApiErrorCode } from '@server/constants/error';
import { MediaServerType, ServerType } from '@server/constants/server';
import { UserType } from '@server/constants/user';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import { startJobs } from '@server/job/schedule';
import {
  GOOGLE_SHEETS_SCOPES,
  buildGoogleSheetsRedirectUri,
  clearGoogleSheetsConnection,
  createGoogleSheetsOAuthClient,
  getGoogleDriveProfile,
  getGoogleSheetsStatus,
  isGoogleSheetsConfigured,
  persistGoogleSheetsTokens,
} from '@server/lib/googleSheets';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import {
  buildTraktRedirectUri,
  clearTraktConnection,
  getTraktStatus,
  isTraktConfigured,
  persistTraktTokens,
} from '@server/lib/trakt';
import { syncTraktHistoryForUser } from '@server/lib/traktHistory';
import { ensureTraktUserSettings } from '@server/lib/traktUserData';
import { syncTraktWatchStateForUser } from '@server/lib/traktWatched';
import logger from '@server/logger';
import { isAuthenticated } from '@server/middleware/auth';
import { checkAvatarChanged } from '@server/routes/avatarproxy';
import { ApiError } from '@server/types/error';
import { getAppVersion } from '@server/utils/appVersion';
import { toInternalAppPath, withBasePath } from '@server/utils/basePath';
import { getHostname } from '@server/utils/getHostname';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { Router } from 'express';
import { google } from 'googleapis';
import net from 'net';
import validator from 'validator';

const authRoutes = Router();
const DEFAULT_TRAKT_REDIRECT = '/profile/settings/linked-accounts';

const getSafeAuthRedirectPath = (redirect?: string | string[]): string => {
  if (typeof redirect !== 'string' || !redirect) {
    return DEFAULT_TRAKT_REDIRECT;
  }

  return toInternalAppPath(redirect, {
    fallback: DEFAULT_TRAKT_REDIRECT,
  });
};

const clearTraktOauthSession = (req: {
  session?: {
    traktOAuthRedirect?: string;
    traktOAuthState?: string;
  };
}) => {
  if (!req.session) {
    return;
  }

  delete req.session.traktOAuthRedirect;
  delete req.session.traktOAuthState;
};

const clearGoogleSheetsOauthSession = (req: {
  session?: {
    destroy?: (callback: (err?: unknown) => void) => void;
  };
}) => {
  const session = req.session as
    | ({
        googleSheetsOAuthRedirect?: string;
        googleSheetsOAuthState?: string;
      } & typeof req.session)
    | undefined;

  if (!session) {
    return;
  }

  delete session.googleSheetsOAuthRedirect;
  delete session.googleSheetsOAuthState;
};

const buildAuthResultRedirect = ({
  param,
  redirectPath,
  status,
}: {
  param: string;
  redirectPath: string;
  status: string;
}) => {
  const parsed = new URL(redirectPath, 'http://localhost');

  parsed.searchParams.set(param, status);

  return withBasePath(`${parsed.pathname}${parsed.search}${parsed.hash}`);
};

authRoutes.get('/me', isAuthenticated(), async (req, res) => {
  const userRepository = getRepository(User);
  if (!req.user) {
    return res.status(500).json({
      status: 500,
      error: 'Please sign in.',
    });
  }
  const user = await userRepository.findOneOrFail({
    where: { id: req.user.id },
  });

  // check if email is required in settings and if user has an valid email
  const settings = await getSettings();
  if (
    settings.notifications.agents.email.options.userEmailRequired &&
    !validator.isEmail(user.email, { require_tld: false })
  ) {
    user.warnings.push('userEmailRequired');
    logger.warn(`User ${user.username} has no valid email address`);
  }

  return res.status(200).json(user.filter());
});

authRoutes.get('/trakt/status', isAuthenticated(), async (req, res, next) => {
  if (!req.user) {
    return next({ status: 500, message: 'Please sign in.' });
  }

  try {
    return res.status(200).json(await getTraktStatus(req.user.id));
  } catch (error) {
    return next({
      status: 500,
      message:
        error instanceof Error ? error.message : 'Unable to load Trakt status.',
    });
  }
});

authRoutes.get('/trakt/connect', isAuthenticated(), (req, res, next) => {
  if (!req.user) {
    return next({ status: 500, message: 'Please sign in.' });
  }

  if (!req.session) {
    return next({ status: 500, message: 'Session unavailable.' });
  }

  if (!isTraktConfigured()) {
    return next({ status: 404, message: 'Trakt is not configured.' });
  }

  const host = req.get('host');

  if (!host) {
    return next({ status: 500, message: 'Unable to determine request host.' });
  }

  const traktSettings = getSettings().trakt;
  const redirectPath = getSafeAuthRedirectPath(
    req.query.redirect as string | string[] | undefined
  );
  const state = randomUUID();
  const redirectUri = buildTraktRedirectUri({
    host,
    protocol: req.protocol,
  });

  req.session.traktOAuthRedirect = redirectPath;
  req.session.traktOAuthState = state;

  return res.redirect(
    TraktAPI.buildAuthorizationUrl({
      clientId: traktSettings.clientId,
      redirectUri,
      state,
    })
  );
});

authRoutes.get('/trakt/callback', async (req, res) => {
  const redirectPath = getSafeAuthRedirectPath(
    req.session?.traktOAuthRedirect ?? DEFAULT_TRAKT_REDIRECT
  );
  const redirectTo = (status: string) =>
    res.redirect(
      buildAuthResultRedirect({
        param: 'trakt',
        redirectPath,
        status,
      })
    );

  if (!req.user || !req.session?.traktOAuthState) {
    clearTraktOauthSession(req);

    return redirectTo('error');
  }

  if (!isTraktConfigured()) {
    clearTraktOauthSession(req);

    return redirectTo('not-configured');
  }

  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const state =
    typeof req.query.state === 'string' ? req.query.state : undefined;
  const host = req.get('host');

  if (!code || !host) {
    clearTraktOauthSession(req);

    return redirectTo('error');
  }

  if (state && state !== req.session.traktOAuthState) {
    logger.warn('Rejected Trakt callback due to invalid OAuth state', {
      label: 'Auth',
      userId: req.user.id,
      ip: req.ip,
    });
    clearTraktOauthSession(req);

    return redirectTo('invalid-state');
  }

  if (!state) {
    logger.warn('Trakt callback did not include OAuth state', {
      label: 'Auth',
      userId: req.user.id,
      ip: req.ip,
    });
  }

  const traktSettings = getSettings().trakt;
  const redirectUri = buildTraktRedirectUri({
    host,
    protocol: req.protocol,
  });

  try {
    const token = await TraktAPI.exchangeCode({
      clientId: traktSettings.clientId,
      clientSecret: traktSettings.clientSecret,
      code,
      redirectUri,
    });
    const traktApi = new TraktAPI({
      accessToken: token.access_token,
      clientId: traktSettings.clientId,
      clientSecret: traktSettings.clientSecret,
      refreshToken: token.refresh_token,
      tokenExpiresAt: new Date((token.created_at + token.expires_in) * 1000),
    });
    const currentUser = await traktApi.getCurrentUserSettings();
    const traktUsername =
      currentUser.user.ids.slug || currentUser.user.username;
    const userRepository = getRepository(User);
    const existingUser = await userRepository.findOne({
      where: { traktUsername },
      select: ['id', 'traktUsername'],
    });

    if (existingUser && existingUser.id !== req.user.id) {
      clearTraktOauthSession(req);

      return redirectTo('already-linked');
    }

    await persistTraktTokens(req.user.id, token, traktUsername);
    const userId = req.user.id;
    const settings = await ensureTraktUserSettings(userId);
    settings.traktHistorySyncEnabled = true;
    await getRepository(UserSettings).save(settings);
    clearTraktOauthSession(req);

    void (async () => {
      try {
        await syncTraktWatchStateForUser(userId, { forceFull: true });
        await syncTraktHistoryForUser(userId, { forceFull: true });
      } catch (bootstrapError) {
        logger.error('Initial Trakt bootstrap failed after link', {
          errorMessage:
            bootstrapError instanceof Error
              ? bootstrapError.message
              : 'Unknown error',
          label: 'Auth',
          userId,
        });
      }
    })();

    return redirectTo('connected');
  } catch (error) {
    logger.error('Something went wrong linking Trakt account', {
      label: 'Auth',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user.id,
      ip: req.ip,
    });
    clearTraktOauthSession(req);

    return redirectTo('error');
  }
});

authRoutes.get(
  '/google-sheets/status',
  isAuthenticated(),
  async (req, res, next) => {
    if (!req.user) {
      return next({ status: 500, message: 'Please sign in.' });
    }

    try {
      return res.status(200).json(await getGoogleSheetsStatus(req.user.id));
    } catch (error) {
      return next({
        status: 500,
        message:
          error instanceof Error
            ? error.message
            : 'Unable to load Google Sheets status.',
      });
    }
  }
);

authRoutes.get(
  '/google-sheets/connect',
  isAuthenticated(),
  (req, res, next) => {
    if (!req.user) {
      return next({ status: 500, message: 'Please sign in.' });
    }

    if (!req.session) {
      return next({ status: 500, message: 'Session unavailable.' });
    }

    if (!isGoogleSheetsConfigured()) {
      return next({ status: 404, message: 'Google Sheets is not configured.' });
    }

    const host = req.get('host');

    if (!host) {
      return next({
        status: 500,
        message: 'Unable to determine request host.',
      });
    }

    const redirectPath = getSafeAuthRedirectPath(
      req.query.redirect as string | string[] | undefined
    );
    const state = randomUUID();
    const googleSheetsSession = req.session as typeof req.session & {
      googleSheetsOAuthRedirect?: string;
      googleSheetsOAuthState?: string;
    };
    const redirectUri = buildGoogleSheetsRedirectUri({
      host,
      protocol: req.protocol,
    });
    const authClient = createGoogleSheetsOAuthClient(redirectUri);

    googleSheetsSession.googleSheetsOAuthRedirect = redirectPath;
    googleSheetsSession.googleSheetsOAuthState = state;

    return res.redirect(
      authClient.generateAuthUrl({
        access_type: 'offline',
        include_granted_scopes: true,
        prompt: 'consent',
        scope: GOOGLE_SHEETS_SCOPES,
        state,
      })
    );
  }
);

authRoutes.get('/google-sheets/callback', async (req, res) => {
  const googleSheetsSession = req.session as typeof req.session & {
    googleSheetsOAuthRedirect?: string;
    googleSheetsOAuthState?: string;
  };
  const redirectPath = getSafeAuthRedirectPath(
    googleSheetsSession?.googleSheetsOAuthRedirect ?? DEFAULT_TRAKT_REDIRECT
  );
  const redirectTo = (status: string) =>
    res.redirect(
      buildAuthResultRedirect({
        param: 'googleSheets',
        redirectPath,
        status,
      })
    );

  if (!req.user || !googleSheetsSession?.googleSheetsOAuthState) {
    clearGoogleSheetsOauthSession(req);

    return redirectTo('error');
  }

  if (!isGoogleSheetsConfigured()) {
    clearGoogleSheetsOauthSession(req);

    return redirectTo('not-configured');
  }

  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const state =
    typeof req.query.state === 'string' ? req.query.state : undefined;
  const host = req.get('host');

  if (!code || !host) {
    clearGoogleSheetsOauthSession(req);

    return redirectTo('error');
  }

  if (state !== googleSheetsSession.googleSheetsOAuthState) {
    logger.warn('Rejected Google Sheets callback due to invalid OAuth state', {
      label: 'Auth',
      userId: req.user.id,
      ip: req.ip,
    });
    clearGoogleSheetsOauthSession(req);

    return redirectTo('invalid-state');
  }

  try {
    const redirectUri = buildGoogleSheetsRedirectUri({
      host,
      protocol: req.protocol,
    });
    const authClient = createGoogleSheetsOAuthClient(redirectUri);
    const { tokens } = await authClient.getToken(code);
    authClient.setCredentials(tokens);

    const googleDrive = google.drive({ auth: authClient, version: 'v3' });
    const googleUser = await getGoogleDriveProfile(googleDrive);

    if (!googleUser.accountId || !googleUser.email) {
      throw new Error('Google did not return an account identity.');
    }

    const userRepository = getRepository(User);
    const existingUser = await userRepository
      .createQueryBuilder('user')
      .addSelect('user.googleSheetsAccountId')
      .where('user.googleSheetsAccountId = :accountId', {
        accountId: googleUser.accountId,
      })
      .getOne();

    if (existingUser && existingUser.id !== req.user.id) {
      clearGoogleSheetsOauthSession(req);

      return redirectTo('already-linked');
    }

    await persistGoogleSheetsTokens({
      accessToken: tokens.access_token ?? null,
      accountId: googleUser.accountId,
      connectedAt: new Date(),
      email: googleUser.email,
      refreshToken: tokens.refresh_token ?? null,
      tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      userId: req.user.id,
    });
    clearGoogleSheetsOauthSession(req);

    return redirectTo('connected');
  } catch (error) {
    logger.error('Something went wrong linking Google Sheets account', {
      label: 'Auth',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      userId: req.user.id,
      ip: req.ip,
    });
    clearGoogleSheetsOauthSession(req);

    return redirectTo('error');
  }
});

authRoutes.delete(
  '/google-sheets/disconnect',
  isAuthenticated(),
  async (req, res, next) => {
    if (!req.user) {
      return next({ status: 500, message: 'Please sign in.' });
    }

    try {
      await clearGoogleSheetsConnection(req.user.id);
      clearGoogleSheetsOauthSession(req);

      return res.status(204).send();
    } catch (error) {
      return next({
        status: 500,
        message:
          error instanceof Error
            ? error.message
            : 'Unable to disconnect Google Sheets account.',
      });
    }
  }
);

authRoutes.delete(
  '/trakt/disconnect',
  isAuthenticated(),
  async (req, res, next) => {
    if (!req.user) {
      return next({ status: 500, message: 'Please sign in.' });
    }

    try {
      await clearTraktConnection(req.user.id);
      clearTraktOauthSession(req);

      return res.status(204).send();
    } catch (error) {
      return next({
        status: 500,
        message:
          error instanceof Error
            ? error.message
            : 'Unable to disconnect Trakt account.',
      });
    }
  }
);

authRoutes.post('/plex', async (req, res, next) => {
  const settings = getSettings();
  const userRepository = getRepository(User);
  const body = req.body as { authToken?: string };

  if (!body.authToken) {
    return next({
      status: 500,
      message: 'Authentication token required.',
    });
  }

  if (
    settings.main.mediaServerType != MediaServerType.NOT_CONFIGURED &&
    (settings.main.mediaServerLogin === false ||
      settings.main.mediaServerType != MediaServerType.PLEX)
  ) {
    return res.status(500).json({ error: 'Plex login is disabled' });
  }
  try {
    // First we need to use this auth token to get the user's email from plex.tv
    const plextv = new PlexTvAPI(body.authToken);
    const account = await plextv.getUser();

    // Next let's see if the user already exists
    let user = await userRepository
      .createQueryBuilder('user')
      .where('user.plexId = :id', { id: account.id })
      .orWhere('user.email = :email', {
        email: account.email.toLowerCase(),
      })
      .getOne();

    if (!user && !(await userRepository.count())) {
      user = new User({
        email: account.email,
        plexUsername: account.username,
        plexId: account.id,
        plexToken: account.authToken,
        permissions: Permission.ADMIN,
        avatar: account.thumb,
        userType: UserType.PLEX,
      });

      settings.main.mediaServerType = MediaServerType.PLEX;
      await settings.save();
      startJobs();

      await userRepository.save(user);
    } else {
      const mainUser = await userRepository.findOneOrFail({
        select: { id: true, plexToken: true, plexId: true, email: true },
        where: { id: 1 },
      });
      const mainPlexTv = new PlexTvAPI(mainUser.plexToken ?? '');

      if (!account.id) {
        logger.error('Plex ID was missing from Plex.tv response', {
          label: 'API',
          ip: req.ip,
          email: account.email,
          plexUsername: account.username,
        });

        return next({
          status: 500,
          message: 'Something went wrong. Try again.',
        });
      }

      if (
        account.id === mainUser.plexId ||
        (account.email === mainUser.email && !mainUser.plexId) ||
        (await mainPlexTv.checkUserAccess(account.id))
      ) {
        if (user) {
          if (!user.plexId) {
            logger.info(
              'Found matching Plex user; updating user with Plex data',
              {
                label: 'API',
                ip: req.ip,
                email: user.email,
                userId: user.id,
                plexId: account.id,
                plexUsername: account.username,
              }
            );
          }

          user.plexToken = body.authToken;
          user.plexId = account.id;
          user.avatar = account.thumb;
          user.email = account.email;
          user.plexUsername = account.username;
          user.userType = UserType.PLEX;

          await userRepository.save(user);
        } else if (!settings.main.newPlexLogin) {
          logger.warn(
            'Failed sign-in attempt by unimported Plex user with access to the media server',
            {
              label: 'API',
              ip: req.ip,
              email: account.email,
              plexId: account.id,
              plexUsername: account.username,
            }
          );
          return next({
            status: 403,
            message: 'Access denied.',
          });
        } else {
          logger.info(
            'Sign-in attempt from Plex user with access to the media server; creating new Seerr user',
            {
              label: 'API',
              ip: req.ip,
              email: account.email,
              plexId: account.id,
              plexUsername: account.username,
            }
          );
          user = new User({
            email: account.email,
            plexUsername: account.username,
            plexId: account.id,
            plexToken: account.authToken,
            permissions: settings.main.defaultPermissions,
            avatar: account.thumb,
            userType: UserType.PLEX,
          });

          await userRepository.save(user);
        }
      } else {
        logger.warn(
          'Failed sign-in attempt by Plex user without access to the media server',
          {
            label: 'API',
            ip: req.ip,
            email: account.email,
            plexId: account.id,
            plexUsername: account.username,
          }
        );
        return next({
          status: 403,
          message: 'Access denied.',
        });
      }
    }

    // Set logged in session
    if (req.session) {
      req.session.userId = user.id;
    }

    return res.status(200).json(user?.filter() ?? {});
  } catch (e) {
    logger.error('Something went wrong authenticating with Plex account', {
      label: 'API',
      errorMessage: e.message,
      ip: req.ip,
    });
    return next({
      status: 500,
      message: 'Unable to authenticate.',
    });
  }
});

function getUserAvatarUrl(user: User): string {
  return withBasePath(
    `/avatarproxy/${user.jellyfinUserId}?v=${user.avatarVersion}`
  );
}

authRoutes.post('/jellyfin', async (req, res, next) => {
  const settings = getSettings();
  const userRepository = getRepository(User);
  const body = req.body as {
    username?: string;
    password?: string;
    hostname?: string;
    port?: number;
    urlBase?: string;
    useSsl?: boolean;
    email?: string;
    serverType?: number;
  };

  //Make sure jellyfin login is enabled, but only if jellyfin && Emby is not already configured
  if (
    // media server not configured, allow login for setup
    settings.main.mediaServerType != MediaServerType.NOT_CONFIGURED &&
    (settings.main.mediaServerLogin === false ||
      // media server is neither jellyfin or emby
      (settings.main.mediaServerType !== MediaServerType.JELLYFIN &&
        settings.main.mediaServerType !== MediaServerType.EMBY))
  ) {
    return res.status(500).json({ error: 'Jellyfin login is disabled' });
  }

  if (!body.username) {
    return res.status(500).json({ error: 'You must provide an username' });
  } else if (settings.jellyfin.ip !== '' && body.hostname) {
    return res
      .status(500)
      .json({ error: 'Jellyfin hostname already configured' });
  } else if (settings.jellyfin.ip === '' && !body.hostname) {
    return res.status(500).json({ error: 'No hostname provided.' });
  }

  try {
    const hostname =
      settings.jellyfin.ip !== ''
        ? getHostname()
        : getHostname({
            useSsl: body.useSsl,
            ip: body.hostname,
            port: body.port,
            urlBase: body.urlBase,
          });

    // Try to find deviceId that corresponds to jellyfin user, else generate a new one
    let user = await userRepository.findOne({
      where: { jellyfinUsername: body.username },
      select: { id: true, jellyfinDeviceId: true },
    });

    let deviceId = 'BOT_seerr';
    if (user && user.id === 1) {
      // Admin is always BOT_seerr
      deviceId = 'BOT_seerr';
    } else if (user && user.jellyfinDeviceId) {
      deviceId = user.jellyfinDeviceId;
    } else if (body.username) {
      deviceId = Buffer.from(`BOT_seerr_${body.username}`).toString('base64');
    }

    // First we need to attempt to log the user in to jellyfin
    const jellyfinserver = new JellyfinAPI(hostname ?? '', undefined, deviceId);

    const ip = req.ip;
    let clientIp;

    if (ip) {
      if (net.isIPv4(ip)) {
        clientIp = ip;
      } else if (net.isIPv6(ip)) {
        clientIp = ip.startsWith('::ffff:') ? ip.substring(7) : ip;
      }
    }

    const account = await jellyfinserver.login(
      body.username,
      body.password,
      clientIp
    );

    // Next let's see if the user already exists
    user = await userRepository.findOne({
      where: { jellyfinUserId: account.User.Id },
    });

    const missingAdminUser = !user && !(await userRepository.count());
    if (
      missingAdminUser ||
      settings.main.mediaServerType === MediaServerType.NOT_CONFIGURED
    ) {
      // Check if user is admin on jellyfin
      if (account.User.Policy.IsAdministrator === false) {
        throw new ApiError(403, ApiErrorCode.NotAdmin);
      }

      if (
        body.serverType !== MediaServerType.JELLYFIN &&
        body.serverType !== MediaServerType.EMBY
      ) {
        throw new ApiError(500, ApiErrorCode.NoAdminUser);
      }
      settings.main.mediaServerType = body.serverType;

      if (missingAdminUser) {
        logger.info(
          'Sign-in attempt from Jellyfin user with access to the media server; creating initial admin user for Seerr',
          {
            label: 'API',
            ip: req.ip,
            jellyfinUsername: account.User.Name,
          }
        );

        // User doesn't exist, and there are no users in the database, we'll create the user
        // with admin permissions

        user = new User({
          id: 1,
          email: body.email || account.User.Name,
          jellyfinUsername: account.User.Name,
          jellyfinUserId: account.User.Id,
          jellyfinDeviceId: deviceId,
          jellyfinAuthToken: account.AccessToken,
          permissions: Permission.ADMIN,
          userType:
            body.serverType === MediaServerType.JELLYFIN
              ? UserType.JELLYFIN
              : UserType.EMBY,
        });
        user.avatar = getUserAvatarUrl(user);

        await userRepository.save(user);
      } else {
        logger.info(
          'Sign-in attempt from Jellyfin user with access to the media server; editing admin user for Seerr',
          {
            label: 'API',
            ip: req.ip,
            jellyfinUsername: account.User.Name,
          }
        );

        // User alread exist but settings.json is not configured, we'll edit the admin user

        user = await userRepository.findOne({
          where: { id: 1 },
        });
        if (!user) {
          throw new Error('Unable to find admin user to edit');
        }
        user.email = body.email || account.User.Name;
        user.jellyfinUsername = account.User.Name;
        user.jellyfinUserId = account.User.Id;
        user.jellyfinDeviceId = deviceId;
        user.jellyfinAuthToken = account.AccessToken;
        user.permissions = Permission.ADMIN;
        user.avatar = getUserAvatarUrl(user);
        user.userType =
          body.serverType === MediaServerType.JELLYFIN
            ? UserType.JELLYFIN
            : UserType.EMBY;

        await userRepository.save(user);
      }

      // Create an API key on Jellyfin from this admin user
      const jellyfinClient = new JellyfinAPI(
        hostname,
        account.AccessToken,
        deviceId
      );
      const apiKey = await jellyfinClient.createApiToken('Seerr');

      const serverName = await jellyfinserver.getServerName();

      settings.jellyfin.name = serverName;
      settings.jellyfin.serverId = account.User.ServerId;
      settings.jellyfin.ip = body.hostname ?? '';
      settings.jellyfin.port = body.port ?? 8096;
      settings.jellyfin.urlBase = body.urlBase ?? '';
      settings.jellyfin.useSsl = body.useSsl ?? false;
      settings.jellyfin.apiKey = apiKey;
      await settings.save();
      startJobs();
    }
    // User already exists, let's update their information
    else if (account.User.Id === user?.jellyfinUserId) {
      logger.info(
        `Found matching ${
          settings.main.mediaServerType === MediaServerType.JELLYFIN
            ? ServerType.JELLYFIN
            : ServerType.EMBY
        } user; updating user with ${
          settings.main.mediaServerType === MediaServerType.JELLYFIN
            ? ServerType.JELLYFIN
            : ServerType.EMBY
        }`,
        {
          label: 'API',
          ip: req.ip,
          jellyfinUsername: account.User.Name,
        }
      );
      user.avatar = getUserAvatarUrl(user);
      user.jellyfinUsername = account.User.Name;

      if (user.username === account.User.Name) {
        user.username = '';
      }

      await userRepository.save(user);
    } else if (!settings.main.newPlexLogin) {
      logger.warn(
        'Failed sign-in attempt by unimported Jellyfin user with access to the media server',
        {
          label: 'API',
          ip: req.ip,
          jellyfinUserId: account.User.Id,
          jellyfinUsername: account.User.Name,
        }
      );
      return next({
        status: 403,
        message: 'Access denied.',
      });
    } else if (!user) {
      logger.info(
        'Sign-in attempt from Jellyfin user with access to the media server; creating new Seerr user',
        {
          label: 'API',
          ip: req.ip,
          jellyfinUsername: account.User.Name,
        }
      );

      user = new User({
        email: body.email,
        jellyfinUsername: account.User.Name,
        jellyfinUserId: account.User.Id,
        jellyfinDeviceId: deviceId,
        permissions: settings.main.defaultPermissions,
        userType:
          settings.main.mediaServerType === MediaServerType.JELLYFIN
            ? UserType.JELLYFIN
            : UserType.EMBY,
      });
      user.avatar = getUserAvatarUrl(user);

      //initialize Jellyfin/Emby users with local login
      const passedExplicitPassword = body.password && body.password.length > 0;
      if (passedExplicitPassword) {
        await user.setPassword(body.password ?? '');
      }
      await userRepository.save(user);
    }

    if (user && user.jellyfinUserId) {
      try {
        const { changed } = await checkAvatarChanged(user);

        if (changed) {
          user.avatar = getUserAvatarUrl(user);
          await userRepository.save(user);
          logger.debug('Avatar updated during login', {
            userId: user.id,
            jellyfinUserId: user.jellyfinUserId,
          });
        }
      } catch (error) {
        logger.error('Error handling avatar during login', {
          label: 'Auth',
          errorMessage: error.message,
        });
      }
    }

    // Set logged in session
    if (req.session) {
      req.session.userId = user?.id;
    }

    return res.status(200).json(user?.filter() ?? {});
  } catch (e) {
    switch (e.errorCode) {
      case ApiErrorCode.InvalidUrl:
        logger.error(
          `The provided ${
            settings.main.mediaServerType === MediaServerType.JELLYFIN
              ? ServerType.JELLYFIN
              : ServerType.EMBY
          } is invalid or the server is not reachable.`,
          {
            label: 'Auth',
            error: e.errorCode,
            status: e.statusCode,
            hostname: getHostname({
              useSsl: body.useSsl,
              ip: body.hostname,
              port: body.port,
              urlBase: body.urlBase,
            }),
          }
        );
        return next({
          status: e.statusCode,
          message: e.errorCode,
        });

      case ApiErrorCode.InvalidCredentials:
        logger.warn(
          'Failed login attempt from user with incorrect Jellyfin credentials',
          {
            label: 'Auth',
            account: {
              ip: req.ip,
              email: body.username,
              password: '__REDACTED__',
            },
          }
        );
        return next({
          status: e.statusCode,
          message: e.errorCode,
        });

      case ApiErrorCode.NotAdmin:
        logger.warn(
          'Failed login attempt from user without admin permissions',
          {
            label: 'Auth',
            account: {
              ip: req.ip,
              email: body.username,
            },
          }
        );
        return next({
          status: e.statusCode,
          message: e.errorCode,
        });

      case ApiErrorCode.NoAdminUser:
        logger.warn(
          'Failed login attempt from user without admin permissions and no admin user exists',
          {
            label: 'Auth',
            account: {
              ip: req.ip,
              email: body.username,
            },
          }
        );
        return next({
          status: e.statusCode,
          message: e.errorCode,
        });

      default:
        logger.error(e.message, { label: 'Auth' });
        return next({
          status: 500,
          message: 'Something went wrong.',
        });
    }
  }
});

authRoutes.post('/local', async (req, res, next) => {
  const settings = getSettings();
  const userRepository = getRepository(User);
  const body = req.body as { email?: string; password?: string };

  if (!settings.main.localLogin) {
    return res.status(500).json({ error: 'Password sign-in is disabled.' });
  } else if (!body.email || !body.password) {
    return res.status(500).json({
      error: 'You must provide both an email address and a password.',
    });
  }
  try {
    const user = await userRepository
      .createQueryBuilder('user')
      .select(['user.id', 'user.email', 'user.password', 'user.plexId'])
      .where('user.email = :email', { email: body.email.toLowerCase() })
      .getOne();

    if (!user || !(await user.passwordMatch(body.password))) {
      logger.warn('Failed sign-in attempt using invalid Seerr password', {
        label: 'API',
        ip: req.ip,
        email: body.email,
        userId: user?.id,
      });
      return next({
        status: 403,
        message: 'Access denied.',
      });
    }

    // Set logged in session
    if (user && req.session) {
      req.session.userId = user.id;
    }

    return res.status(200).json(user?.filter() ?? {});
  } catch (e) {
    logger.error('Something went wrong authenticating with Seerr password', {
      label: 'API',
      errorMessage: e.message,
      ip: req.ip,
      email: body.email,
    });
    return next({
      status: 500,
      message: 'Unable to authenticate.',
    });
  }
});

authRoutes.post('/logout', async (req, res, next) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(200).json({ status: 'ok' });
    }

    const settings = getSettings();
    const isJellyfinOrEmby =
      settings.main.mediaServerType === MediaServerType.JELLYFIN ||
      settings.main.mediaServerType === MediaServerType.EMBY;

    if (isJellyfinOrEmby) {
      const user = await getRepository(User)
        .createQueryBuilder('user')
        .addSelect(['user.jellyfinUserId', 'user.jellyfinDeviceId'])
        .where('user.id = :id', { id: userId })
        .getOne();

      if (user?.jellyfinUserId && user.jellyfinDeviceId) {
        try {
          const baseUrl = getHostname();
          try {
            await axios.delete(`${baseUrl}/Devices`, {
              params: { Id: user.jellyfinDeviceId },
              headers: {
                'X-Emby-Authorization': `MediaBrowser Client="Seerr", Device="Seerr", DeviceId="seerr", Version="${getAppVersion()}", Token="${
                  settings.jellyfin.apiKey
                }"`,
              },
            });
          } catch (error) {
            logger.error('Failed to delete Jellyfin device', {
              label: 'Auth',
              error: error instanceof Error ? error.message : 'Unknown error',
              userId: user.id,
              jellyfinUserId: user.jellyfinUserId,
            });
          }
        } catch (error) {
          logger.error('Failed to delete Jellyfin device', {
            label: 'Auth',
            error: error instanceof Error ? error.message : 'Unknown error',
            userId: user.id,
            jellyfinUserId: user.jellyfinUserId,
          });
        }
      }
    }

    req.session?.destroy((err: Error | null) => {
      if (err) {
        logger.error('Failed to destroy session', {
          label: 'Auth',
          error: err.message,
          userId,
        });
        return next({ status: 500, message: 'Failed to destroy session.' });
      }
      logger.debug('Successfully logged out user', {
        label: 'Auth',
        userId,
      });
      res.status(200).json({ status: 'ok' });
    });
  } catch (error) {
    logger.error('Error during logout process', {
      label: 'Auth',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: req.session?.userId,
    });
    next({ status: 500, message: 'Error during logout process.' });
  }
});

authRoutes.post('/reset-password', async (req, res, next) => {
  const userRepository = getRepository(User);
  const body = req.body as { email?: string };

  if (!body.email) {
    return next({
      status: 500,
      message: 'Email address required.',
    });
  }

  const user = await userRepository
    .createQueryBuilder('user')
    .where('user.email = :email', { email: body.email.toLowerCase() })
    .getOne();

  if (user) {
    await user.resetPassword();
    await userRepository.save(user);
    logger.info('Successfully sent password reset link', {
      label: 'API',
      ip: req.ip,
      email: body.email,
    });
  } else {
    logger.error('Something went wrong sending password reset link', {
      label: 'API',
      ip: req.ip,
      email: body.email,
    });
  }

  return res.status(200).json({ status: 'ok' });
});

authRoutes.post('/reset-password/:guid', async (req, res, next) => {
  const userRepository = getRepository(User);

  if (!req.body.password || req.body.password?.length < 8) {
    logger.warn('Failed password reset attempt using invalid new password', {
      label: 'API',
      ip: req.ip,
      guid: req.params.guid,
    });
    return next({
      status: 500,
      message: 'Password must be at least 8 characters long.',
    });
  }

  const user = await userRepository.findOne({
    where: { resetPasswordGuid: req.params.guid },
  });

  if (!user) {
    logger.warn('Failed password reset attempt using invalid recovery link', {
      label: 'API',
      ip: req.ip,
      guid: req.params.guid,
    });
    return next({
      status: 500,
      message: 'Invalid password reset link.',
    });
  }

  if (
    !user.recoveryLinkExpirationDate ||
    user.recoveryLinkExpirationDate <= new Date()
  ) {
    logger.warn('Failed password reset attempt using expired recovery link', {
      label: 'API',
      ip: req.ip,
      guid: req.params.guid,
      email: user.email,
    });
    return next({
      status: 500,
      message: 'Invalid password reset link.',
    });
  }
  user.recoveryLinkExpirationDate = null;
  await user.setPassword(req.body.password);
  await userRepository.save(user);
  logger.info('Successfully reset password', {
    label: 'API',
    ip: req.ip,
    guid: req.params.guid,
    email: user.email,
  });

  return res.status(200).json({ status: 'ok' });
});

export default authRoutes;
