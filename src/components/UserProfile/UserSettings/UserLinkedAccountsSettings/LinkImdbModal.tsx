import Alert from '@app/components/Common/Alert';
import Modal from '@app/components/Common/Modal';
import { useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import * as Yup from 'yup';

const messages = defineMessages(
  'components.UserProfile.UserSettings.LinkImdbModal',
  {
    title: 'Link IMDb Account',
    description:
      'Connect your IMDb account so Seerr can preview and import your watchlist into Trakt.',
    authType: 'Authentication Method',
    authPassword: 'Email + Password',
    authCookie: 'at-main Cookie',
    email: 'IMDb Email',
    password: 'IMDb Password',
    cookie: 'at-main Cookie',
    emailRequired: 'You must provide an IMDb email',
    passwordRequired: 'You must provide an IMDb password',
    cookieRequired: 'You must provide an IMDb at-main cookie',
    saving: 'Linking…',
    save: 'Link',
    errorUnauthorized: 'IMDb rejected those credentials.',
    errorUnknown: 'An unknown error occurred while linking IMDb.',
  }
);

interface LinkImdbModalProps {
  onClose: () => void;
  onSave: () => void;
  show: boolean;
}

const LinkImdbModal: React.FC<LinkImdbModalProps> = ({
  show,
  onClose,
  onSave,
}) => {
  const intl = useIntl();
  const { user } = useUser();
  const [error, setError] = useState<string | null>(null);

  const ImdbLinkSchema = Yup.object().shape({
    authType: Yup.mixed<'password' | 'cookie'>()
      .oneOf(['password', 'cookie'])
      .required(),
    cookieAtMain: Yup.string().when('authType', {
      is: 'cookie',
      then: (schema) =>
        schema.required(intl.formatMessage(messages.cookieRequired)),
      otherwise: (schema) => schema.notRequired(),
    }),
    email: Yup.string().when('authType', {
      is: 'password',
      then: (schema) =>
        schema.required(intl.formatMessage(messages.emailRequired)),
      otherwise: (schema) => schema.notRequired(),
    }),
    password: Yup.string().when('authType', {
      is: 'password',
      then: (schema) =>
        schema.required(intl.formatMessage(messages.passwordRequired)),
      otherwise: (schema) => schema.notRequired(),
    }),
  });

  return (
    <Transition
      appear
      show={show}
      enter="transition ease-in-out duration-300 transform opacity-0"
      enterFrom="opacity-0"
      enterTo="opacuty-100"
      leave="transition ease-in-out duration-300 transform opacity-100"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
    >
      <Formik
        initialValues={{
          authType: 'password' as 'password' | 'cookie',
          cookieAtMain: '',
          email: '',
          password: '',
        }}
        validationSchema={ImdbLinkSchema}
        onSubmit={async ({ authType, cookieAtMain, email, password }) => {
          try {
            setError(null);
            await axios.post(
              `/api/v1/user/${user?.id}/settings/linked-accounts/imdb`,
              authType === 'password'
                ? { authType, email, password }
                : { authType, cookieAtMain }
            );
            onSave();
          } catch (e) {
            if (e?.response?.status === 401) {
              setError(
                e?.response?.data?.message ||
                  intl.formatMessage(messages.errorUnauthorized)
              );
            } else {
              setError(
                e?.response?.data?.message ||
                  intl.formatMessage(messages.errorUnknown)
              );
            }
          }
        }}
      >
        {({ errors, touched, values, handleSubmit, isSubmitting, isValid }) => {
          return (
            <Modal
              onCancel={() => {
                setError(null);
                onClose();
              }}
              okButtonType="primary"
              okButtonProps={{ type: 'submit', form: 'link-imdb-account' }}
              okText={
                isSubmitting
                  ? intl.formatMessage(messages.saving)
                  : intl.formatMessage(messages.save)
              }
              okDisabled={isSubmitting || !isValid}
              onOk={() => handleSubmit()}
              title={intl.formatMessage(messages.title)}
              dialogClass="sm:max-w-lg"
            >
              <Form id="link-imdb-account">
                <p className="mb-4">
                  {intl.formatMessage(messages.description)}
                </p>
                {error && (
                  <div className="mb-4">
                    <Alert type="error">{error}</Alert>
                  </div>
                )}
                <label htmlFor="authType" className="text-label">
                  {intl.formatMessage(messages.authType)}
                </label>
                <div className="mb-4 mt-1">
                  <Field as="select" id="authType" name="authType">
                    <option value="password">
                      {intl.formatMessage(messages.authPassword)}
                    </option>
                    <option value="cookie">
                      {intl.formatMessage(messages.authCookie)}
                    </option>
                  </Field>
                </div>
                {values.authType === 'password' ? (
                  <>
                    <label htmlFor="email" className="text-label">
                      {intl.formatMessage(messages.email)}
                    </label>
                    <div className="mb-2 mt-1">
                      <Field
                        id="email"
                        name="email"
                        type="email"
                        placeholder={intl.formatMessage(messages.email)}
                      />
                      {errors.email && touched.email && (
                        <div className="error">{errors.email}</div>
                      )}
                    </div>
                    <label htmlFor="password" className="text-label">
                      {intl.formatMessage(messages.password)}
                    </label>
                    <div className="mb-2 mt-1">
                      <Field
                        id="password"
                        name="password"
                        type="password"
                        placeholder={intl.formatMessage(messages.password)}
                      />
                      {errors.password && touched.password && (
                        <div className="error">{errors.password}</div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <label htmlFor="cookieAtMain" className="text-label">
                      {intl.formatMessage(messages.cookie)}
                    </label>
                    <div className="mb-2 mt-1">
                      <Field
                        as="textarea"
                        id="cookieAtMain"
                        name="cookieAtMain"
                        rows={6}
                        placeholder={intl.formatMessage(messages.cookie)}
                      />
                      {errors.cookieAtMain && touched.cookieAtMain && (
                        <div className="error">{errors.cookieAtMain}</div>
                      )}
                    </div>
                  </>
                )}
              </Form>
            </Modal>
          );
        }}
      </Formik>
    </Transition>
  );
};

export default LinkImdbModal;
