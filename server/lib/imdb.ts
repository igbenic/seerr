import ImdbApi, {
  type ImdbCredentials,
  type ImdbWatchlistItem,
  parseWatchlistCsv,
} from '@server/api/imdb';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import type {
  ImdbImportConfirmResponse,
  ImdbImportItem,
  ImdbImportPreviewResponse,
} from '@server/interfaces/api/imdbImportInterfaces';
import cacheManager from '@server/lib/cache';
import {
  createTraktApiForUser,
  isTraktConfigured,
  type TraktAuthUser,
} from '@server/lib/trakt';
import { randomUUID } from 'crypto';

const PREVIEW_CACHE_PREFIX = 'watchlist-import-preview:';
const PREVIEW_TTL_SECONDS = 60 * 15;

type LinkedImdbUser = TraktAuthUser & {
  imdbAuthType?: 'cookie' | 'password' | null;
  imdbConnectedAt?: Date | null;
  imdbCookieAtMain?: string | null;
  imdbEmail?: string | null;
  imdbLastImportAt?: Date | null;
  imdbPassword?: string | null;
};

type CachedPreview = {
  eligibleItems: ImdbImportItem[];
  skippedUnsupported: ImdbImportItem[];
  userId: number;
};

const previewCache = cacheManager.getCache('imdb').data;

export const clearImdbConnection = async (userId: number): Promise<void> => {
  await getRepository(User).update(userId, {
    imdbAuthType: null,
    imdbConnectedAt: null,
    imdbCookieAtMain: null,
    imdbEmail: null,
    imdbLastImportAt: null,
    imdbPassword: null,
  });

  clearUserPreviewTokens(userId);
};

export const linkImdbConnection = async (
  userId: number,
  credentials: ImdbCredentials
): Promise<void> => {
  const imdbApi = new ImdbApi(credentials);
  await imdbApi.getWatchlist();

  await getRepository(User).update(userId, {
    imdbAuthType: credentials.authType,
    imdbConnectedAt: new Date(),
    imdbCookieAtMain:
      credentials.authType === 'cookie' ? credentials.cookieAtMain : null,
    imdbEmail: credentials.authType === 'password' ? credentials.email : null,
    imdbPassword:
      credentials.authType === 'password' ? credentials.password : null,
  });
};

export const createImdbImportPreview = async ({
  csvContent,
  userId,
}: {
  csvContent?: string;
  userId: number;
}): Promise<ImdbImportPreviewResponse> => {
  if (!isTraktConfigured()) {
    throw new Error('Trakt is not configured.');
  }

  const [imdbItems, traktApi] = await Promise.all([
    loadImdbWatchlist({ csvContent, userId }),
    createTraktApiForUser(userId),
  ]);

  if (!traktApi) {
    throw new Error(
      'A linked Trakt account is required before importing IMDb.'
    );
  }

  const traktWatchlist = await traktApi.getWatchlist();
  const existingIds = new Set(
    traktWatchlist
      .flatMap((item) =>
        item.type === 'movie'
          ? item.movie?.ids.imdb
          : item.type === 'show'
            ? item.show?.ids.imdb
            : null
      )
      .filter((id): id is string => !!id)
  );

  const previewItems: ImdbImportItem[] = imdbItems.map((item) => {
    const traktType = normalizeImdbType(item.imdbType);

    if (!traktType) {
      return {
        imdbId: item.imdbId,
        imdbType: item.imdbType,
        reason: `Unsupported IMDb type: ${item.imdbType}`,
        status: 'skipped',
        title: item.title,
      };
    }

    return {
      imdbId: item.imdbId,
      imdbType: item.imdbType,
      status: existingIds.has(item.imdbId) ? 'existing' : 'eligible',
      title: item.title,
    };
  });

  const eligibleItems = previewItems.filter(
    (item) => item.status === 'eligible'
  );
  const skippedUnsupported = previewItems.filter(
    (item) => item.status === 'skipped'
  );
  const previewToken = randomUUID();

  previewCache.set(
    previewCacheKey(previewToken),
    {
      eligibleItems,
      skippedUnsupported,
      userId,
    } satisfies CachedPreview,
    PREVIEW_TTL_SECONDS
  );

  return {
    items: previewItems,
    previewToken,
    summary: {
      alreadyOnTrakt: previewItems.filter((item) => item.status === 'existing')
        .length,
      eligibleToAdd: eligibleItems.length,
      skippedUnsupported: skippedUnsupported.length,
      total: previewItems.length,
    },
  };
};

export const confirmImdbImport = async (
  userId: number,
  previewToken: string
): Promise<ImdbImportConfirmResponse> => {
  const cachedPreview = previewCache.get<CachedPreview>(
    previewCacheKey(previewToken)
  );

  if (!cachedPreview || cachedPreview.userId !== userId) {
    throw new Error('IMDb import preview expired or is no longer valid.');
  }

  const traktApi = await createTraktApiForUser(userId);
  if (!traktApi) {
    throw new Error(
      'A linked Trakt account is required before importing IMDb.'
    );
  }

  const syncItems = cachedPreview.eligibleItems.map((item) => ({
    ids: { imdb: item.imdbId },
    type: normalizeImdbType(item.imdbType) as 'movie' | 'show',
  }));

  const result =
    syncItems.length > 0
      ? await traktApi.addToWatchlist(syncItems)
      : {
          added: 0,
          existing: 0,
          notFound: [],
        };

  const notFoundIds = new Set(
    result.notFound.map((item) => item.ids.imdb).filter(Boolean)
  );
  const addedItems = cachedPreview.eligibleItems.filter(
    (item) => !notFoundIds.has(item.imdbId)
  );
  const notFoundItems = cachedPreview.eligibleItems.filter((item) =>
    notFoundIds.has(item.imdbId)
  );

  await getRepository(User).update(userId, {
    imdbLastImportAt: new Date(),
  });
  previewCache.del(previewCacheKey(previewToken));

  return {
    added: addedItems,
    notFound: notFoundItems,
    skippedUnsupported: cachedPreview.skippedUnsupported,
    summary: {
      added: result.added,
      existing: result.existing,
      notFound: notFoundItems.length,
      skippedUnsupported: cachedPreview.skippedUnsupported.length,
    },
  };
};

const loadImdbWatchlist = async ({
  csvContent,
  userId,
}: {
  csvContent?: string;
  userId: number;
}): Promise<ImdbWatchlistItem[]> => {
  if (csvContent !== undefined) {
    return parseUploadedCsv(csvContent);
  }

  const imdbApi = await createImdbApiForUser(userId);

  return imdbApi.getWatchlist();
};

const parseUploadedCsv = (csvContent: string): ImdbWatchlistItem[] => {
  const normalizedContent = csvContent.replace(/^\uFEFF/, '').trim();

  if (!normalizedContent) {
    throw new Error('IMDb CSV upload was empty.');
  }

  return parseWatchlistCsv(normalizedContent);
};

const createImdbApiForUser = async (userId: number): Promise<ImdbApi> => {
  const user = await loadUserWithImdbAuth(userId);

  if (!user?.imdbAuthType) {
    throw new Error('An IMDb account must be linked before importing.');
  }

  if (user.imdbAuthType === 'password') {
    if (!user.imdbEmail || !user.imdbPassword) {
      throw new Error('The linked IMDb password credentials are incomplete.');
    }

    return new ImdbApi({
      authType: 'password',
      email: user.imdbEmail,
      password: user.imdbPassword,
    });
  }

  if (!user.imdbCookieAtMain) {
    throw new Error('The linked IMDb cookie is missing.');
  }

  return new ImdbApi({
    authType: 'cookie',
    cookieAtMain: user.imdbCookieAtMain,
    email: user.imdbEmail ?? null,
  });
};

const loadUserWithImdbAuth = async (
  userId: number
): Promise<LinkedImdbUser | null> => {
  return getRepository(User)
    .createQueryBuilder('user')
    .addSelect(['user.imdbPassword', 'user.imdbCookieAtMain'])
    .where('user.id = :userId', { userId })
    .getOne() as Promise<LinkedImdbUser | null>;
};

const normalizeImdbType = (imdbType: string): 'movie' | 'show' | null => {
  switch (imdbType) {
    case 'Movie':
      return 'movie';
    case 'TV Mini Series':
    case 'TV Series':
      return 'show';
    default:
      return null;
  }
};

const previewCacheKey = (previewToken: string) =>
  `${PREVIEW_CACHE_PREFIX}${previewToken}`;

const clearUserPreviewTokens = (userId: number) => {
  for (const key of previewCache.keys()) {
    if (!key.startsWith(PREVIEW_CACHE_PREFIX)) {
      continue;
    }

    const cachedPreview = previewCache.get<CachedPreview>(key);
    if (cachedPreview?.userId === userId) {
      previewCache.del(key);
    }
  }
};
