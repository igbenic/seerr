import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import useSettings from '@app/hooks/useSettings';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { ArrowDownOnSquareIcon } from '@heroicons/react/24/outline';
import type { TraktSettings } from '@server/lib/settings';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR, { mutate } from 'swr';
import * as Yup from 'yup';

const messages = defineMessages('components.Settings.SettingsTrakt', {
  trakt: 'Trakt',
  traktSettings: 'Trakt Settings',
  traktSettingsDescription:
    'Enable per-user Trakt connections so Seerr can offer watch-history-aware recommendations and watchlist views.',
  enabled: 'Enable Trakt',
  enabledTip:
    'Users will be able to connect their own Trakt accounts from Linked Accounts once this is enabled.',
  clientId: 'Client ID',
  clientSecret: 'Client Secret',
  callbackUrl: 'OAuth Callback URL',
  callbackUrlHint:
    'Set an Application URL in General settings to keep this callback stable across reverse proxies and alternate hostnames.',
  callbackUrlFallback:
    'Uses the current request host until an Application URL is configured.',
  toastSettingsSuccess: 'Trakt settings saved successfully!',
  toastSettingsFailure: 'Something went wrong while saving Trakt settings.',
  validationClientId: 'You must provide a Trakt client ID.',
  validationClientSecret: 'You must provide a Trakt client secret.',
});

const SettingsTrakt = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { currentSettings } = useSettings();
  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<TraktSettings>('/api/v1/settings/trakt');
  const callbackUrl = currentSettings.applicationUrl
    ? `${currentSettings.applicationUrl.replace(/\/$/, '')}/api/v1/auth/trakt/callback`
    : '';

  const TraktSettingsSchema = Yup.object().shape({
    clientId: Yup.string().when('enabled', {
      is: true,
      then: (schema) =>
        schema.required(intl.formatMessage(messages.validationClientId)),
      otherwise: (schema) => schema,
    }),
    clientSecret: Yup.string().when('enabled', {
      is: true,
      then: (schema) =>
        schema.required(intl.formatMessage(messages.validationClientSecret)),
      otherwise: (schema) => schema,
    }),
  });

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.trakt),
          intl.formatMessage(globalMessages.settings),
        ]}
      />
      <div className="mb-6">
        <h3 className="heading">
          {intl.formatMessage(messages.traktSettings)}
        </h3>
        <p className="description">
          {intl.formatMessage(messages.traktSettingsDescription)}
        </p>
      </div>
      {!callbackUrl && (
        <Alert
          title={intl.formatMessage(messages.callbackUrlHint)}
          type="warning"
        />
      )}
      <Formik
        initialValues={{
          enabled: data?.enabled ?? false,
          clientId: data?.clientId ?? '',
          clientSecret: data?.clientSecret ?? '',
        }}
        validationSchema={TraktSettingsSchema}
        enableReinitialize
        onSubmit={async (values) => {
          try {
            await axios.post('/api/v1/settings/trakt', values);
            await Promise.all([
              revalidate(),
              mutate('/api/v1/settings/public'),
            ]);

            addToast(intl.formatMessage(messages.toastSettingsSuccess), {
              autoDismiss: true,
              appearance: 'success',
            });
          } catch {
            addToast(intl.formatMessage(messages.toastSettingsFailure), {
              autoDismiss: true,
              appearance: 'error',
            });
          }
        }}
      >
        {({ errors, touched, isSubmitting, isValid }) => (
          <Form className="section">
            <div className="form-row">
              <label htmlFor="enabled" className="checkbox-label">
                <span>{intl.formatMessage(messages.enabled)}</span>
                <span className="label-tip">
                  {intl.formatMessage(messages.enabledTip)}
                </span>
              </label>
              <div className="form-input-area">
                <Field type="checkbox" id="enabled" name="enabled" />
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="clientId" className="text-label">
                {intl.formatMessage(messages.clientId)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <Field id="clientId" name="clientId" type="text" />
                </div>
                {errors.clientId && touched.clientId && (
                  <div className="error">{errors.clientId}</div>
                )}
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="clientSecret" className="text-label">
                {intl.formatMessage(messages.clientSecret)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <SensitiveInput
                    as="field"
                    id="clientSecret"
                    name="clientSecret"
                    type="text"
                  />
                </div>
                {errors.clientSecret && touched.clientSecret && (
                  <div className="error">{errors.clientSecret}</div>
                )}
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="callbackUrl" className="text-label">
                {intl.formatMessage(messages.callbackUrl)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <input
                    id="callbackUrl"
                    type="text"
                    value={
                      callbackUrl ||
                      intl.formatMessage(messages.callbackUrlFallback)
                    }
                    readOnly
                  />
                </div>
                <p className="label-tip mt-2">
                  {intl.formatMessage(messages.callbackUrlHint)}
                </p>
              </div>
            </div>
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
        )}
      </Formik>
    </>
  );
};

export default SettingsTrakt;
