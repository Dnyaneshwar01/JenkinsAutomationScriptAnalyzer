# Jenkins Cucumber Failure Analyzer

A small internal utility for a daily workflow: paste a Jenkins build URL, click **Analyze**, and get failed Cucumber scenarios grouped by root cause, viewable in-browser and exportable to Excel.

## What it shows

- **Root-cause groups**: failures with the same normalized error (UUIDs, timestamps and long numbers masked), each labelled with a category: Locator / Wait, Assertion, Timeout, Infrastructure, Hook / Setup, Application / API, Not implemented, Other.
- **Most common failing steps**: failed steps counted with the Gherkin keyword and quoted arguments ignored, so an outage in one shared step (e.g. login) stands out immediately.
- **New / recurring / fixed**: compared with the latest earlier finished build of the same job that ran with the same `COMPARE_BUILD_PARAMS` (the job runs a different suite per build, so the immediately previous build is usually not comparable).
- **Screenshots** attached to failed scenarios, as thumbnails in the page and links in Excel.
- **Filter** by feature, scenario, step, tag or error text, and a "new failures only" toggle.
- **Re-runs within a build**: when failed features are re-run in the same build (e.g. `SerialRerun`), each scenario is counted once by its last run. Scenarios that passed on re-run are left out of the failure list. The summary counts **feature files** (a feature fails a run if any of its scenarios fails it): failed in 1st run, fixed by re-run, failed after re-run and the pass rate before / after re-run; the Excel summary also keeps the scenario counts as detail, and each failure shows its run count and history (e.g. `Failed → Failed`). Runs of the same scenario are matched by feature, scenario name and step text, so Scenario Outline examples stay separate. With the HTML report, the pages of features that had a failure are fetched to see every run.

Results are read from an archived Cucumber JSON artifact when the build has one, otherwise from the Jenkins **Cucumber Reports** plugin pages (`<build>/cucumber-html-reports/`).

## Setup

```bash
npm install
copy .env.example .env    # (Windows) or: cp .env.example .env
```

Edit `.env`:
- `JENKINS_PLATFORMS` — the Jenkins machines to read from, e.g. `SB,QA` (SB = master branch builds, QA = QA branch builds). The page shows a platform selector, and picks the platform automatically from the pasted URL's host.
- For each platform `<ID>`:
  - `JENKINS_<ID>_USER` / `JENKINS_<ID>_API_TOKEN` — your username and API token on that Jenkins (Jenkins → your user → **Configure** → **API Token** → **Add new Token**). Do not use your login password.
  - `JENKINS_<ID>_ALLOWED_HOSTS` — comma-separated `host:port` list of that Jenkins (e.g. `192.168.101.96:8080`). Required when more than one platform is configured: the build URL's host decides whose credentials are sent, and a token is never sent to another platform's host.
  - `JENKINS_<ID>_LABEL` — optional name shown in the selector, e.g. `SB`.
  - A platform with missing settings is shown as "not set up" and cannot be selected.
- Single Jenkins: leave `JENKINS_PLATFORMS` out and set `JENKINS_USER`, `JENKINS_API_TOKEN` and `JENKINS_ALLOWED_HOSTS` instead.
- `CUCUMBER_JSON_ARTIFACT_PATH` — comma-separated candidate relative paths to the Cucumber JSON artifact within a build. The first one found on the build is used; if none match, the app falls back to any artifact ending in `cucumber*.json`, then to the Cucumber Reports plugin HTML pages.
- `COMPARE_BUILD_PARAMS` — build parameters that must match for an earlier build to be used for the new / recurring comparison (default `Tags,Against,DataCenter,isRerun`).

## Run

```bash
npm start        # production
npm run dev       # auto-reload with nodemon
```

Open http://localhost:3000, paste a Jenkins build URL (e.g. `http://jenkins-host/job/MyJob/123/` or any page under it, such as `.../123/cucumber-html-reports/overview-features.html`), click **Analyze**.

`.env` is only read at startup, so restart the server after changing it.

## Try it without a real Jenkins server

```bash
npm run mock-jenkins
```

This starts a fake Jenkins on port 4000 with four sample builds (normal failures, still-building, unauthorized, all-passed) — see the console output for the exact URLs to paste into the app while it's running.

## Tests

```bash
npm test              # unit tests (JSON + HTML parsers, normalizer, grouping, insights, Excel export)
npm run run-fixture   # quick console dump of parsed/grouped fixture data, no HTTP involved
```
