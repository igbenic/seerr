import Button from '@app/components/Common/Button';
import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import { useUpdateQueryParams } from '@app/hooks/useUpdateQueryParams';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/solid';
import type {
  TraktHistoryListResponse,
  TraktHistoryMediaType,
} from '@server/interfaces/api/userInterfaces';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.UserProfile.TraktHistoryList', {
  title: 'Trakt History',
  empty: 'No Trakt watch history has been imported yet.',
  filter: 'Filter',
  page: 'Page',
  watchedAt: 'Watched',
  source: 'Imported from Trakt watch history.',
});

const PAGE_SIZE = 20;

const TraktHistoryList = () => {
  const router = useRouter();
  const intl = useIntl();
  const userId = router.pathname.startsWith('/profile')
    ? undefined
    : Number(router.query.userId);
  const { user } = useUser({ id: userId });
  const { user: currentUser } = useUser();
  const [mediaType, setMediaType] = useState<TraktHistoryMediaType>('all');

  const page = router.query.page ? Number(router.query.page) : 1;
  const pageIndex = page - 1;
  const updateQueryParams = useUpdateQueryParams({ page: page.toString() });
  const resolvedUserId = userId ?? currentUser?.id;

  const { data, error } = useSWR<TraktHistoryListResponse>(
    resolvedUserId
      ? `/api/v1/user/${resolvedUserId}/trakt_history?take=${PAGE_SIZE}&skip=${
          pageIndex * PAGE_SIZE
        }&mediaType=${mediaType}`
      : null
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <LoadingSpinner />;
  }

  const hasNextPage = data.pageInfo.pages > pageIndex + 1;
  const hasPrevPage = pageIndex > 0;
  const profileHref = router.pathname.startsWith('/profile')
    ? '/profile'
    : `/users/${user?.id}`;

  return (
    <>
      <PageTitle
        title={[intl.formatMessage(messages.title), user?.displayName ?? '']}
      />
      <Header
        subtext={
          <Link href={profileHref} className="hover:underline">
            {user?.displayName ?? currentUser?.displayName}
          </Link>
        }
      >
        {intl.formatMessage(messages.title)}
      </Header>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-400">
          {intl.formatMessage(messages.source)}
        </p>
        <div className="flex">
          <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-sm text-gray-100">
            {intl.formatMessage(messages.filter)}
          </span>
          <select
            id="mediaType"
            name="mediaType"
            value={mediaType}
            className="rounded-r-only"
            onChange={(event) => {
              setMediaType(event.target.value as TraktHistoryMediaType);
              router.push({
                pathname: router.pathname,
                query: router.query.userId
                  ? { userId: router.query.userId }
                  : {},
              });
            }}
          >
            <option value="all">{intl.formatMessage(globalMessages.all)}</option>
            <option value="movie">
              {intl.formatMessage(globalMessages.movies)}
            </option>
            <option value="tv">{intl.formatMessage(globalMessages.tvshows)}</option>
          </select>
        </div>
      </div>
      <div className="mt-6 overflow-hidden rounded-lg border border-gray-800 bg-gray-900/70 shadow-lg">
        {data.results.length > 0 ? (
          <div className="divide-y divide-gray-800">
            {data.results.map((item) => {
              const href =
                item.tmdbId != null
                  ? `/${item.mediaType === 'movie' ? 'movie' : 'tv'}/${
                      item.tmdbId
                    }`
                  : null;

              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    {href ? (
                      <Link
                        href={href}
                        className="truncate text-sm font-semibold text-white transition hover:text-gray-300"
                      >
                        {item.title}
                        {item.year ? ` (${item.year})` : ''}
                      </Link>
                    ) : (
                      <div className="truncate text-sm font-semibold text-white">
                        {item.title}
                        {item.year ? ` (${item.year})` : ''}
                      </div>
                    )}
                    <div className="mt-1 text-xs uppercase tracking-wide text-gray-400">
                      {item.mediaType === 'movie'
                        ? intl.formatMessage(globalMessages.movie)
                        : intl.formatMessage(globalMessages.tvshow)}
                    </div>
                  </div>
                  <div className="text-sm text-gray-300">
                    <span className="mr-2 font-medium text-gray-400">
                      {intl.formatMessage(messages.watchedAt)}
                    </span>
                    <span>
                      {intl.formatDate(item.watchedAt, {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}{' '}
                      {intl.formatTime(item.watchedAt, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-6 text-sm text-gray-400">
            {intl.formatMessage(messages.empty)}
          </div>
        )}
      </div>
      {data.pageInfo.pages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <Button
            buttonType="ghost"
            type="button"
            disabled={!hasPrevPage}
            onClick={() => updateQueryParams('page', String(page - 1))}
          >
            <ChevronLeftIcon className="mr-1 h-5 w-5" />
            <span>{intl.formatMessage(globalMessages.previous)}</span>
          </Button>
          <div className="text-sm text-gray-300">
            {intl.formatMessage(messages.page)} {page} / {data.pageInfo.pages}
          </div>
          <Button
            buttonType="ghost"
            type="button"
            disabled={!hasNextPage}
            onClick={() => updateQueryParams('page', String(page + 1))}
          >
            <span>{intl.formatMessage(globalMessages.next)}</span>
            <ChevronRightIcon className="ml-1 h-5 w-5" />
          </Button>
        </div>
      )}
    </>
  );
};

export default TraktHistoryList;
