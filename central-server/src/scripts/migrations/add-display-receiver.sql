-- v4.0 Phase 4 (DATA-01, DATA-02): backfill displays[i].receiver
-- Étend le JSONB sites.displays[i] avec un receiver optionnel.
-- Idempotent: la condition WHERE garantit que seuls les displays sans receiver
-- ET avec index = 0 sont rebuildés. Une 2e exécution est un no-op.
-- Préserve les autres displays (index > 0 restent sans receiver — il est optionnel).

UPDATE sites
SET displays = (
  SELECT jsonb_agg(
    CASE
      WHEN (elem->>'index')::int = 0 AND NOT (elem ? 'receiver')
        THEN elem || jsonb_build_object('receiver', jsonb_build_object('kind', 'pi_native'))
      ELSE elem
    END
    ORDER BY (elem->>'index')::int
  )
  FROM jsonb_array_elements(displays) AS elem
),
updated_at = NOW()
WHERE displays IS NOT NULL
  AND jsonb_array_length(displays) > 0
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(displays) e
    WHERE (e->>'index')::int = 0 AND NOT (e ? 'receiver')
  );

COMMENT ON COLUMN sites.displays IS 'N-display config: [{index, name, type, resolution, receiver?: {kind: pi_native|firestick|browser, mac?, last_seen_at?}}]. NULL = legacy dual (tv + secondary). HDMI #0 défaulte à receiver.kind=pi_native (v4.0 DATA-02).';
