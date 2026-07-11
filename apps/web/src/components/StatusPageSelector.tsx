import { useI18n } from '../app/I18nContext';
import { FIELD_HELP_CLASS, FIELD_LABEL_CLASS } from './ui';

type StatusPageOption = { id: number; name: string; slug: string };

export function StatusPageSelector({
  statusPages,
  selectedIds,
  onChange,
  disabled = false,
}: {
  statusPages: StatusPageOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();

  const toggle = (id: number, checked: boolean) => {
    onChange(
      checked ? [...new Set([...selectedIds, id])] : selectedIds.filter((x) => x !== id),
    );
  };

  if (statusPages.length === 0) {
    return (
      <div>
        <div className={FIELD_LABEL_CLASS}>{t('status_page_selector.target_pages')}</div>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          {t('status_page_selector.no_pages')}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={FIELD_LABEL_CLASS}>{t('status_page_selector.target_pages')}</div>
      <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-lg p-3 space-y-2 bg-white dark:bg-slate-700">
        {statusPages.map((p) => (
          <label
            key={p.id}
            className="flex items-center gap-2.5 text-sm cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(p.id)}
              onChange={(e) => toggle(p.id, e.target.checked)}
              disabled={disabled}
              className="rounded border-slate-300 dark:border-slate-500 text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-600 focus:ring-slate-500"
            />
            <span>{p.name}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">/{p.slug}</span>
          </label>
        ))}
      </div>
      <div className={FIELD_HELP_CLASS}>{t('status_page_selector.help')}</div>
    </div>
  );
}
