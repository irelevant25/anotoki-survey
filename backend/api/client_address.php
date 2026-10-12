<?php

declare(strict_types=1);

use Anotoki\Lib\Support\ClientAddress;
use Anotoki\Lib\Support\Keys;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Which address a request comes from, for the limits that count per address
 * (new visitors an hour) - by the anotoki family's one rule (anotoki-lib
 * 0.5.0's Support\ClientAddress, the owner's rule of 2026-10-11), the one the
 * library's own error log reads by too (surveyAdminContext() hands it the same
 * proxies):
 *
 * REMOTE_ADDR, unless the connection comes from one of the proxies the visitor
 * settings trust - trusted_proxies, Cloudflare's published ranges
 * (ClientAddress::CLOUDFLARE: every anotoki site is behind Cloudflare) unless
 * config/visitors.local.php names others, or none, never a catch-all - and
 * then the one address in Cloudflare's CF-Connecting-IP, when it is an address
 * at all. That header is pinned here, never a setting: X-Real-IP,
 * True-Client-IP, X-Forwarded-For and the like come through Cloudflare as the
 * visitor sent them, so a site that read one would let anybody name their own
 * address and walk past every limit with a new one for every request. A
 * header from anybody but a trusted proxy is never believed either.
 *
 * One address, for counting: an IPv4 address as it is, an IPv6 address by its
 * /64 - one household or one server is handed a whole /64 and picks from it at
 * will, so counting single IPv6 addresses would count nothing. An IPv4 address
 * written as IPv6 (::ffff:198.51.100.7) is that IPv4 address.
 *
 * What is kept: what a counter goes by (visitor_counters) is a keyed HMAC of
 * that, under a key of this installation's own (storage/anotoki-lib.key, the
 * library's Keys - derived for this purpose alone), never the address in the
 * clear. It is a pseudonym, not a secret: the same for an address as long as
 * the key lasts, and whoever holds the key can try every IPv4 address against
 * it in moments - so the key stays in storage/, which is never served or
 * copied into a backup.
 *
 * Only for counting: askedFromThisComputer() (api/auth.php) reads
 * requestRemoteAddr() and never believes a proxy.
 */

/** The visitor's address: REMOTE_ADDR, or the one a trusted proxy's CF-Connecting-IP names ('?' for none). */
function clientAddress(Request $request, array $settings): string
{
    $address = ClientAddress::of($request, $settings['trusted_proxies'] ?? [], ClientAddress::CLOUDFLARE_HEADER);

    return $address ?? '?';
}

/** What the limits count: the address, or for IPv6 its /64 ("2001:db8:1:2::/64") - in memory, never kept. */
function clientAddressCounted(Request $request, array $settings): string
{
    $address = clientAddress($request, $settings);

    return $address === '?' ? $address : ClientAddress::bucket($address);
}

/**
 * What is kept of where a request comes from: a keyed HMAC of what the
 * limits count (clientAddressCounted()), 64 hex digits - the same for every
 * request from one address bucket while the installation's key lasts: a
 * stable pseudonym of the address, never the address in the clear.
 */
function clientAddressKept(Request $request, array $settings): string
{
    return hash_hmac('sha256', clientAddressCounted($request, $settings), clientAddressKey());
}

/**
 * The key of those HMACs: derived from this installation's own key (made once
 * in the storage folder by the library, the one its error log's hashes and the
 * backups' seal come from) for this purpose alone. RuntimeException when the
 * storage folder can neither keep nor give it - the site cannot run without
 * that folder anyway.
 */
function clientAddressKey(): string
{
    static $keys = [];

    $storage = storageDir();

    return $keys[$storage] ??= Keys::derive(Keys::installation($storage), 'visitor-limits');
}
