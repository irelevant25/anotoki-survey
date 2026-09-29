<?php

declare(strict_types=1);

/**
 * The pictures surveys show: uploaded by editors, kept in the database, and
 * served to everybody.
 *
 * The browser makes a picture small before it sends it (frontend
 * core/images/prepare-image.ts: at most 1600 pixels a side, WebP; a GIF as it
 * is, so it keeps moving), so what arrives here is checked, not changed: it
 * must be one of the web's picture formats, by what the file itself says it
 * is - never by what the request calls it. SVG never is: it can carry script.
 *
 * A picture never changes. It is served at /api/images/{id}.{ext}, and cached
 * for a year by browsers and by the network in front of the site.
 */

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_MAX_SIDE = 10000;

/** The formats taken, and the extension each is served with. */
const IMAGE_TYPES = ['image/webp' => 'webp', 'image/png' => 'png', 'image/jpeg' => 'jpg', 'image/gif' => 'gif', 'image/avif' => 'avif'];

function imageSrc(string $id, string $type): string
{
    return '/api/images/' . $id . '.' . IMAGE_TYPES[$type];
}

/**
 * Keeps an uploaded picture. The frontend's SurveyImage for it: its id, size
 * and address, with no description yet (the editor writes that).
 *
 * @return array{id: string, alt: string, width: int, height: int, src: string}
 */
function imageStore(SiteUser $user, string $bytes): array
{
    if ($bytes === '') {
        throw new ApiError(400, 'no_image', 'No picture arrived.');
    }
    $size = @getimagesizefromstring($bytes);
    $type = is_array($size) ? (string) ($size['mime'] ?? '') : '';
    if (!isset(IMAGE_TYPES[$type])) {
        throw new ApiError(415, 'not_an_image', 'That is not a picture this site can show: PNG, JPEG, WebP, GIF or AVIF.');
    }
    $width = (int) $size[0];
    $height = (int) $size[1];
    if ($width < 1 || $height < 1 || $width > IMAGE_MAX_SIDE || $height > IMAGE_MAX_SIDE) {
        throw new ApiError(422, 'image_size', 'The picture is too large: ' . IMAGE_MAX_SIDE . ' pixels a side at most.');
    }

    // bytea goes as a large object: as text, the bytes would have to be valid UTF-8.
    $statement = db()->prepare('INSERT INTO images (content_type, width, height, size, bytes, created_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING id');
    $statement->bindValue(1, $type);
    $statement->bindValue(2, $width, PDO::PARAM_INT);
    $statement->bindValue(3, $height, PDO::PARAM_INT);
    $statement->bindValue(4, strlen($bytes), PDO::PARAM_INT);
    $statement->bindValue(5, $bytes, PDO::PARAM_LOB);
    $statement->bindValue(6, $user->id, PDO::PARAM_INT);
    $statement->execute();
    $id = (string) $statement->fetchColumn();

    return ['id' => $id, 'alt' => '', 'width' => $width, 'height' => $height, 'src' => imageSrc($id, $type)];
}

/** A picture's type and bytes, or null. */
function imageFind(string $id): ?array
{
    if (!isUuid($id)) {
        return null;
    }
    $row = dbOne('SELECT content_type, bytes FROM images WHERE id = ?', [$id]);
    if ($row === null) {
        return null;
    }
    $bytes = $row['bytes'];

    return ['type' => $row['content_type'], 'bytes' => is_resource($bytes) ? (string) stream_get_contents($bytes) : (string) $bytes];
}

/**
 * The type and size of each picture there is, by id.
 *
 * @param string[] $ids
 * @return array<string, array{type: string, width: int, height: int}>
 */
function imagesMeta(array $ids): array
{
    $ids = array_values(array_filter($ids, 'isUuid'));
    if ($ids === []) {
        return [];
    }
    $rows = dbAll('SELECT id, content_type, width, height FROM images WHERE id IN (' . implode(', ', array_fill(0, count($ids), '?')) . ')', $ids);
    $meta = [];
    foreach ($rows as $row) {
        $meta[$row['id']] = ['type' => $row['content_type'], 'width' => (int) $row['width'], 'height' => (int) $row['height']];
    }

    return $meta;
}

/**
 * Deletes the pictures no survey shows any more. A picture only a day old is
 * left alone: it may be on its way into a survey whose save has not arrived
 * yet. There is no scheduler on the hosting, so this runs after the saves and
 * deletions that can leave a picture behind - after they are committed, and
 * never as their failure: a save that shows an old picture again at the same
 * moment makes the delete trip over it, and the picture simply stays.
 */
function imagesCleanup(): int
{
    try {
        return dbExec(
            "DELETE FROM images i
              WHERE i.created_at < now() - interval '1 day'
                AND NOT EXISTS (SELECT 1 FROM survey_images s WHERE s.image_id = i.id)"
        );
    } catch (PDOException $e) {
        error_log('[images] clean-up skipped: ' . $e->getMessage());

        return 0;
    }
}
