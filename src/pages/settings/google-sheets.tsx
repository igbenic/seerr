import SettingsGoogleSheets from '@app/components/Settings/SettingsGoogleSheets';
import SettingsLayout from '@app/components/Settings/SettingsLayout';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const SettingsGoogleSheetsPage: NextPage = () => {
  useRouteGuard(Permission.ADMIN);

  return (
    <SettingsLayout>
      <SettingsGoogleSheets />
    </SettingsLayout>
  );
};

export default SettingsGoogleSheetsPage;
