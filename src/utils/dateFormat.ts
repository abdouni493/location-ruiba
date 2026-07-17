/**
 * Date formatting shared by the printed documents (contract, conditions, invoices).
 * Everything is rendered as dd/mm/yyyy with latin digits, whatever the document
 * language is: the Arabic contract must stay readable next to the French one, and
 * locales like 'ar-SA' (hijri) or the browser default ('en-US' → mm/dd/yyyy) would
 * change the order of the fields.
 */
export const formatDateDMY = (value: any): string => {
  if (value === null || value === undefined || value === '') return '';

  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return typeof value === 'string' ? value : '';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
};

/** Same as formatDateDMY but appends the time as HH:MM. */
export const formatDateTimeDMY = (value: any): string => {
  if (value === null || value === undefined || value === '') return '';

  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return typeof value === 'string' ? value : '';

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${formatDateDMY(date)} ${hours}:${minutes}`;
};
