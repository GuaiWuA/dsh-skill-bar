# Changelog

All notable changes to this plugin are documented here.
This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0]

First release.

### Added

- Composer tool-row seat: a **Skills** trigger with the usable-skill count.
- Input-dock panel above the composer: search, `All / Favorites / Recent`, and a
  responsive card grid, with per-skill display labels, the literal `/<name>`,
  the skill description, tags, and a sent-count mastery row.
- Click-to-cast and pointer drag-to-cast, both appending `/name ` to the composer
  draft; nothing is auto-sent.
- Send-confirmed cast counting: a cast is pending until the token leaves the
  draft, so inserting and deleting never counts. Pending marks expire after ten
  minutes.
- Browser-local favorites, recents and counts, plus a per-skill cooldown.
- Configuration: `label`, `cooldownMs`, `maxHeight`, `labels`, `descriptions`.
- Localized UI (Simplified Chinese and English).
- Artifact gate (`build.mjs`) and two test layers: an offline behaviour test and
  a CDP-driven real-page verification.

[Unreleased]: https://github.com/GuaiWuA/dsh-skill-bar/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/GuaiWuA/dsh-skill-bar/releases/tag/v0.1.0
