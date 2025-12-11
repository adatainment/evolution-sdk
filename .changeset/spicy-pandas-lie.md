---
"@evolution-sdk/devnet": patch
---

Fix module resolution error by moving @noble/hashes from peerDependencies to dependencies. This resolves the "Package subpath './blake2' is not defined by exports" error when users install the package.
