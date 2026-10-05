# The survey site - knowledge base

How the site works and why it is built the way it is. `README.md` at the top
says what it is; `DEV.md` how to set it up, run, test and deploy it; these
pages are for changing it.

| Page | What it holds |
| --- | --- |
| [architecture.md](architecture.md) | the parts and how a request goes through them: sign-in and roles (and the IAM's "Sign-in required" switch, and the visitors it lets in - on the server and in the browser), the data model, saving in the editor, pictures, the rules both sides keep, the site's own words in two languages, a survey in more than one language, a database behind the code and the Migrations page, what is held when two requests meet |
| [api.md](api.md) | every route of the API: who may call it, what it takes, what it answers, how it refuses |
| [operations.md](operations.md) | the hosting: the upload, the installer, later versions (and their migrations, applied on the Migrations page), the site's strings and languages on the live site, the IAM's registration of the site, visitors (their settings file, limits and clean-up), what goes wrong |
| [decisions.md](decisions.md) | the choices made, with their reasons - read before undoing one |

The agents and skills in [`.claude/`](../.claude/) lean on these pages:

| | For |
| --- | --- |
| skill `survey-site` | any change here - the map, the rules, the review checklist |
| skill `check-in-browser` | the site end to end in headless Chrome, signed in through the stand-in IAM, in English and in Slovak |
| skill `deploy-survey` | building and uploading a version, and what else a version needs |
| agent `survey-dev` | implementing a change (loads `survey-site`) |
| agent `survey-reviewer` | reviewing a change before it is committed (read-only) |

Keep them current: a change that makes a page here wrong changes the page too.
