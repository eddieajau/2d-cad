/**
 * @copyright 2026 Andrew Eddie. All rights reserved.
 * @license   MIT
 */

/**
 * Escapes a string for safe interpolation into an innerHTML template —
 * text nodes and quoted attribute values alike. No exceptions for
 * "trusted" data.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
