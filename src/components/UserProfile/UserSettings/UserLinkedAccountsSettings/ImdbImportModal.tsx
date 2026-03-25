import Alert from '@app/components/Common/Alert';
import Modal from '@app/components/Common/Modal';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import type {
  ImdbImportConfirmResponse,
  ImdbImportItem,
  ImdbImportPreviewResponse,
} from '@server/interfaces/api/imdbImportInterfaces';
import axios from 'axios';
import { useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages(
  'components.UserProfile.UserSettings.ImdbImportModal',
  {
    title: 'Import IMDb Watchlist',
    previewTitle: 'IMDb Import Preview',
    resultTitle: 'IMDb Import Result',
    description:
      'Upload an IMDb watchlist CSV export to preview the add-only import into your linked Trakt watchlist.',
    fileLabel: 'IMDb CSV Export',
    fileHelp:
      'Use the CSV file exported from your IMDb watchlist page.',
    chooseFile: 'Choose CSV File',
    replaceFile: 'Replace CSV File',
    noFileSelected: 'Select an IMDb CSV export before generating a preview.',
    invalidFile:
      'IMDb import expects a .csv export file from IMDb watchlist export.',
    preview: 'Generate Preview',
    importing: 'Importing…',
    import: 'Import to Trakt',
    done: 'Done',
    eligible: 'Eligible to add',
    existing: 'Already on Trakt',
    skipped: 'Skipped',
    added: 'Added',
    notFound: 'Not found on Trakt',
    previewFailed: 'Unable to generate the IMDb import preview.',
    importFailed: 'Unable to import the IMDb watchlist.',
    noEligible:
      'There are no new supported IMDb watchlist items to add to Trakt.',
  }
);

interface ImdbImportModalProps {
  onClose: () => void;
  onComplete: () => void;
  show: boolean;
  userId: number;
}

const statusClassName: Record<ImdbImportItem['status'], string> = {
  eligible: 'text-green-400',
  existing: 'text-blue-300',
  skipped: 'text-yellow-400',
};

const ImdbImportModal: React.FC<ImdbImportModalProps> = ({
  show,
  onClose,
  onComplete,
  userId,
}) => {
  const intl = useIntl();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<ImdbImportPreviewResponse | null>(
    null
  );
  const [result, setResult] = useState<ImdbImportConfirmResponse | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const okText = useMemo(() => {
    if (result) {
      return intl.formatMessage(messages.done);
    }

    if (!preview) {
      return intl.formatMessage(messages.preview);
    }

    return isLoading
      ? intl.formatMessage(messages.importing)
      : intl.formatMessage(messages.import);
  }, [intl, isLoading, preview, result]);

  const okDisabled =
    isLoading ||
    (!preview && !selectedFile) ||
    (!!preview && !result && preview.summary.eligibleToAdd === 0);

  const resetState = () => {
    setError(null);
    setIsLoading(false);
    setPreview(null);
    setResult(null);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleOk = async () => {
    if (result) {
      resetState();
      onClose();
      onComplete();
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (!preview) {
        if (!selectedFile) {
          setError(intl.formatMessage(messages.noFileSelected));
          return;
        }

        const csvContent = await selectedFile.text();
        const response = await axios.post<ImdbImportPreviewResponse>(
          `/api/v1/user/${userId}/settings/linked-accounts/imdb/import/preview`,
          {
            csvContent,
          }
        );
        setPreview(response.data);
      } else {
        const response = await axios.post<ImdbImportConfirmResponse>(
          `/api/v1/user/${userId}/settings/linked-accounts/imdb/import/confirm`,
          {
            previewToken: preview.previewToken,
          }
        );
        setResult(response.data);
      }
    } catch (e) {
      setError(
        e?.response?.data?.message ||
          intl.formatMessage(
            !preview ? messages.previewFailed : messages.importFailed
          )
      );
    } finally {
      setIsLoading(false);
    }
  };

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
      <Modal
        onCancel={() => {
          resetState();
          onClose();
        }}
        okButtonType="primary"
        okText={okText}
        okDisabled={okDisabled}
        onOk={handleOk}
        title={intl.formatMessage(
          result
            ? messages.resultTitle
            : preview
              ? messages.previewTitle
              : messages.title
        )}
        dialogClass="sm:max-w-2xl"
      >
        {!preview && !result && (
          <div className="space-y-4">
            <p>{intl.formatMessage(messages.description)}</p>
            <div>
              <label htmlFor="imdbCsvFile" className="text-label">
                {intl.formatMessage(messages.fileLabel)}
              </label>
              <div className="mt-1 rounded-lg border border-dashed border-gray-600 bg-gray-900/40 p-4">
                <input
                  ref={fileInputRef}
                  id="imdbCsvFile"
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] ?? null;

                    if (
                      nextFile &&
                      !nextFile.name.toLowerCase().endsWith('.csv')
                    ) {
                      setSelectedFile(null);
                      setError(intl.formatMessage(messages.invalidFile));
                      event.target.value = '';
                      return;
                    }

                    setError(null);
                    setSelectedFile(nextFile);
                  }}
                />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm text-gray-200">
                      {selectedFile?.name ??
                        intl.formatMessage(messages.fileHelp)}
                    </div>
                    {selectedFile && (
                      <div className="truncate text-xs text-gray-400">
                        {Math.max(1, Math.round(selectedFile.size / 1024))} KB
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded-md border border-gray-500 px-3 py-2 text-sm font-medium text-gray-100 transition hover:border-gray-400 hover:bg-gray-800"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {intl.formatMessage(
                      selectedFile
                        ? messages.replaceFile
                        : messages.chooseFile
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="mb-4">
            <Alert type="error">{error}</Alert>
          </div>
        )}
        {preview && !result && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SummaryCard
                label={intl.formatMessage(messages.eligible)}
                value={preview.summary.eligibleToAdd}
              />
              <SummaryCard
                label={intl.formatMessage(messages.existing)}
                value={preview.summary.alreadyOnTrakt}
              />
              <SummaryCard
                label={intl.formatMessage(messages.skipped)}
                value={preview.summary.skippedUnsupported}
              />
            </div>
            {preview.summary.eligibleToAdd === 0 && (
              <Alert type="info">
                {intl.formatMessage(messages.noEligible)}
              </Alert>
            )}
            <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/60">
              <ul className="divide-y divide-gray-800">
                {preview.items.map((item) => (
                  <li
                    key={`${item.imdbId}-${item.status}`}
                    className="px-4 py-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-white">
                          {item.title}
                        </div>
                        <div className="truncate text-xs text-gray-400">
                          {item.imdbId} • {item.imdbType}
                          {item.reason ? ` • ${item.reason}` : ''}
                        </div>
                      </div>
                      <span className={statusClassName[item.status]}>
                        {item.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SummaryCard
                label={intl.formatMessage(messages.added)}
                value={result.summary.added}
              />
              <SummaryCard
                label={intl.formatMessage(messages.notFound)}
                value={result.summary.notFound}
              />
              <SummaryCard
                label={intl.formatMessage(messages.skipped)}
                value={result.summary.skippedUnsupported}
              />
            </div>
            {result.notFound.length > 0 && (
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
                <div className="mb-2 text-sm font-semibold text-yellow-200">
                  {intl.formatMessage(messages.notFound)}
                </div>
                <ul className="space-y-1 text-sm text-yellow-100">
                  {result.notFound.map((item) => (
                    <li key={item.imdbId}>
                      {item.title} ({item.imdbId})
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </Transition>
  );
};

const SummaryCard = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg border border-gray-700 bg-gray-900/60 px-4 py-3">
    <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
    <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
  </div>
);

export default ImdbImportModal;
