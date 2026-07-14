# Resource hashes

Canonical bytes: the file as committed (UTF-8, LF line endings, trailing newline as in git).

| Resource ID | File | SHA-256 |
|-------------|------|---------|
| `carry-on-weekend-v1` | `carry-on-weekend-v1.json` | `732b93363e8bc6003c2332df6b6cc4ee9a5e93c900d24f3bb4c33cf2974d50a2` |

Verify:

```bash
shasum -a 256 packages/plugin-x402/resources/carry-on-weekend-v1.json
```
