import type { CoinType } from '../types/coins';

const PROTOCOL_PATH = /^\/protocol\/(lockin|flow|reset)\/?$/i;

/**
 * Hosts that serve the Universal Link AASA file and the per-type coin links
 * (https://nfc.officialrise.com/protocol/<type>). A dedicated subdomain hosted
 * on Vercel serves the AASA so the Shopify storefront on the apex stays
 * untouched. Coins are written with one of three type-only links; ownership is
 * verified app-side against the Supabase-synced coin list when the link is
 * handled.
 */
export const UNIVERSAL_LINK_HOSTS = ['nfc.officialrise.com'];

export function parseProtocolFromUrl(url: string): CoinType | null {
  try {
    const parsed = new URL(url);
    const scheme = parsed.protocol.replace(':', '').toLowerCase();

    // Custom scheme (rise://protocol/<type>) or Universal Link
    // (https://officialrise.com/protocol/<type>).
    const isCustomScheme = scheme === 'rise';
    const isUniversalLink =
      (scheme === 'https' || scheme === 'http') &&
      UNIVERSAL_LINK_HOSTS.includes(parsed.hostname.toLowerCase());

    if (!isCustomScheme && !isUniversalLink) return null;

    const match = parsed.pathname.match(PROTOCOL_PATH);
    if (!match) return null;

    return match[1].toLowerCase() as CoinType;
  } catch {
    return null;
  }
}

export function parseProtocolUniversalLinkFromUrl(url: string): CoinType | null {
  try {
    const parsed = new URL(url);
    const isUniversalLink =
      parsed.protocol.toLowerCase() === 'https:' &&
      UNIVERSAL_LINK_HOSTS.includes(parsed.hostname.toLowerCase());

    if (!isUniversalLink) return null;

    const match = parsed.pathname.match(PROTOCOL_PATH);
    if (!match) return null;

    return match[1].toLowerCase() as CoinType;
  } catch {
    return null;
  }
}

export function isProtocolDeepLink(url: string): boolean {
  return parseProtocolFromUrl(url) !== null;
}

export function isAuthDeepLink(url: string): boolean {
  return url.startsWith('risemobile://');
}

export function buildProtocolDeepLink(protocol: CoinType): string {
  return `rise://protocol/${protocol}`;
}

export function simulateProtocolTap(
  protocol: CoinType,
  handleProtocolTrigger: (protocol: CoinType, options?: { hasRegisteredCoin?: boolean }) => void,
  options?: { hasRegisteredCoin?: boolean },
): void {
  handleProtocolTrigger(protocol, options);
}
