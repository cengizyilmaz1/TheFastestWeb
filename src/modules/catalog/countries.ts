/**
 * ISO 3166-1 alpha-2, as the product's country vocabulary.
 *
 * Client-safe on purpose: the submit form and the enrichment panel both need
 * the list, and it carries nothing but public reference data.
 *
 * **The codes are the data; the names are rendering.** The 249 officially
 * assigned codes are pinned here as the validation set — a stable standard
 * worth vendoring — while display names come from `Intl.DisplayNames`, which
 * every supported runtime ships and which stays current as countries rename
 * themselves without this file needing a release. A code the runtime cannot
 * name falls back to the code itself rather than to an invented string.
 *
 * **The founder selects; nothing infers.** No IP, no TLD, no payment-provider
 * country, no founder profile location. A product's country is a fact its
 * founder states, and every wrong inference would be published under their
 * name.
 */

/** Every officially assigned ISO 3166-1 alpha-2 code. */
export const COUNTRY_CODES = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT',
  'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI',
  'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY',
  'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
  'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM',
  'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK',
  'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL',
  'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
  'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR',
  'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN',
  'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS',
  'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
  'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW',
  'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP',
  'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM',
  'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM',
  'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF',
  'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW',
  'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
  'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
] as const

const CODE_SET: ReadonlySet<string> = new Set(COUNTRY_CODES)

export function isCountryCode(value: string): boolean {
  return CODE_SET.has(value)
}

/**
 * The runtime's English name for a code, or the code itself.
 *
 * Constructed lazily and cached: `Intl.DisplayNames` is cheap but not free,
 * and this gets called once per option when a picker opens.
 */
let displayNames: Intl.DisplayNames | null | undefined

export function countryName(code: string): string {
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(['en'], { type: 'region' })
    } catch {
      displayNames = null
    }
  }

  if (!displayNames) return code

  try {
    return displayNames.of(code) ?? code
  } catch {
    return code
  }
}

export interface CountryOption {
  code: string
  name: string
}

/** Every country, named and sorted for a picker. */
export function listCountryOptions(): CountryOption[] {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) =>
    a.name.localeCompare(b.name)
  )
}

function searchText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

/** Match localized accents and familiar aliases without changing stored ISO codes. */
export function filterCountryOptions(options: readonly CountryOption[], query: string): CountryOption[] {
  const needle = searchText(query)
  if (!needle) return [...options]
  const aliases: Record<string, string> = { TR: 'Turkey Türkiye', GB: 'UK United Kingdom Great Britain', US: 'USA United States America' }
  const matches = options.filter((option) => searchText(`${option.name} ${option.code} ${aliases[option.code] ?? ''}`).includes(needle))
  const exactCode = matches.find((option) => option.code.toLowerCase() === needle)
  return exactCode ? [exactCode, ...matches.filter((option) => option !== exactCode)] : matches
}

/** Browser drafts are untrusted; an old or invalid value returns to explicit choice. */
export function restoreCountryCode(value: unknown): string | null {
  return typeof value === 'string' && isCountryCode(value) ? value : null
}
