import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import LanguageSelector from '@app/components/LanguageSelector';
import QuotaSelector from '@app/components/QuotaSelector';
import RegionSelector from '@app/components/RegionSelector';
import { availableLanguages } from '@app/context/LanguageContext';
import useLocale from '@app/hooks/useLocale';
import useSettings from '@app/hooks/useSettings';
import { Permission, UserType, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowDownOnSquareIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { ApiErrorCode } from '@server/constants/error';
import type { GoogleSheetsSyncStatusResponse } from '@server/interfaces/api/googleSheetsInterfaces';
import type {
  TraktHistoryStatusResponse,
  TraktWatchlistStatusResponse,
} from '@server/interfaces/api/userInterfaces';
import type { UserSettingsGeneralResponse } from '@server/interfaces/api/userSettingsInterfaces';
import type { AvailableLocale } from '@server/types/languages';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';
import validator from 'validator';
import * as Yup from 'yup';

const messages = defineMessages(
  'components.UserProfile.UserSettings.UserGeneralSettings',
  {
    general: 'General',
    generalsettings: 'General Settings',
    displayName: 'Display Name',
    email: 'Email',
    save: 'Save Changes',
    saving: 'Saving…',
    mediaServerUser: '{mediaServerName} User',
    accounttype: 'Account Type',
    plexuser: 'Plex User',
    localuser: 'Local User',
    role: 'Role',
    owner: 'Owner',
    admin: 'Admin',
    user: 'User',
    toastSettingsSuccess: 'Settings saved successfully!',
    toastSettingsFailure: 'Something went wrong while saving settings.',
    toastSettingsFailureEmail: 'This email is already taken!',
    toastSettingsFailureEmailEmpty:
      'Another user already has this username. You must set an email',
    region: 'Discover Region',
    regionTip: 'Filter content by regional availability',
    discoverRegion: 'Discover Region',
    discoverRegionTip: 'Filter content by regional availability',
    originallanguage: 'Discover Language',
    originallanguageTip: 'Filter content by original language',
    streamingRegion: 'Streaming Region',
    streamingRegionTip: 'Show streaming sites by regional availability',
    movierequestlimit: 'Movie Request Limit',
    seriesrequestlimit: 'Series Request Limit',
    enableOverride: 'Override Global Limit',
    applanguage: 'Display Language',
    languageDefault: 'Default ({language})',
    discordId: 'Discord User ID',
    discordIdTip:
      'The <FindDiscordIdLink>multi-digit ID number</FindDiscordIdLink> associated with your Discord user account',
    validationemailrequired: 'Email required',
    validationemailformat: 'Valid email required',
    validationDiscordId: 'You must provide a valid Discord user ID',
    plexwatchlistsyncmovies: 'Auto-Request Movies',
    plexwatchlistsyncmoviestip:
      'Automatically request movies on your <PlexWatchlistSupportLink>Plex Watchlist</PlexWatchlistSupportLink>',
    plexwatchlistsyncseries: 'Auto-Request Series',
    plexwatchlistsyncseriestip:
      'Automatically request series on your <PlexWatchlistSupportLink>Plex Watchlist</PlexWatchlistSupportLink>',
    hideWatched: 'Hide Watched Trakt Titles',
    hideWatchedTip:
      'Hide titles you have already watched on Trakt from Trakt-powered recommendations and watchlists.',
    traktHistorySync: 'Sync Trakt Watched State & History',
    traktHistorySyncTip:
      'Cache your Trakt watched state for detail pages and import watch history for activity views.',
    traktHistorySyncNow: 'Sync Now',
    traktHistoryForceResync: 'Full Resync',
    traktHistoryImported: '{count} history items imported',
    traktHistoryStatusConnected: 'Linked Trakt account required for sync.',
    traktHistoryStatusLastSuccess: 'Last successful sync',
    traktHistoryStatusLastAttempt: 'Last attempted sync',
    traktHistoryStatusLatest: 'Latest imported watch',
    traktWatchStateStatus: 'Watched-state cache',
    traktWatchStateStatusReady: 'Ready',
    traktWatchStateStatusPending: 'Initial bootstrap pending',
    traktWatchStateStatusLastSuccess: 'Watched-state last successful sync',
    traktWatchStateStatusLastAttempt: 'Watched-state last attempted sync',
    traktHistorySyncSuccess: 'Trakt watched-state and history sync completed.',
    traktHistorySyncFailure: 'Unable to sync Trakt watched-state and history.',
    traktWatchlistSync: 'Sync Trakt Watchlist',
    traktWatchlistSyncTip:
      'Mirror your Trakt watchlist into Seerr and keep it updated locally for faster access.',
    traktWatchlistSyncNow: 'Sync Now',
    traktWatchlistImported: '{count} watchlist items',
    traktWatchlistStatusConnected: 'Linked Trakt account required for sync.',
    traktWatchlistStatusLastSuccess: 'Last successful sync',
    traktWatchlistStatusLastAttempt: 'Last attempted sync',
    traktWatchlistStatusLastError: 'Last error',
    traktWatchlistSyncSuccess: 'Trakt watchlist sync completed.',
    traktWatchlistSyncFailure: 'Unable to sync Trakt watchlist.',
    googleSheetsWatchlistSync: 'Mirror Want to Watch to Google Drive CSV',
    googleSheetsWatchlistSyncTip:
      'Create and maintain an app-managed CSV file in Google Drive from your Trakt watchlist.',
    googleSheetsWatchlistSheet: 'CSV File',
    googleSheetsWatchlistSyncNow: 'Sync Now',
    googleSheetsWatchlistStatusConnected:
      'Linked Google Drive and Trakt accounts required for sync.',
    googleSheetsWatchlistStatusLastSuccess: 'Last successful sync',
    googleSheetsWatchlistStatusLastAttempt: 'Last attempted sync',
    googleSheetsWatchlistStatusLastError: 'Last error',
    googleSheetsWatchlistSyncSuccess:
      'Google Drive want-to-watch CSV sync completed.',
    googleSheetsWatchlistSyncFailure:
      'Unable to sync the Google Drive want-to-watch CSV file.',
    googleSheetsWatchedSync: 'Mirror Watched to Google Drive CSV',
    googleSheetsWatchedSyncTip:
      'Create and maintain an app-managed CSV file in Google Drive of unique Trakt-watched titles.',
    googleSheetsWatchedSheet: 'CSV File',
    googleSheetsWatchedSyncNow: 'Sync Now',
    googleSheetsWatchedStatusConnected:
      'Linked Google Drive and Trakt accounts required for sync.',
    googleSheetsWatchedStatusLastSuccess: 'Last successful sync',
    googleSheetsWatchedStatusLastAttempt: 'Last attempted sync',
    googleSheetsWatchedStatusLastError: 'Last error',
    googleSheetsWatchedSyncSuccess: 'Google Drive watched CSV sync completed.',
    googleSheetsWatchedSyncFailure:
      'Unable to sync the Google Drive watched CSV file.',
  }
);

const UserGeneralSettings = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { locale, setLocale } = useLocale();
  const [movieQuotaEnabled, setMovieQuotaEnabled] = useState(false);
  const [tvQuotaEnabled, setTvQuotaEnabled] = useState(false);
  const router = useRouter();
  const {
    user,
    hasPermission,
    revalidate: revalidateUser,
  } = useUser({
    id: Number(router.query.userId),
  });
  const { user: currentUser, hasPermission: currentHasPermission } = useUser();
  const { currentSettings } = useSettings();
  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<UserSettingsGeneralResponse>(
    user ? `/api/v1/user/${user?.id}/settings/main` : null
  );
  const { data: traktHistoryStatus, mutate: revalidateTraktHistoryStatus } =
    useSWR<TraktHistoryStatusResponse>(
      user ? `/api/v1/user/${user?.id}/settings/trakt-history` : null
    );
  const { data: traktWatchlistStatus, mutate: revalidateTraktWatchlistStatus } =
    useSWR<TraktWatchlistStatusResponse>(
      user ? `/api/v1/user/${user?.id}/settings/trakt-watchlist` : null
    );
  const { data: googleSheetsStatus, mutate: revalidateGoogleSheetsStatus } =
    useSWR<GoogleSheetsSyncStatusResponse>(
      user ? `/api/v1/user/${user?.id}/settings/google-sheets` : null
    );
  const hasMediaServerEmailFallback =
    !!user?.jellyfinUsername || !!user?.plexUsername;
  const requiresExplicitEmail =
    user?.id === 1
      ? !hasMediaServerEmailFallback
      : user?.userType !== UserType.JELLYFIN &&
        user?.userType !== UserType.EMBY;

  const UserGeneralSettingsSchema = Yup.object().shape({
    email: requiresExplicitEmail
      ? Yup.string()
          .test(
            'email',
            intl.formatMessage(messages.validationemailformat),
            (value) =>
              !value || validator.isEmail(value, { require_tld: false })
          )
          .required(intl.formatMessage(messages.validationemailrequired))
      : Yup.string().test(
          'email',
          intl.formatMessage(messages.validationemailformat),
          (value) => !value || validator.isEmail(value, { require_tld: false })
        ),
    discordId: Yup.string()
      .nullable()
      .test(
        'discord-id',
        intl.formatMessage(messages.validationDiscordId),
        (value) => !value || /^\d{17,19}$/.test(value)
      ),
  });

  useEffect(() => {
    setMovieQuotaEnabled(
      data?.movieQuotaLimit != undefined && data?.movieQuotaDays != undefined
    );
    setTvQuotaEnabled(
      data?.tvQuotaLimit != undefined && data?.tvQuotaDays != undefined
    );
  }, [data]);

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={500} />;
  }

  const formatDateTime = (value?: Date | string | null) => {
    if (!value) {
      return '—';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '—';
    }

    return `${intl.formatDate(date, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })} ${intl.formatTime(date, {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  };

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.general),
          intl.formatMessage(globalMessages.usersettings),
        ]}
      />
      <div className="mb-6">
        <h3 className="heading">
          {intl.formatMessage(messages.generalsettings)}
        </h3>
      </div>
      <Formik
        initialValues={{
          displayName: data?.username !== user?.email ? data?.username : '',
          email: data?.email?.includes('@') ? data.email : '',
          discordId: data?.discordId ?? '',
          locale: data?.locale,
          discoverRegion: data?.discoverRegion,
          streamingRegion: data?.streamingRegion,
          originalLanguage: data?.originalLanguage,
          movieQuotaLimit: data?.movieQuotaLimit,
          movieQuotaDays: data?.movieQuotaDays,
          tvQuotaLimit: data?.tvQuotaLimit,
          tvQuotaDays: data?.tvQuotaDays,
          watchlistSyncMovies: data?.watchlistSyncMovies,
          watchlistSyncTv: data?.watchlistSyncTv,
          hideWatched: data?.hideWatched,
          googleSheetsWatchlistSyncEnabled:
            data?.googleSheetsWatchlistSyncEnabled,
          googleSheetsWatchedSyncEnabled: data?.googleSheetsWatchedSyncEnabled,
          traktHistorySyncEnabled: data?.traktHistorySyncEnabled,
          traktWatchlistSyncEnabled: data?.traktWatchlistSyncEnabled,
        }}
        validationSchema={UserGeneralSettingsSchema}
        enableReinitialize
        onSubmit={async (values) => {
          try {
            await axios.post(`/api/v1/user/${user?.id}/settings/main`, {
              username: values.displayName,
              email:
                values.email || user?.jellyfinUsername || user?.plexUsername,
              discordId: values.discordId,
              locale: values.locale,
              discoverRegion: values.discoverRegion,
              streamingRegion: values.streamingRegion,
              originalLanguage: values.originalLanguage,
              movieQuotaLimit: movieQuotaEnabled
                ? values.movieQuotaLimit
                : null,
              movieQuotaDays: movieQuotaEnabled ? values.movieQuotaDays : null,
              tvQuotaLimit: tvQuotaEnabled ? values.tvQuotaLimit : null,
              tvQuotaDays: tvQuotaEnabled ? values.tvQuotaDays : null,
              watchlistSyncMovies: values.watchlistSyncMovies,
              watchlistSyncTv: values.watchlistSyncTv,
              hideWatched: values.hideWatched,
              googleSheetsWatchlistSyncEnabled:
                values.googleSheetsWatchlistSyncEnabled,
              googleSheetsWatchedSyncEnabled:
                values.googleSheetsWatchedSyncEnabled,
              traktHistorySyncEnabled: values.traktHistorySyncEnabled,
              traktWatchlistSyncEnabled: values.traktWatchlistSyncEnabled,
            });

            if (currentUser?.id === user?.id && setLocale) {
              setLocale(
                (values.locale
                  ? values.locale
                  : currentSettings.locale) as AvailableLocale
              );
            }

            addToast(intl.formatMessage(messages.toastSettingsSuccess), {
              autoDismiss: true,
              appearance: 'success',
            });
          } catch (e) {
            if (e?.response?.data?.message === ApiErrorCode.InvalidEmail) {
              if (values.email) {
                addToast(
                  intl.formatMessage(messages.toastSettingsFailureEmail),
                  {
                    autoDismiss: true,
                    appearance: 'error',
                  }
                );
              } else {
                addToast(
                  intl.formatMessage(messages.toastSettingsFailureEmailEmpty),
                  {
                    autoDismiss: true,
                    appearance: 'error',
                  }
                );
              }
            } else {
              addToast(intl.formatMessage(messages.toastSettingsFailure), {
                autoDismiss: true,
                appearance: 'error',
              });
            }
          } finally {
            revalidate();
            revalidateGoogleSheetsStatus();
            revalidateUser();
            revalidateTraktHistoryStatus();
          }
        }}
      >
        {({
          errors,
          touched,
          isSubmitting,
          isValid,
          values,
          setFieldValue,
        }) => {
          return (
            <Form className="section">
              <div className="form-row">
                <label className="text-label">
                  {intl.formatMessage(messages.accounttype)}
                </label>
                <div className="mb-1 text-sm font-medium leading-5 text-gray-400 sm:mt-2">
                  <div className="flex max-w-lg items-center">
                    {user?.userType === UserType.PLEX ? (
                      <Badge badgeType="warning">
                        {intl.formatMessage(messages.plexuser)}
                      </Badge>
                    ) : user?.userType === UserType.LOCAL ? (
                      <Badge badgeType="default">
                        {intl.formatMessage(messages.localuser)}
                      </Badge>
                    ) : user?.userType === UserType.EMBY ? (
                      <Badge badgeType="success">
                        {intl.formatMessage(messages.mediaServerUser, {
                          mediaServerName: 'Emby',
                        })}
                      </Badge>
                    ) : user?.userType === UserType.JELLYFIN ? (
                      <Badge badgeType="default">
                        {intl.formatMessage(messages.mediaServerUser, {
                          mediaServerName: 'Jellyfin',
                        })}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="form-row">
                <label className="text-label">
                  {intl.formatMessage(messages.role)}
                </label>
                <div className="mb-1 text-sm font-medium leading-5 text-gray-400 sm:mt-2">
                  <div className="flex max-w-lg items-center">
                    {user?.id === 1
                      ? intl.formatMessage(messages.owner)
                      : hasPermission(Permission.ADMIN)
                        ? intl.formatMessage(messages.admin)
                        : intl.formatMessage(messages.user)}
                  </div>
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="displayName" className="text-label">
                  {intl.formatMessage(messages.displayName)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field
                      id="displayName"
                      name="displayName"
                      type="text"
                      placeholder={
                        user?.jellyfinUsername ||
                        user?.plexUsername ||
                        user?.email
                      }
                    />
                  </div>
                  {errors.displayName &&
                    touched.displayName &&
                    typeof errors.displayName === 'string' && (
                      <div className="error">{errors.displayName}</div>
                    )}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="email" className="text-label">
                  {intl.formatMessage(messages.email)}
                  {user?.warnings.find((w) => w === 'userEmailRequired') && (
                    <span className="label-required">*</span>
                  )}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field
                      id="email"
                      name="email"
                      type="text"
                      placeholder="example@domain.com"
                      disabled={user?.plexUsername}
                      className={
                        user?.warnings.find((w) => w === 'userEmailRequired')
                          ? 'border-2 border-red-400 focus:border-blue-600'
                          : ''
                      }
                    />
                  </div>
                  {errors.email && touched.email && (
                    <div className="error">{errors.email}</div>
                  )}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="discordId" className="text-label">
                  {intl.formatMessage(messages.discordId)}
                  {currentUser?.id === user?.id && (
                    <span className="label-tip">
                      {intl.formatMessage(messages.discordIdTip, {
                        FindDiscordIdLink: (msg: React.ReactNode) => (
                          <a
                            href="https://support.discord.com/hc/en-us/articles/206346498-Where-can-I-find-my-User-Server-Message-ID-"
                            target="_blank"
                            rel="noreferrer"
                          >
                            {msg}
                          </a>
                        ),
                      })}
                    </span>
                  )}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field id="discordId" name="discordId" type="text" />
                  </div>
                  {errors.discordId &&
                    touched.discordId &&
                    typeof errors.discordId === 'string' && (
                      <div className="error">{errors.discordId}</div>
                    )}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="locale" className="text-label">
                  {intl.formatMessage(messages.applanguage)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field as="select" id="locale" name="locale">
                      <option value="" lang={locale}>
                        {intl.formatMessage(messages.languageDefault, {
                          language:
                            availableLanguages[currentSettings.locale].display,
                        })}
                      </option>
                      {(
                        Object.keys(
                          availableLanguages
                        ) as (keyof typeof availableLanguages)[]
                      ).map((key) => (
                        <option
                          key={key}
                          value={availableLanguages[key].code}
                          lang={availableLanguages[key].code}
                        >
                          {availableLanguages[key].display}
                        </option>
                      ))}
                    </Field>
                  </div>
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="discoverRegion" className="text-label">
                  <span>{intl.formatMessage(messages.discoverRegion)}</span>
                  <span className="label-tip">
                    {intl.formatMessage(messages.discoverRegionTip)}
                  </span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field relative z-[22]">
                    <RegionSelector
                      name="discoverRegion"
                      value={values.discoverRegion ?? ''}
                      isUserSetting
                      onChange={setFieldValue}
                    />
                  </div>
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="originalLanguage" className="text-label">
                  <span>{intl.formatMessage(messages.originallanguage)}</span>
                  <span className="label-tip">
                    {intl.formatMessage(messages.originallanguageTip)}
                  </span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field relative z-[21]">
                    <LanguageSelector
                      setFieldValue={setFieldValue}
                      serverValue={currentSettings.originalLanguage}
                      value={values.originalLanguage}
                      isUserSettings
                    />
                  </div>
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="streamingRegionTip" className="text-label">
                  <span>{intl.formatMessage(messages.streamingRegion)}</span>
                  <span className="label-tip">
                    {intl.formatMessage(messages.streamingRegionTip)}
                  </span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field relative z-20">
                    <RegionSelector
                      name="streamingRegion"
                      value={values.streamingRegion || ''}
                      isUserSetting
                      onChange={setFieldValue}
                      regionType="streaming"
                      disableAll
                    />
                  </div>
                </div>
              </div>
              {currentHasPermission(Permission.MANAGE_USERS) &&
                !hasPermission(Permission.MANAGE_USERS) && (
                  <>
                    <div className="form-row">
                      <label htmlFor="movieQuotaLimit" className="text-label">
                        <span>
                          {intl.formatMessage(messages.movierequestlimit)}
                        </span>
                      </label>
                      <div className="form-input-area">
                        <div className="flex flex-col">
                          <div className="mb-4 flex items-center">
                            <input
                              type="checkbox"
                              checked={movieQuotaEnabled}
                              onChange={() => setMovieQuotaEnabled((s) => !s)}
                            />
                            <span className="ml-2 text-gray-300">
                              {intl.formatMessage(messages.enableOverride)}
                            </span>
                          </div>
                          <QuotaSelector
                            isDisabled={!movieQuotaEnabled}
                            dayFieldName="movieQuotaDays"
                            limitFieldName="movieQuotaLimit"
                            mediaType="movie"
                            onChange={setFieldValue}
                            defaultDays={values.movieQuotaDays}
                            defaultLimit={values.movieQuotaLimit}
                            dayOverride={
                              !movieQuotaEnabled
                                ? data?.globalMovieQuotaDays
                                : undefined
                            }
                            limitOverride={
                              !movieQuotaEnabled
                                ? data?.globalMovieQuotaLimit
                                : undefined
                            }
                          />
                        </div>
                      </div>
                    </div>
                    <div className="form-row">
                      <label htmlFor="tvQuotaLimit" className="text-label">
                        <span>
                          {intl.formatMessage(messages.seriesrequestlimit)}
                        </span>
                      </label>
                      <div className="form-input-area">
                        <div className="flex flex-col">
                          <div className="mb-4 flex items-center">
                            <input
                              type="checkbox"
                              checked={tvQuotaEnabled}
                              onChange={() => setTvQuotaEnabled((s) => !s)}
                            />
                            <span className="ml-2 text-gray-300">
                              {intl.formatMessage(messages.enableOverride)}
                            </span>
                          </div>
                          <QuotaSelector
                            isDisabled={!tvQuotaEnabled}
                            dayFieldName="tvQuotaDays"
                            limitFieldName="tvQuotaLimit"
                            mediaType="tv"
                            onChange={setFieldValue}
                            defaultDays={values.tvQuotaDays}
                            defaultLimit={values.tvQuotaLimit}
                            dayOverride={
                              !tvQuotaEnabled
                                ? data?.globalTvQuotaDays
                                : undefined
                            }
                            limitOverride={
                              !tvQuotaEnabled
                                ? data?.globalTvQuotaLimit
                                : undefined
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              {hasPermission(
                [Permission.AUTO_REQUEST, Permission.AUTO_REQUEST_MOVIE],
                { type: 'or' }
              ) &&
                user?.userType === UserType.PLEX && (
                  <div className="form-row">
                    <label
                      htmlFor="watchlistSyncMovies"
                      className="checkbox-label"
                    >
                      <span>
                        {intl.formatMessage(messages.plexwatchlistsyncmovies)}
                      </span>
                      <span className="label-tip">
                        {intl.formatMessage(
                          messages.plexwatchlistsyncmoviestip,
                          {
                            PlexWatchlistSupportLink: (
                              msg: React.ReactNode
                            ) => (
                              <a
                                href="https://support.plex.tv/articles/universal-watchlist/"
                                className="text-white transition duration-300 hover:underline"
                                target="_blank"
                                rel="noreferrer"
                              >
                                {msg}
                              </a>
                            ),
                          }
                        )}
                      </span>
                    </label>
                    <div className="form-input-area">
                      <Field
                        type="checkbox"
                        id="watchlistSyncMovies"
                        name="watchlistSyncMovies"
                        onChange={() => {
                          setFieldValue(
                            'watchlistSyncMovies',
                            !values.watchlistSyncMovies
                          );
                        }}
                      />
                    </div>
                  </div>
                )}
              {hasPermission(
                [Permission.AUTO_REQUEST, Permission.AUTO_REQUEST_TV],
                { type: 'or' }
              ) &&
                user?.userType === UserType.PLEX && (
                  <div className="form-row">
                    <label htmlFor="watchlistSyncTv" className="checkbox-label">
                      <span>
                        {intl.formatMessage(messages.plexwatchlistsyncseries)}
                      </span>
                      <span className="label-tip">
                        {intl.formatMessage(
                          messages.plexwatchlistsyncseriestip,
                          {
                            PlexWatchlistSupportLink: (
                              msg: React.ReactNode
                            ) => (
                              <a
                                href="https://support.plex.tv/articles/universal-watchlist/"
                                className="text-white transition duration-300 hover:underline"
                                target="_blank"
                                rel="noreferrer"
                              >
                                {msg}
                              </a>
                            ),
                          }
                        )}
                      </span>
                    </label>
                    <div className="form-input-area">
                      <Field
                        type="checkbox"
                        id="watchlistSyncTv"
                        name="watchlistSyncTv"
                        onChange={() => {
                          setFieldValue(
                            'watchlistSyncTv',
                            !values.watchlistSyncTv
                          );
                        }}
                      />
                    </div>
                  </div>
                )}
              {(currentSettings.traktEnabled || !!user?.traktUsername) && (
                <>
                  <div className="form-row">
                    <label htmlFor="hideWatched" className="checkbox-label">
                      <span>{intl.formatMessage(messages.hideWatched)}</span>
                      <span className="label-tip">
                        {intl.formatMessage(messages.hideWatchedTip)}
                      </span>
                    </label>
                    <div className="form-input-area">
                      <input
                        type="checkbox"
                        id="hideWatched"
                        name="hideWatched"
                        checked={!!values.hideWatched}
                        onChange={() => {
                          setFieldValue('hideWatched', !values.hideWatched);
                        }}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <label
                      htmlFor="traktWatchlistSyncEnabled"
                      className="checkbox-label"
                    >
                      <span>
                        {intl.formatMessage(messages.traktWatchlistSync)}
                      </span>
                      <span className="label-tip">
                        {intl.formatMessage(messages.traktWatchlistSyncTip)}
                      </span>
                    </label>
                    <div className="form-input-area">
                      <input
                        type="checkbox"
                        id="traktWatchlistSyncEnabled"
                        name="traktWatchlistSyncEnabled"
                        checked={!!values.traktWatchlistSyncEnabled}
                        onChange={() => {
                          setFieldValue(
                            'traktWatchlistSyncEnabled',
                            !values.traktWatchlistSyncEnabled
                          );
                        }}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="text-label" />
                    <div className="form-input-area">
                      <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
                        <div className="text-sm text-gray-200">
                          {intl.formatMessage(messages.traktWatchlistImported, {
                            count: traktWatchlistStatus?.totalItems ?? 0,
                          })}
                        </div>
                        <div className="mt-2 text-sm text-gray-400">
                          {traktWatchlistStatus?.traktConnected
                            ? intl.formatMessage(
                                messages.traktWatchlistStatusLastSuccess
                              ) +
                              ': ' +
                              (traktWatchlistStatus?.lastSuccessfulSyncAt
                                ? `${intl.formatDate(
                                    traktWatchlistStatus.lastSuccessfulSyncAt,
                                    {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                    }
                                  )} ${intl.formatTime(
                                    traktWatchlistStatus.lastSuccessfulSyncAt,
                                    {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    }
                                  )}`
                                : '—')
                            : intl.formatMessage(
                                messages.traktWatchlistStatusConnected
                              )}
                        </div>
                        <div className="mt-1 text-sm text-gray-400">
                          {intl.formatMessage(
                            messages.traktWatchlistStatusLastAttempt
                          )}
                          :{' '}
                          {traktWatchlistStatus?.lastAttemptedSyncAt
                            ? `${intl.formatDate(
                                traktWatchlistStatus.lastAttemptedSyncAt,
                                {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                }
                              )} ${intl.formatTime(
                                traktWatchlistStatus.lastAttemptedSyncAt,
                                {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                }
                              )}`
                            : '—'}
                        </div>
                        <div className="mt-1 text-sm text-gray-400">
                          {intl.formatMessage(
                            messages.traktWatchlistStatusLastError
                          )}
                          : {traktWatchlistStatus?.lastError ?? '—'}
                        </div>
                        <div className="mt-4">
                          <Button
                            buttonType="ghost"
                            type="button"
                            disabled={!traktWatchlistStatus?.traktConnected}
                            onClick={async () => {
                              try {
                                const response =
                                  await axios.post<TraktWatchlistStatusResponse>(
                                    `/api/v1/user/${user?.id}/settings/trakt-watchlist/sync`
                                  );
                                addToast(
                                  `${intl.formatMessage(
                                    messages.traktWatchlistSyncSuccess
                                  )} ${intl.formatMessage(
                                    messages.traktWatchlistImported,
                                    {
                                      count: response.data.totalItems ?? 0,
                                    }
                                  )}`,
                                  {
                                    appearance: 'success',
                                    autoDismiss: true,
                                  }
                                );
                                revalidateTraktWatchlistStatus(
                                  response.data,
                                  false
                                );
                              } catch {
                                addToast(
                                  intl.formatMessage(
                                    messages.traktWatchlistSyncFailure
                                  ),
                                  {
                                    appearance: 'error',
                                    autoDismiss: true,
                                  }
                                );
                              }
                            }}
                          >
                            <ArrowPathIcon className="mr-2 h-5 w-5" />
                            <span>
                              {intl.formatMessage(
                                messages.traktWatchlistSyncNow
                              )}
                            </span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="form-row">
                    <label
                      htmlFor="traktHistorySyncEnabled"
                      className="checkbox-label"
                    >
                      <span>
                        {intl.formatMessage(messages.traktHistorySync)}
                      </span>
                      <span className="label-tip">
                        {intl.formatMessage(messages.traktHistorySyncTip)}
                      </span>
                    </label>
                    <div className="form-input-area">
                      <input
                        type="checkbox"
                        id="traktHistorySyncEnabled"
                        name="traktHistorySyncEnabled"
                        checked={!!values.traktHistorySyncEnabled}
                        onChange={() => {
                          setFieldValue(
                            'traktHistorySyncEnabled',
                            !values.traktHistorySyncEnabled
                          );
                        }}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="text-label" />
                    <div className="form-input-area">
                      <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
                        <div className="text-sm text-gray-200">
                          {intl.formatMessage(messages.traktHistoryImported, {
                            count: traktHistoryStatus?.totalItems ?? 0,
                          })}
                        </div>
                        <div className="mt-2 text-sm text-gray-400">
                          {traktHistoryStatus?.traktConnected
                            ? intl.formatMessage(
                                messages.traktHistoryStatusLastSuccess
                              ) +
                              ': ' +
                              formatDateTime(
                                traktHistoryStatus?.lastSuccessfulSyncAt
                              )
                            : intl.formatMessage(
                                messages.traktHistoryStatusConnected
                              )}
                        </div>
                        <div className="mt-1 text-sm text-gray-400">
                          {intl.formatMessage(
                            messages.traktHistoryStatusLastAttempt
                          )}
                          :{' '}
                          {formatDateTime(
                            traktHistoryStatus?.lastAttemptedSyncAt
                          )}
                        </div>
                        <div className="mt-1 text-sm text-gray-400">
                          {intl.formatMessage(
                            messages.traktHistoryStatusLatest
                          )}
                          :{' '}
                          {formatDateTime(
                            traktHistoryStatus?.latestImportedWatchedAt
                          )}
                        </div>
                        <div className="mt-1 text-sm text-gray-400">
                          {intl.formatMessage(messages.traktWatchStateStatus)}:{' '}
                          {traktHistoryStatus?.watchStateBootstrapped
                            ? intl.formatMessage(
                                messages.traktWatchStateStatusReady
                              )
                            : intl.formatMessage(
                                messages.traktWatchStateStatusPending
                              )}
                        </div>
                        <div className="mt-1 text-sm text-gray-400">
                          {intl.formatMessage(
                            messages.traktWatchStateStatusLastSuccess
                          )}
                          :{' '}
                          {formatDateTime(
                            traktHistoryStatus?.watchStateLastSuccessfulSyncAt
                          )}
                        </div>
                        <div className="mt-1 text-sm text-gray-400">
                          {intl.formatMessage(
                            messages.traktWatchStateStatusLastAttempt
                          )}
                          :{' '}
                          {formatDateTime(
                            traktHistoryStatus?.watchStateLastAttemptedSyncAt
                          )}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <Button
                            buttonType="ghost"
                            type="button"
                            disabled={
                              !traktHistoryStatus?.traktConnected ||
                              !values.traktHistorySyncEnabled
                            }
                            onClick={async () => {
                              try {
                                const response =
                                  await axios.post<TraktHistoryStatusResponse>(
                                    `/api/v1/user/${user?.id}/settings/trakt-history/sync`
                                  );
                                addToast(
                                  `${intl.formatMessage(
                                    messages.traktHistorySyncSuccess
                                  )} ${intl.formatMessage(
                                    messages.traktHistoryImported,
                                    {
                                      count: response.data.totalItems ?? 0,
                                    }
                                  )}`,
                                  {
                                    appearance: 'success',
                                    autoDismiss: true,
                                  }
                                );
                                revalidateTraktHistoryStatus(
                                  response.data,
                                  false
                                );
                              } catch {
                                addToast(
                                  intl.formatMessage(
                                    messages.traktHistorySyncFailure
                                  ),
                                  {
                                    appearance: 'error',
                                    autoDismiss: true,
                                  }
                                );
                              }
                            }}
                          >
                            <ArrowPathIcon className="mr-2 h-5 w-5" />
                            <span>
                              {intl.formatMessage(messages.traktHistorySyncNow)}
                            </span>
                          </Button>
                          <Button
                            buttonType="ghost"
                            type="button"
                            disabled={!traktHistoryStatus?.traktConnected}
                            onClick={async () => {
                              try {
                                const response =
                                  await axios.post<TraktHistoryStatusResponse>(
                                    `/api/v1/user/${user?.id}/settings/trakt-history/sync?forceFull=1`
                                  );
                                addToast(
                                  `${intl.formatMessage(
                                    messages.traktHistorySyncSuccess
                                  )} ${intl.formatMessage(
                                    messages.traktHistoryImported,
                                    {
                                      count: response.data.totalItems ?? 0,
                                    }
                                  )}`,
                                  {
                                    appearance: 'success',
                                    autoDismiss: true,
                                  }
                                );
                                revalidateTraktHistoryStatus(
                                  response.data,
                                  false
                                );
                              } catch {
                                addToast(
                                  intl.formatMessage(
                                    messages.traktHistorySyncFailure
                                  ),
                                  {
                                    appearance: 'error',
                                    autoDismiss: true,
                                  }
                                );
                              }
                            }}
                          >
                            <ArrowPathIcon className="mr-2 h-5 w-5" />
                            <span>
                              {intl.formatMessage(
                                messages.traktHistoryForceResync
                              )}
                            </span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
              {(currentSettings.googleSheetsEnabled ||
                !!googleSheetsStatus?.linked) && (
                <>
                  <div className="form-row">
                    <label
                      htmlFor="googleSheetsWatchlistSyncEnabled"
                      className="checkbox-label"
                    >
                      <span>
                        {intl.formatMessage(messages.googleSheetsWatchlistSync)}
                      </span>
                      <span className="label-tip">
                        {intl.formatMessage(
                          messages.googleSheetsWatchlistSyncTip
                        )}
                      </span>
                    </label>
                    <div className="form-input-area">
                      <input
                        type="checkbox"
                        id="googleSheetsWatchlistSyncEnabled"
                        name="googleSheetsWatchlistSyncEnabled"
                        checked={!!values.googleSheetsWatchlistSyncEnabled}
                        onChange={() => {
                          setFieldValue(
                            'googleSheetsWatchlistSyncEnabled',
                            !values.googleSheetsWatchlistSyncEnabled
                          );
                        }}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="text-label" />
                    <div className="form-input-area">
                      <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
                        <div className="mt-2 text-sm text-gray-400">
                          {googleSheetsStatus?.linked && user?.traktUsername
                            ? `${intl.formatMessage(
                                messages.googleSheetsWatchlistStatusLastSuccess
                              )}: ${formatDateTime(
                                googleSheetsStatus?.watchlist
                                  ?.lastSuccessfulSyncAt
                              )}`
                            : intl.formatMessage(
                                messages.googleSheetsWatchlistStatusConnected
                              )}
                        </div>
                        <div className="mt-1 text-sm text-gray-400">
                          {intl.formatMessage(
                            messages.googleSheetsWatchlistSheet
                          )}
                          :{' '}
                          {googleSheetsStatus?.watchlist?.spreadsheetUrl ? (
                            <a
                              href={googleSheetsStatus.watchlist.spreadsheetUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-white transition duration-300 hover:underline"
                            >
                              {googleSheetsStatus.watchlist.spreadsheetId}
                            </a>
                          ) : (
                            '—'
                          )}
                        </div>
                        <div className="mt-1 text-sm text-gray-400">
                          {intl.formatMessage(
                            messages.googleSheetsWatchlistStatusLastAttempt
                          )}
                          :{' '}
                          {formatDateTime(
                            googleSheetsStatus?.watchlist?.lastAttemptedSyncAt
                          )}
                        </div>
                        <div className="mt-1 text-sm text-gray-400">
                          {intl.formatMessage(
                            messages.googleSheetsWatchlistStatusLastError
                          )}
                          : {googleSheetsStatus?.watchlist?.lastError ?? '—'}
                        </div>
                        <div className="mt-4">
                          <Button
                            buttonType="ghost"
                            type="button"
                            disabled={
                              !googleSheetsStatus?.linked ||
                              !user?.traktUsername ||
                              !values.googleSheetsWatchlistSyncEnabled
                            }
                            onClick={async () => {
                              try {
                                const response =
                                  await axios.post<GoogleSheetsSyncStatusResponse>(
                                    `/api/v1/user/${user?.id}/settings/google-sheets/watchlist/sync`
                                  );
                                addToast(
                                  intl.formatMessage(
                                    messages.googleSheetsWatchlistSyncSuccess
                                  ),
                                  {
                                    appearance: 'success',
                                    autoDismiss: true,
                                  }
                                );
                                revalidateGoogleSheetsStatus(
                                  response.data,
                                  false
                                );
                                revalidateTraktWatchlistStatus();
                              } catch {
                                addToast(
                                  intl.formatMessage(
                                    messages.googleSheetsWatchlistSyncFailure
                                  ),
                                  {
                                    appearance: 'error',
                                    autoDismiss: true,
                                  }
                                );
                              }
                            }}
                          >
                            <ArrowPathIcon className="mr-2 h-5 w-5" />
                            <span>
                              {intl.formatMessage(
                                messages.googleSheetsWatchlistSyncNow
                              )}
                            </span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="form-row">
                    <label
                      htmlFor="googleSheetsWatchedSyncEnabled"
                      className="checkbox-label"
                    >
                      <span>
                        {intl.formatMessage(messages.googleSheetsWatchedSync)}
                      </span>
                      <span className="label-tip">
                        {intl.formatMessage(
                          messages.googleSheetsWatchedSyncTip
                        )}
                      </span>
                    </label>
                    <div className="form-input-area">
                      <input
                        type="checkbox"
                        id="googleSheetsWatchedSyncEnabled"
                        name="googleSheetsWatchedSyncEnabled"
                        checked={!!values.googleSheetsWatchedSyncEnabled}
                        onChange={() => {
                          setFieldValue(
                            'googleSheetsWatchedSyncEnabled',
                            !values.googleSheetsWatchedSyncEnabled
                          );
                        }}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="text-label" />
                    <div className="form-input-area">
                      <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
                        <div className="mt-2 text-sm text-gray-400">
                          {googleSheetsStatus?.linked && user?.traktUsername
                            ? `${intl.formatMessage(
                                messages.googleSheetsWatchedStatusLastSuccess
                              )}: ${formatDateTime(
                                googleSheetsStatus?.watched
                                  ?.lastSuccessfulSyncAt
                              )}`
                            : intl.formatMessage(
                                messages.googleSheetsWatchedStatusConnected
                              )}
                        </div>
                        <div className="mt-1 text-sm text-gray-400">
                          {intl.formatMessage(
                            messages.googleSheetsWatchedSheet
                          )}
                          :{' '}
                          {googleSheetsStatus?.watched?.spreadsheetUrl ? (
                            <a
                              href={googleSheetsStatus.watched.spreadsheetUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-white transition duration-300 hover:underline"
                            >
                              {googleSheetsStatus.watched.spreadsheetId}
                            </a>
                          ) : (
                            '—'
                          )}
                        </div>
                        <div className="mt-1 text-sm text-gray-400">
                          {intl.formatMessage(
                            messages.googleSheetsWatchedStatusLastAttempt
                          )}
                          :{' '}
                          {formatDateTime(
                            googleSheetsStatus?.watched?.lastAttemptedSyncAt
                          )}
                        </div>
                        <div className="mt-1 text-sm text-gray-400">
                          {intl.formatMessage(
                            messages.googleSheetsWatchedStatusLastError
                          )}
                          : {googleSheetsStatus?.watched?.lastError ?? '—'}
                        </div>
                        <div className="mt-4">
                          <Button
                            buttonType="ghost"
                            type="button"
                            disabled={
                              !googleSheetsStatus?.linked ||
                              !user?.traktUsername ||
                              !values.googleSheetsWatchedSyncEnabled
                            }
                            onClick={async () => {
                              try {
                                const response =
                                  await axios.post<GoogleSheetsSyncStatusResponse>(
                                    `/api/v1/user/${user?.id}/settings/google-sheets/watched/sync`
                                  );
                                addToast(
                                  intl.formatMessage(
                                    messages.googleSheetsWatchedSyncSuccess
                                  ),
                                  {
                                    appearance: 'success',
                                    autoDismiss: true,
                                  }
                                );
                                revalidateGoogleSheetsStatus(
                                  response.data,
                                  false
                                );
                                revalidateTraktHistoryStatus();
                              } catch {
                                addToast(
                                  intl.formatMessage(
                                    messages.googleSheetsWatchedSyncFailure
                                  ),
                                  {
                                    appearance: 'error',
                                    autoDismiss: true,
                                  }
                                );
                              }
                            }}
                          >
                            <ArrowPathIcon className="mr-2 h-5 w-5" />
                            <span>
                              {intl.formatMessage(
                                messages.googleSheetsWatchedSyncNow
                              )}
                            </span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
              <div className="actions">
                <div className="flex justify-end">
                  <span className="ml-3 inline-flex rounded-md shadow-sm">
                    <Button
                      buttonType="primary"
                      type="submit"
                      disabled={isSubmitting || !isValid}
                    >
                      <ArrowDownOnSquareIcon />
                      <span>
                        {isSubmitting
                          ? intl.formatMessage(globalMessages.saving)
                          : intl.formatMessage(globalMessages.save)}
                      </span>
                    </Button>
                  </span>
                </div>
              </div>
            </Form>
          );
        }}
      </Formik>
    </>
  );
};

export default UserGeneralSettings;
