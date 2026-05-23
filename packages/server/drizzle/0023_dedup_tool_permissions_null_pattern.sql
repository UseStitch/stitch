-- Remove duplicate global (pattern IS NULL) rows per tool, keeping the most recently created one.
-- Caused by SQLite treating NULL != NULL in unique indexes, making onConflictDoUpdate a no-op.
DELETE FROM tool_permissions
WHERE pattern IS NULL
  AND id NOT IN (
    SELECT id FROM tool_permissions
    WHERE pattern IS NULL
    GROUP BY tool_name
    HAVING id = MAX(id)
  );