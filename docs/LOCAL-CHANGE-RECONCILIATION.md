# Reconciliation of the unfinished local changes

The maintenance branch starts from GitHub main `c8eea82a5e544e1c64a63d590f0585b12db8ac56`. The original local checkout remains at `8a918e7`; its six modified files and two untracked files were preserved, and its tracked diff was archived outside the release repository.

| Local change | Candidate treatment |
| --- | --- |
| Channel-native control recovery | Retains current main's exact host-command precedence and rejects an unrelated explicit query in a retained workflow. It does not copy the local broad word matcher, which could treat ordinary mentions of “provider” as commands. |
| Non-string channel root IDs | Supports string and numeric protocol IDs, with request-scoped receipt files. Unrelated request roots cannot share a global suppression latch. |
| Detailed host/workflow probes | Preserved in the original checkout. Production keeps bounded command names in audit events; speculative object probes are not needed to perform controls. |
| Unpublished V47 host marker | Not transplanted from the older checkout. Adapter content is verified by reconstruction, with the original published beta.45/beta.46 transformation retained for authenticated upgrades. |
| Local test updates | Replaced by behavioral regression cases against current main, including fresh controls, unrelated requests, modified hosts, and old-backup fallback. |
| Local channel latch file | Runtime state, excluded from source and release payload. |
| Development workflow probe script | Preserved locally; not included in the user installer. |

This reconciliation is not evidence of live channel correctness. The candidate still requires the exact live channel and fresh-Bot release gates.
