# ig-content-automation

Automated medical education content generator + Instagram publisher.

Pipeline: picks a topic → generates a caption via Claude API → renders a
templated image → commits it to this repo → publishes to Instagram via
the Graph API, all on a schedule via GitHub Actions.

## One-time setup: add these repo secrets

Go to **Settings → Secrets and variables → Actions → New repository secret**
and add:

| Secret name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (console.anthropic.com) |
| `IG_USER_ID` | Your Instagram Business Account ID |
| `IG_ACCESS_TOKEN` | Your long-lived Instagram Graph API access token |

## Schedule

Currently set to post twice daily (7:30 AM and 7:00 PM IST). Edit the
`cron` lines in `.github/workflows/post.yml` to change timing.

## Manual test run

Go to the **Actions** tab -> select "Auto Post to Instagram" -> **Run workflow**
to trigger it immediately without waiting for the schedule.

## Token expiry

Instagram long-lived access tokens expire in ~60 days. You'll need to
regenerate `IG_ACCESS_TOKEN` periodically via the Meta App Dashboard ->
Instagram API setup -> Generate Token, and update the GitHub secret.

## Local testing (optional)

\`\`\`bash
npm install
export ANTHROPIC_API_KEY=sk-...
node scripts/generate-content.js
node scripts/generate-image.js
# publishing requires the image to be hosted at a public URL already,
# so it's designed to run inside the GitHub Actions workflow, not locally
\`\`\`
