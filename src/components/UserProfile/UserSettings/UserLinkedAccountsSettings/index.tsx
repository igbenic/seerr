import EmbyLogo from '@app/assets/services/emby-icon-only.svg';
import JellyfinLogo from '@app/assets/services/jellyfin-icon.svg';
import PlexLogo from '@app/assets/services/plex.svg';
import TraktLogo from '@app/assets/services/trakt.svg';
import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import ConfirmButton from '@app/components/Common/ConfirmButton';
import Dropdown from '@app/components/Common/Dropdown';
import PageTitle from '@app/components/Common/PageTitle';
import useSettings from '@app/hooks/useSettings';
import { Permission, UserType, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import { withBasePath } from '@app/utils/basePath';
import defineMessages from '@app/utils/defineMessages';
import PlexOAuth from '@app/utils/plex';
import { FolderIcon } from '@heroicons/react/24/outline';
import { TrashIcon } from '@heroicons/react/24/solid';
import { MediaServerType } from '@server/constants/server';
import type { GoogleSheetsAuthStatusResponse } from '@server/interfaces/api/googleSheetsInterfaces';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import ImdbImportModal from './ImdbImportModal';
import LinkJellyfinModal from './LinkJellyfinModal';

const messages = defineMessages(
  'components.UserProfile.UserSettings.UserLinkedAccountsSettings',
  {
    linkedAccounts: 'Linked Accounts',
    linkedAccountsHint:
      'These external accounts are linked to your {applicationName} account.',
    noLinkedAccounts:
      'You do not have any external accounts linked to your account.',
    noPermissionDescription:
      "You do not have permission to modify this user's linked accounts.",
    plexErrorUnauthorized: 'Unable to connect to Plex using your credentials',
    plexErrorExists: 'This account is already linked to a Plex user',
    errorUnknown: 'An unknown error occurred',
    deleteFailed: 'Unable to delete linked account.',
    traktConnected: 'Trakt account connected successfully.',
    traktDisconnected: 'Trakt account disconnected.',
    traktAlreadyLinked: 'That Trakt account is already linked to another user.',
    traktInvalidState:
      'The Trakt sign-in callback could not be validated. Please try again.',
    traktError: 'Unable to complete the Trakt connection.',
    googleSheetsConnected: 'Google Drive account connected successfully.',
    googleSheetsDisconnected: 'Google Drive account disconnected.',
    googleSheetsAlreadyLinked:
      'That Google Drive account is already linked to another user.',
    googleSheetsInvalidState:
      'The Google Drive sign-in callback could not be validated. Please try again.',
    googleSheetsError: 'Unable to complete the Google Drive connection.',
    imdbImport: 'Import IMDb CSV',
  }
);

const plexOAuth = new PlexOAuth();

enum LinkedAccountType {
  Plex = 'Plex',
  Jellyfin = 'Jellyfin',
  Emby = 'Emby',
  Trakt = 'Trakt',
  GoogleSheets = 'Google Drive',
}

type LinkedAccount = {
  type: LinkedAccountType;
  username: string;
};

const UserLinkedAccountsSettings = () => {
  const intl = useIntl();
  const settings = useSettings();
  const router = useRouter();
  const { user: currentUser } = useUser();
  const {
    user,
    hasPermission,
    revalidate: revalidateUser,
  } = useUser({ id: Number(router.query.userId) });
  const { data: passwordInfo } = useSWR<{ hasPassword: boolean }>(
    user ? `/api/v1/user/${user?.id}/settings/password` : null
  );
  const { data: googleSheetsAuthStatus, mutate: revalidateGoogleSheetsStatus } =
    useSWR<GoogleSheetsAuthStatusResponse>(
      currentUser?.id === user?.id ? '/api/v1/auth/google-sheets/status' : null
    );
  const [showImdbImportModal, setShowImdbImportModal] = useState(false);
  const [showJellyfinModal, setShowJellyfinModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applicationName = settings.currentSettings.applicationTitle;
  const traktResult =
    typeof router.query.trakt === 'string' ? router.query.trakt : undefined;
  const googleSheetsResult =
    typeof router.query.googleSheets === 'string'
      ? router.query.googleSheets
      : undefined;

  const accounts: LinkedAccount[] = useMemo(() => {
    const accounts: LinkedAccount[] = [];
    if (!user) return accounts;
    if (user.userType === UserType.PLEX && user.plexUsername)
      accounts.push({
        type: LinkedAccountType.Plex,
        username: user.plexUsername,
      });
    if (user.userType === UserType.EMBY && user.jellyfinUsername)
      accounts.push({
        type: LinkedAccountType.Emby,
        username: user.jellyfinUsername,
      });
    if (user.userType === UserType.JELLYFIN && user.jellyfinUsername)
      accounts.push({
        type: LinkedAccountType.Jellyfin,
        username: user.jellyfinUsername,
      });
    if (user.traktUsername) {
      accounts.push({
        type: LinkedAccountType.Trakt,
        username: user.traktUsername,
      });
    }
    if (googleSheetsAuthStatus?.connected && googleSheetsAuthStatus.email) {
      accounts.push({
        type: LinkedAccountType.GoogleSheets,
        username: googleSheetsAuthStatus.email,
      });
    }
    return accounts;
  }, [googleSheetsAuthStatus, user]);

  const traktAlert = useMemo(() => {
    switch (traktResult) {
      case 'connected':
        return {
          title: intl.formatMessage(messages.traktConnected),
          type: 'info' as const,
        };
      case 'disconnected':
        return {
          title: intl.formatMessage(messages.traktDisconnected),
          type: 'info' as const,
        };
      case 'already-linked':
        return {
          title: intl.formatMessage(messages.traktAlreadyLinked),
          type: 'error' as const,
        };
      case 'invalid-state':
        return {
          title: intl.formatMessage(messages.traktInvalidState),
          type: 'error' as const,
        };
      case 'error':
      case 'not-configured':
        return {
          title: intl.formatMessage(messages.traktError),
          type: 'error' as const,
        };
      default:
        return null;
    }
  }, [intl, traktResult]);

  const googleSheetsAlert = useMemo(() => {
    switch (googleSheetsResult) {
      case 'connected':
        return {
          title: intl.formatMessage(messages.googleSheetsConnected),
          type: 'info' as const,
        };
      case 'disconnected':
        return {
          title: intl.formatMessage(messages.googleSheetsDisconnected),
          type: 'info' as const,
        };
      case 'already-linked':
        return {
          title: intl.formatMessage(messages.googleSheetsAlreadyLinked),
          type: 'error' as const,
        };
      case 'invalid-state':
        return {
          title: intl.formatMessage(messages.googleSheetsInvalidState),
          type: 'error' as const,
        };
      case 'error':
      case 'not-configured':
        return {
          title: intl.formatMessage(messages.googleSheetsError),
          type: 'error' as const,
        };
      default:
        return null;
    }
  }, [googleSheetsResult, intl]);

  const linkPlexAccount = async () => {
    setError(null);
    try {
      const authToken = await plexOAuth.login();
      await axios.post(
        `/api/v1/user/${user?.id}/settings/linked-accounts/plex`,
        {
          authToken,
        }
      );
      await revalidateUser();
    } catch (e) {
      switch (e?.response?.status) {
        case 401:
          setError(intl.formatMessage(messages.plexErrorUnauthorized));
          break;
        case 422:
          setError(intl.formatMessage(messages.plexErrorExists));
          break;
        default:
          setError(intl.formatMessage(messages.errorUnknown));
      }
    }
  };

  const linkable = [
    {
      name: 'Plex',
      action: () => {
        plexOAuth.preparePopup();
        setTimeout(() => linkPlexAccount(), 1500);
      },
      hide:
        settings.currentSettings.mediaServerType !== MediaServerType.PLEX ||
        accounts.some((a) => a.type === LinkedAccountType.Plex),
    },
    {
      name: 'Jellyfin',
      action: () => setShowJellyfinModal(true),
      hide:
        settings.currentSettings.mediaServerType !== MediaServerType.JELLYFIN ||
        accounts.some((a) => a.type === LinkedAccountType.Jellyfin),
    },
    {
      name: 'Emby',
      action: () => setShowJellyfinModal(true),
      hide:
        settings.currentSettings.mediaServerType !== MediaServerType.EMBY ||
        accounts.some((a) => a.type === LinkedAccountType.Emby),
    },
    {
      name: 'Trakt',
      action: () => {
        window.location.assign(
          withBasePath(
            `/api/v1/auth/trakt/connect?redirect=${encodeURIComponent(
              router.asPath
            )}`
          )
        );
      },
      hide:
        !settings.currentSettings.traktEnabled ||
        accounts.some((a) => a.type === LinkedAccountType.Trakt),
    },
    {
      name: 'Google Drive',
      action: () => {
        window.location.assign(
          withBasePath(
            `/api/v1/auth/google-sheets/connect?redirect=${encodeURIComponent(
              router.asPath
            )}`
          )
        );
      },
      hide:
        !settings.currentSettings.googleSheetsEnabled ||
        !!googleSheetsAuthStatus?.connected,
    },
  ].filter((l) => !l.hide);

  const deleteRequest = async (account: string) => {
    try {
      if (account === 'trakt') {
        await axios.delete('/api/v1/auth/trakt/disconnect');
      } else if (account === 'google-sheets') {
        await axios.delete('/api/v1/auth/google-sheets/disconnect');
      } else {
        await axios.delete(
          `/api/v1/user/${user?.id}/settings/linked-accounts/${account}`
        );
      }
    } catch {
      setError(intl.formatMessage(messages.deleteFailed));
    }

    await revalidateUser();
    if (currentUser?.id === user?.id) {
      await revalidateGoogleSheetsStatus();
    }
  };

  if (
    currentUser?.id !== user?.id &&
    hasPermission(Permission.ADMIN) &&
    currentUser?.id !== 1
  ) {
    return (
      <>
        <div className="mb-6">
          <h3 className="heading">
            {intl.formatMessage(messages.linkedAccounts)}
          </h3>
        </div>
        <Alert
          title={intl.formatMessage(messages.noPermissionDescription)}
          type="error"
        />
      </>
    );
  }

  const enableMediaServerUnlink = user?.id !== 1 && passwordInfo?.hasPassword;
  const enableGoogleSheetsUnlink = currentUser?.id === user?.id;
  const enableTraktUnlink = currentUser?.id === user?.id;

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.linkedAccounts),
          intl.formatMessage(globalMessages.usersettings),
          user?.displayName,
        ]}
      />
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h3 className="heading">
            {intl.formatMessage(messages.linkedAccounts)}
          </h3>
          <h6 className="description">
            {intl.formatMessage(messages.linkedAccountsHint, {
              applicationName,
            })}
          </h6>
        </div>
        {currentUser?.id === user?.id &&
          (!!user?.traktUsername || !!linkable.length) && (
            <div className="flex gap-2">
              {!!user?.traktUsername && (
                <Button
                  buttonType="ghost"
                  buttonSize="sm"
                  onClick={() => setShowImdbImportModal(true)}
                >
                  {intl.formatMessage(messages.imdbImport)}
                </Button>
              )}
              {!!linkable.length && (
                <Dropdown text="Link Account" buttonType="ghost">
                  {linkable.map(({ name, action }) => (
                    <Dropdown.Item key={name} onClick={action}>
                      {name}
                    </Dropdown.Item>
                  ))}
                </Dropdown>
              )}
            </div>
          )}
      </div>
      {traktAlert && <Alert title={traktAlert.title} type={traktAlert.type} />}
      {googleSheetsAlert && (
        <Alert title={googleSheetsAlert.title} type={googleSheetsAlert.type} />
      )}
      {error && <Alert title={error} type="error" />}
      {accounts.length ? (
        <ul className="space-y-4">
          {accounts.map((acct, i) => (
            <li
              key={i}
              className="flex items-center gap-4 overflow-hidden rounded-lg bg-gray-800/50 px-4 py-5 shadow ring-1 ring-gray-700 sm:p-6"
            >
              <div className="w-12">
                {acct.type === LinkedAccountType.Plex ? (
                  <div className="flex aspect-square h-full items-center justify-center rounded-full bg-neutral-800">
                    <PlexLogo className="w-9" />
                  </div>
                ) : acct.type === LinkedAccountType.Emby ? (
                  <EmbyLogo />
                ) : acct.type === LinkedAccountType.Trakt ? (
                  <TraktLogo />
                ) : acct.type === LinkedAccountType.GoogleSheets ? (
                  <div className="flex aspect-square h-full items-center justify-center rounded-full bg-neutral-800">
                    <FolderIcon className="w-7 text-white" />
                  </div>
                ) : (
                  <JellyfinLogo />
                )}
              </div>
              <div>
                <div className="truncate text-sm font-bold text-gray-300">
                  {acct.type}
                </div>
                <div className="text-xl font-semibold text-white">
                  {acct.username}
                </div>
              </div>
              <div className="flex-grow" />
              {((acct.type === LinkedAccountType.Trakt && enableTraktUnlink) ||
                (acct.type === LinkedAccountType.GoogleSheets &&
                  enableGoogleSheetsUnlink) ||
                (acct.type !== LinkedAccountType.Trakt &&
                  acct.type !== LinkedAccountType.GoogleSheets &&
                  enableMediaServerUnlink)) && (
                <ConfirmButton
                  onClick={() => {
                    deleteRequest(
                      acct.type === LinkedAccountType.Plex
                        ? 'plex'
                        : acct.type === LinkedAccountType.Trakt
                          ? 'trakt'
                          : acct.type === LinkedAccountType.GoogleSheets
                            ? 'google-sheets'
                            : 'jellyfin'
                    );
                  }}
                  confirmText={intl.formatMessage(globalMessages.areyousure)}
                >
                  <TrashIcon />
                  <span>{intl.formatMessage(globalMessages.delete)}</span>
                </ConfirmButton>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 text-center md:py-12">
          <h3 className="text-lg font-semibold text-gray-400">
            {intl.formatMessage(messages.noLinkedAccounts)}
          </h3>
        </div>
      )}
      <LinkJellyfinModal
        show={showJellyfinModal}
        onClose={() => setShowJellyfinModal(false)}
        onSave={() => {
          setShowJellyfinModal(false);
          revalidateUser();
        }}
      />
      {!!user && (
        <ImdbImportModal
          show={showImdbImportModal}
          userId={user.id}
          onClose={() => setShowImdbImportModal(false)}
          onComplete={() => {
            setShowImdbImportModal(false);
            revalidateUser();
          }}
        />
      )}
    </>
  );
};

export default UserLinkedAccountsSettings;
