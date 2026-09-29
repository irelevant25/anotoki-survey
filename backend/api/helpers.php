<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Small things every handler needs: answering in JSON, reading a JSON body,
 * where a request came from, time, and text measured the way people see it.
 */

/** The largest JSON body taken unless a route says otherwise: an answered survey is a few kB. */
const BODY_LIMIT = 256 * 1024;

/**
 * A refusal with the status, code and sentence to answer it with. Thrown from
 * deep inside a check; the error handler in api/index.php turns it into the
 * one error shape the frontend reads: {"error": "...", "code": "...", ...extra}.
 */
final class ApiError extends RuntimeException
{
    /**
     * @param array<string, string> $headers
     * @param array<string, mixed>  $extra   more fields for the answer (which question, the current version)
     */
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly array $headers = [],
        public readonly array $extra = [],
    ) {
        parent::__construct($message);
    }
}

/** JSON as JavaScript writes it: UTF-8 and slashes as they are. */
function jsonText(mixed $value): string
{
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}

function respondJson(Response $response, mixed $data, int $status = 200): Response
{
    $response->getBody()->write(jsonText($data));

    return $response->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8');
}

/**
 * A refusal in the one shape the frontend reads: a sentence and a code.
 *
 * @param array<string, string> $headers
 */
function respondError(Response $response, int $status, string $code, string $message, array $headers = [], array $extra = []): Response
{
    $response = respondJson($response, ['error' => $message, 'code' => $code] + $extra, $status);
    foreach ($headers as $name => $value) {
        $response = $response->withHeader($name, $value);
    }

    return $response;
}

/**
 * The request's body, read up to $limit bytes - one byte more is enough to
 * know it is too large without holding all of it.
 */
function requestBytes(Request $request, int $limit): string
{
    $length = $request->getHeaderLine('Content-Length');
    if (ctype_digit($length) && (int) $length > $limit) {
        throw new ApiError(413, 'too_large', 'That is more than this site takes in one go.');
    }

    $stream = $request->getBody();
    $raw = '';
    while (!$stream->eof() && strlen($raw) <= $limit) {
        $chunk = $stream->read($limit + 1 - strlen($raw));
        if ($chunk === '') {
            break;
        }
        $raw .= $chunk;
    }
    if (strlen($raw) > $limit) {
        throw new ApiError(413, 'too_large', 'That is more than this site takes in one go.');
    }

    return $raw;
}

/**
 * The request's JSON body as arrays, or null when there is none. Anything that
 * is not JSON is refused - so is a JSON body sent as a form, which is what a
 * page on another site could make a browser send without asking.
 */
function jsonBody(Request $request, int $limit = BODY_LIMIT): mixed
{
    $raw = requestBytes($request, $limit);
    if (trim($raw) === '') {
        return null;
    }

    $type = strtolower($request->getHeaderLine('Content-Type'));
    if (!preg_match('~^application/([a-z0-9.+-]*\+)?json\b~', $type)) {
        throw new ApiError(415, 'unsupported_media_type', 'Send the body as JSON (Content-Type: application/json).');
    }

    try {
        return json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        throw new ApiError(400, 'invalid_json', 'The request body is not valid JSON.');
    }
}

/** REMOTE_ADDR as the server saw it. */
function requestRemoteAddr(Request $request): string
{
    return (string) ($request->getServerParams()['REMOTE_ADDR'] ?? '');
}

/** 2026-09-27T10:15:00.123Z, the way toISOString() writes it. */
function isoNow(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
}

/**
 * A time from the database (timestamptz, as PostgreSQL writes it in UTC) the
 * way toISOString() writes it - or null.
 */
function isoTime(?string $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }

    return (new DateTimeImmutable($value))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s.v\Z');
}

/** A time the browser sent (toISOString()), or null when it is not one. */
function parseIsoTime(mixed $value): ?DateTimeImmutable
{
    if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/D', $value)) {
        return null;
    }
    try {
        return new DateTimeImmutable($value);
    } catch (Exception) {
        return null;
    }
}

/** The first $max characters of a UTF-8 string (no mbstring needed). */
function textClip(string $text, int $max): string
{
    return preg_match('/^.{0,' . $max . '}/us', $text, $m) ? $m[0] : '';
}

/** How many characters: code points, which is at most what the browser counts (UTF-16 units). */
function textLength(string $text): int
{
    return (int) preg_match_all('/./us', $text);
}

/**
 * The text without the spaces around it - every kind of space, as the
 * browser's trim() takes them away, not only the ASCII ones PHP's trim() knows.
 */
function textTrim(string $text): string
{
    return (string) preg_replace('/^[\s\p{Z}\x{FEFF}]+|[\s\p{Z}\x{FEFF}]+$/u', '', $text);
}

/**
 * A text field's value as it is kept: valid UTF-8 without control characters
 * but tabs and line breaks - or null for what is not text at all. The controls
 * are dropped rather than refused: a soft line break pasted from a word
 * processor, or a form feed from a PDF, would otherwise make an answer that
 * can never be sent, however often it is tried.
 */
function textClean(mixed $value): ?string
{
    if (!is_string($value) || preg_match('//u', $value) !== 1) {
        return null;
    }

    return textWithoutControls($value);
}

/** The text without control characters, tabs and line breaks aside. */
function textWithoutControls(string $text): string
{
    return (string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $text);
}

/** A fresh random UUID (version 4), as the database's gen_random_uuid() makes them. */
function newUuid(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);

    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
}

function isUuid(mixed $value): bool
{
    return is_string($value) && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/D', $value) === 1;
}
