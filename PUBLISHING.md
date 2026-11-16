# Publishing to npm

`@transynq/sdk` is published to [npm](https://www.npmjs.com/package/@transynq/sdk) by
[`.github/workflows/release.yml`](.github/workflows/release.yml) with **provenance** (a signed statement linking the package to
this repository and workflow run). Authentication is **npm trusted publishing** (OIDC, no stored token) once it is configured;
until then, and for the very first publish of the package, the workflow uses an `NPM_TOKEN` secret.

## One-time setup (repository owner)

1. **npm account.** Create an account at <https://www.npmjs.com> and enable two-factor authentication.
2. **Reserve the scope.** Create the npm **organisation `transynq`** (*Add organization*, the free plan is enough for public
   packages). This reserves the `@transynq` scope; packages under it can only be published by the organisation's members.
3. **First publish (token).** npm can only attach a trusted publisher to a package that already exists, so the first release
   uses a token:
   - npm > *Access Tokens > Generate New Token > Granular Access Token*: packages and scopes **Read and write**, limited to the
     `@transynq` scope, short expiry (for example 7 days), "Bypass two-factor authentication" enabled for automation.
   - GitHub repository *Settings > Secrets and variables > Actions > New repository secret* (or an environment secret of
     `release`): `NPM_TOKEN` = that token.
4. **Trusted publisher** (after the first publish). npm > package `@transynq/sdk` > *Settings > Trusted Publisher > GitHub
   Actions*, with exactly:

   | Field | Value |
   |---|---|
   | Organization or user | `transynq-io` |
   | Repository | `transynq-sdk-node` |
   | Workflow filename | `release.yml` |
   | Environment name | `release` |

   Then **delete the `NPM_TOKEN` secret** and revoke the token. With no `NPM_TOKEN`, the workflow publishes through OIDC (it
   installs npm >= 11.5.1, which trusted publishing requires). Optionally set *Publishing access* to "Require two-factor
   authentication and disallow tokens".
5. **GitHub environment.** Repository *Settings > Environments > New environment* `release`. Optionally add **required
   reviewers** (manual approval before every publish) and restrict it to tags `v*`.

## Release procedure

1. Update `version` in `package.json` (and `package-lock.json`, e.g. `npm version X.Y.Z --no-git-tag-version`) and
   `SDK_VERSION` in `src/core/http.ts` (semantic versioning; the SDK version is independent of the API version).
2. Move the "Unreleased" entries of [CHANGELOG.md](CHANGELOG.md) under a new `## [X.Y.Z] - YYYY-MM-DD` heading.
3. Open a pull request, let CI pass, merge to `main`.
4. Create a GitHub release with a **new tag `vX.Y.Z`** (exactly the package version with a `v` prefix) on `main`, paste the
   changelog section as notes, and publish it.
5. The `release` workflow checks the tag against `package.json` (it fails on a mismatch), type-checks, lints, tests, builds,
   runs `npm publish --dry-run`, then publishes with `npm publish --provenance --access public` (after the `release`
   environment approval, if configured).

**Dry run:** *Actions > release > Run workflow* with `dry-run` checked (the default) runs everything up to
`npm pack --dry-run` and `npm publish --dry-run`, without publishing.

npm versions cannot be republished: a mistake needs a new version (`npm deprecate` the bad one; unpublishing is limited to 72
hours).
