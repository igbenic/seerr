import EmbyLogo from '@app/assets/services/emby-icon-only.svg';
import ImdbLogo from '@app/assets/services/imdb.svg';
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
import defineMessages from '@app/utils/defineMessages';
import PlexOAuth from '@app/utils/plex';
import { TrashIcon } from '@heroicons/react/24/solid';
import { MediaServerType } from '@server/constants/server';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import ImdbImportModal from './ImdbImportModal';
import LinkImdbModal from './LinkImdbModal';
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
    imdbCookieLinked: 'IMDb Cookie Session',
    imdbImport: 'Import to Trakt',
  }
);

const plexOAuth = new PlexOAuth();

enum LinkedAccountType {
  Plex = 'Plex',
  Jellyfin = 'Jellyfin',
  Emby = 'Emby',
  Trakt = 'Trakt',
  Imdb = 'IMDb',
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
  const [showImdbImportModal, setShowImdbImportModal] = useState(false);
  const [showImdbModal, setShowImdbModal] = useState(false);
  const [showJellyfinModal, setShowJellyfinModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applicationName = settings.currentSettings.applicationTitle;
  const traktResult =
    typeof router.query.trakt === 'string' ? router.query.trakt : undefined;

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
    if (user.imdbConnectedAt) {
      accounts.push({
        type: LinkedAccountType.Imdb,
        username:
          user.imdbEmail || intl.formatMessage(messages.imdbCookieLinked),
      });
    }
    return accounts;
  }, [intl, user]);

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
      name: 'IMDb',
      action: () => setShowImdbModal(true),
      hide: accounts.some((a) => a.type === LinkedAccountType.Imdb),
    },
    {
      name: 'Trakt',
      action: () => {
        window.location.assign(
          `/api/v1/auth/trakt/connect?redirect=${encodeURIComponent(
            router.asPath
          )}`
        );
      },
      hide:
        !settings.currentSettings.traktEnabled ||
        accounts.some((a) => a.type === LinkedAccountType.Trakt),
    },
  ].filter((l) => !l.hide);

  const deleteRequest = async (account: string) => {
    try {
      if (account === 'trakt') {
        await axios.delete('/api/v1/auth/trakt/disconnect');
      } else if (account === 'imdb') {
        await axios.delete(
          `/api/v1/user/${user?.id}/settings/linked-accounts/imdb`
        );
      } else {
        await axios.delete(
          `/api/v1/user/${user?.id}/settings/linked-accounts/${account}`
        );
      }
    } catch {
      setError(intl.formatMessage(messages.deleteFailed));
    }

    await revalidateUser();
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
  const enableTraktUnlink = currentUser?.id === user?.id;
  const enableImdbUnlink = currentUser?.id === user?.id;

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
        {currentUser?.id === user?.id && !!linkable.length && (
          <div>
            <Dropdown text="Link Account" buttonType="ghost">
              {linkable.map(({ name, action }) => (
                <Dropdown.Item key={name} onClick={action}>
                  {name}
                </Dropdown.Item>
              ))}
            </Dropdown>
          </div>
        )}
      </div>
      {traktAlert && <Alert title={traktAlert.title} type={traktAlert.type} />}
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
                ) : acct.type === LinkedAccountType.Imdb ? (
                  <ImdbLogo />
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
              {acct.type === LinkedAccountType.Imdb &&
                currentUser?.id === user?.id &&
                !!user?.traktUsername && (
                  <Button
                    buttonType="ghost"
                    buttonSize="sm"
                    onClick={() => setShowImdbImportModal(true)}
                  >
                    {intl.formatMessage(messages.imdbImport)}
                  </Button>
                )}
              {((acct.type === LinkedAccountType.Trakt && enableTraktUnlink) ||
                (acct.type === LinkedAccountType.Imdb && enableImdbUnlink) ||
                (acct.type !== LinkedAccountType.Trakt &&
                  acct.type !== LinkedAccountType.Imdb &&
                  enableMediaServerUnlink)) && (
                <ConfirmButton
                  onClick={() => {
                    deleteRequest(
                      acct.type === LinkedAccountType.Plex
                        ? 'plex'
                        : acct.type === LinkedAccountType.Trakt
                          ? 'trakt'
                          : acct.type === LinkedAccountType.Imdb
                            ? 'imdb'
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

      <LinkImdbModal
        show={showImdbModal}
        onClose={() => setShowImdbModal(false)}
        onSave={() => {
          setShowImdbModal(false);
          revalidateUser();
        }}
      />
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
