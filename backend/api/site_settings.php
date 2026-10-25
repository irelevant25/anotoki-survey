<?php

declare(strict_types=1);

use Anotoki\Lib\Auth\Http\AuthRoutes;
use Anotoki\Lib\Robots\Robots;
use Anotoki\Lib\SiteSettings\SiteSettings;

/**
 * The site settings, and robots.txt and sitemap.xml - the anotoki family's
 * library (anotoki-lib 0.11.0; the owner's requests of 2026-10-25: genshin's
 * site settings on every site, and robots.txt and sitemap.xml on every site).
 *
 * The site settings: switches the site's ADMIN throws without a deploy, on the
 * admin panel's Site settings page (/admin/site-settings, the library's page;
 * routes/admin.php's /api/admin/site-settings), kept in the library's tables
 * (its set anotoki_admin, 003). This site offers all three parts:
 *
 *   getting_in     maintenance: the API answers everybody but the site's ADMIN
 *                  503 maintenance - the SiteGate's (api/index.php), which
 *                  knows the ADMIN by the token alone (surveyTokenPerson(): it
 *                  runs before any route identifies the request) - and the
 *                  pages draw the closed sign; an administrator signed out signs
 *                  in at /staff
 *   announcement   a bar above the public site's pages (<anotoki-announcement>)
 *   page_access    the participant's pages - the list of open surveys (/) and a
 *                  survey's own page (/{slug}, its thank-you included) - each
 *                  switched off, or kept for people signed in, for editors, for
 *                  administrators; the API paths a row names answer 423
 *                  page_locked to the others (the library's PageAccessGate, right
 *                  inside the Identify of each group whose data a page holds:
 *                  routes/surveys.php, visitor.php, feedback.php, admin.php)
 *
 * What keeps answering whatever a row says, and while the site is closed (the
 * reserved API paths): the library's own - the site's status, the
 * translations' bundles, the settings' two routes - and this site's: its
 * sign-in configuration (/api/auth/config - an administrator signs in with it)
 * and the pictures (/api/images: what a question and a step show while a
 * survey is answered; an <img> carries no token, so a row that claimed them
 * would refuse every picture to everybody, the administrators too). The
 * surveys' own routes (/api/surveys) are not among them, on purpose:
 * maintenance closes them like everything else, and Page access may refuse
 * them with the participant's pages - an answer being written stays in the
 * browser's draft (the take page's siteClosed) and goes once the site takes it.
 *
 * The pages no row governs: the library's (the sign-in's way back /auth, /staff,
 * /admin, the legal pages, About and Support) and the editor's preview
 * (/preview), which is staff's, as the admin panel is.
 */

/** The pages no row may govern beyond the library's own: the editor's preview of a survey, staff's alone. */
const SITE_SETTINGS_RESERVED_PAGES = ['/preview'];

/** The site settings, for the gate, the routes, the Page access gate and the sitemap. */
function surveySiteSettings(): SiteSettings
{
    static $made = null;

    // The connection is asked only when a question needs it: a site not set up has none, and the gate answers first.
    return $made ??= new SiteSettings(static fn(): PDO => db(), SiteSettings::PARTS, [AuthRoutes::openPath(), '/api/images'], SITE_SETTINGS_RESERVED_PAGES);
}

/**
 * The public pages the sitemap lists whatever the IAM says: the legal pages,
 * About and Support - anybody's, in the legal frame (sites/main/main.routes.ts).
 */
const SITEMAP_PAGES = ['/terms', '/privacy', '/contact', '/about', '/support'];

/**
 * robots.txt and sitemap.xml (RobotsRoutes, routes/public.php): robots kept
 * out of the library's /admin, /api and /auth and this site's /preview (the
 * editor's) and /staff (the administrators' way in while the site is closed);
 * the sitemap by the site's configured address (siteAddress() - never a
 * request's Host), its pages SITEMAP_PAGES and the survey's own entries
 * (sitemapSurveys()), without what Page access hides.
 *
 * No file keeps the sitemap between requests (the library's cacheFile): what is
 * public here changes with the surveys opened and closed - a closing day passes
 * with no write at all - and with the IAM's "Sign-in required", neither of
 * which the library's kept copy would know of for an hour; made each time it is
 * one query, and the IAM's answer is kept a minute already (SignInRule). The
 * answer itself may be kept an hour by a browser or the edge (the library's
 * Cache-Control).
 */
function surveyRobots(): Robots
{
    static $made = null;

    return $made ??= new Robots(
        address: static fn(): string => siteAddress(),
        disallow: ['/preview', '/staff'],
        pages: SITEMAP_PAGES,
        entries: static fn(): iterable => sitemapSurveys(),
        settings: surveySiteSettings(),
    );
}

/**
 * The survey's own entries of the sitemap: while the IAM says this site does not
 * require a sign-in (visitors welcome: the pages are anybody's), the list of open
 * surveys (/) and each open survey's page - one taking answers now, by the
 * server's own rule (SURVEY_TAKING_ANSWERS_SQL: open, its closing day not past);
 * never a draft, never a closed one. While a sign-in is required, none: those
 * pages send everybody to the IAM.
 *
 * @return list<string|array{path: string, lastmod: DateTimeImmutable}>
 */
function sitemapSurveys(): array
{
    if (authLoginRequired()) {
        return [];
    }
    $rows = dbAll('SELECT s.slug, s.updated_at FROM surveys s WHERE ' . SURVEY_TAKING_ANSWERS_SQL . ' ORDER BY s.opened_at DESC NULLS LAST, s.created_at DESC');

    return ['/', ...array_map(static fn(array $row): array => ['path' => '/' . $row['slug'], 'lastmod' => new DateTimeImmutable((string) $row['updated_at'])], $rows)];
}
