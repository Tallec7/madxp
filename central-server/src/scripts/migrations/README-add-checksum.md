# Migration: Add checksum column to videos table

## Date
2025-12-18

## Purpose
Add SHA256 checksum column to the `videos` table for file integrity verification.

## Changes
- Adds `checksum VARCHAR(64)` column to `videos` table
- Creates index on checksum for faster duplicate detection
- Updates base schema files (`init-db.sql` and `full-schema.sql`)

## How to Apply

### For existing databases:
```bash
psql -d your_database_name -f add-checksum-to-videos.sql
```

### For new installations:
The `init-db.sql` and `full-schema.sql` files have been updated to include this column automatically.

## Impact
- **Non-breaking change**: The column is nullable, so existing records are not affected
- **Performance**: Adds an index for faster lookups
- **File integrity**: Enables detection of duplicate files and verification of upload integrity

## Rollback
If needed, you can remove the column with:
```sql
DROP INDEX IF EXISTS idx_videos_checksum;
ALTER TABLE videos DROP COLUMN IF EXISTS checksum;
```

## Related Issue
Fixes video upload error: `column "checksum" of relation "videos" does not exist`
