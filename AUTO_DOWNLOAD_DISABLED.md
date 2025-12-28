# Auto-Download Disabled

**Date:** November 15, 2025
**Reason:** Prevent wasted compute costs from failed retry loops

## What Changed

Auto-download has been **disabled** for all movie operations:
- Creating new movies
- Updating movie videoUrl
- Bulk importing movies

## What This Means

**Videos now work via embeds** (YouTube/Vimeo/etc) - which is:
- ✅ **Free** - No bandwidth or compute costs
- ✅ **Reliable** - Direct from source, no downloads to fail
- ✅ **Works perfectly** - Your video player handles embeds seamlessly

## Manual Downloads Still Available

When you specifically want to self-host a video:

1. **Admin Dashboard** - Click "Download & Host" button on any movie
2. **API Endpoint** - `POST /api/movies/:id/download-and-host`

This gives you control over when downloads happen, preventing automatic retry loops.

## Cost Savings

By disabling auto-download, you avoid:
- Failed download retries consuming compute time
- Bandwidth costs from re-downloading the same data
- Storage costs from partially downloaded files

Your platform will continue working perfectly using embeds, and you can manually trigger downloads only when needed.
