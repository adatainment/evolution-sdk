---
"@evolution-sdk/evolution": patch
---

Fix Koios `getProtocolParameters` returning stale epoch data on preview by explicitly ordering `epoch_params` descending
