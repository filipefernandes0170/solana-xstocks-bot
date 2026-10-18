// Intl formatters, created once per set of options and reused. Creating one is slow and using one is fast: on the usual
// mobile test profile, a new formatter for every price and every clock reading cost about 1.3 s of the desk's start
// (CPU profile, 18 Oct 2026). The text is exactly the same.

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

export function numberFormat(locale: string, options: Intl.NumberFormatOptions = {}) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, format);
  }
  return format;
}

export function dateFormat(locale: string, options: Intl.DateTimeFormatOptions = {}) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    dateFormats.set(key, format);
  }
  return format;
}
