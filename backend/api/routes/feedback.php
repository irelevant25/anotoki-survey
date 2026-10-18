<?php

declare(strict_types=1);

use Anotoki\Lib\Feedback\Http\FeedbackRoutes;

/**
 * The feedback form - the anotoki family's (anotoki-lib's Feedback, its form
 * @anotoki/lib/feedback/form), which the Contact page opens (and the family's
 * footer will) - and its one route, for anybody: a person signed in, a
 * visitor, nobody - whether the IAM requires signing in here or not, as the
 * Contact page it is opened from is anybody's (the owner's wish of 2026-10-18;
 * docs/decisions.md):
 *
 *   POST /api/feedback   {kind: bug | idea | other, subject?, message, email?, page?, language?, anonymous?,
 *                        website}  -> 201 {ok: true}
 *
 * Who sent it is the token's alone (the library's Identify in front: a Bearer
 * token that does not check out is 401 invalid_token, as on every route that
 * asks who; none is nobody; a visitor's key is never read here, so a visitor
 * sends as nobody) - the person's id and nothing else, and none at all for a
 * message sent "without my name" (anonymous: no id, no address). The reply
 * address is only the one the sender wrote into the form (the form here fills
 * none in). The person's row is kept (RecordPerson), so the Feedback page can
 * name them. Nothing of where a message came from is kept with it: no network
 * address, no hash of one; its page as a path (never the query), its language
 * and the browser's name are. The limits (the library's): 5 an hour and 20 a
 * day from one sender - a person by their account; anybody else, and a message
 * "without my name", by an HMAC of their address bucket (surveyAdminContext():
 * Cloudflare's CF-Connecting-IP through the origin secret) - and 300 a day
 * from the visitors together and as many from the people signed in: 429
 * too_many with retry_after; 422 kind_unknown, message_required, too_long,
 * subject_too_long, email_invalid; 413 / 415 / 400 for a body that is too
 * large, not JSON or broken. The robots' field `website` filled: the same 201,
 * and nothing kept. No mail is sent: the admin panel counts what is new. While
 * an update waits, 503 update_pending (the site gate: nothing that writes the
 * site's data answers then).
 *
 * @var \Slim\App $app
 * @var \Anotoki\Lib\Auth\Http\Identify $identify   Identify that reads no visitor's key (api/index.php)
 * @var \Anotoki\Lib\People\Http\RecordPerson $recordPerson
 */

FeedbackRoutes::public($app, '/api/feedback', surveyFeedback(), surveyAdminContext(), surveyFeedbackSender(...))
    ->add($recordPerson)->add($identify);
