INSERT INTO `user_settings` (`key`, `value`, `description`, `created_at`, `updated_at`)
VALUES
  (
    'model.default',
    '',
    'Default model for chat and coding tasks.',
    CAST(unixepoch('now') * 1000 AS integer),
    CAST(unixepoch('now') * 1000 AS integer)
  ),
  (
    'model.compaction',
    '',
    'Preferred model for conversation compaction summaries.',
    CAST(unixepoch('now') * 1000 AS integer),
    CAST(unixepoch('now') * 1000 AS integer)
  ),
  (
    'model.title',
    '',
    'Preferred model for generating session titles.',
    CAST(unixepoch('now') * 1000 AS integer),
    CAST(unixepoch('now') * 1000 AS integer)
  ),
  (
    'compaction.auto',
    'true',
    'Enable automatic context compaction when token usage reaches the configured threshold.',
    CAST(unixepoch('now') * 1000 AS integer),
    CAST(unixepoch('now') * 1000 AS integer)
  ),
  (
    'compaction.prune',
    'true',
    'Prune old tool outputs before generating a compaction summary.',
    CAST(unixepoch('now') * 1000 AS integer),
    CAST(unixepoch('now') * 1000 AS integer)
  ),
  (
    'compaction.reserved',
    '20000',
    'Reserved token headroom used when deciding whether to compact.',
    CAST(unixepoch('now') * 1000 AS integer),
    CAST(unixepoch('now') * 1000 AS integer)
  ),
  (
    'appearance.mode',
    'system',
    'Preferred appearance mode: light, dark, or system.',
    CAST(unixepoch('now') * 1000 AS integer),
    CAST(unixepoch('now') * 1000 AS integer)
  ),
  (
    'appearance.theme',
    'default',
    'Selected application theme name.',
    CAST(unixepoch('now') * 1000 AS integer),
    CAST(unixepoch('now') * 1000 AS integer)
  ),
  (
    'onboarding.status',
    'pending',
    'Tracks whether onboarding is pending or completed.',
    CAST(unixepoch('now') * 1000 AS integer),
    CAST(unixepoch('now') * 1000 AS integer)
  )
ON CONFLICT(`key`) DO UPDATE SET
  `description` = excluded.`description`;
