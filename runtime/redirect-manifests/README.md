# Reviewed cutover manifests

This directory is deliberately empty until the IndieTools migration produces a
final, zero-review `thefastestweb-redirects-v1-<digest-prefix>.json` artifact.
The release image copies that exact artifact read-only and the runtime verifies
its full digest again before opening the HTTP port.

Never hand-edit or rename a generated manifest. Follow
[`docs/INDIETOOLS-CUTOVER.md`](../../docs/INDIETOOLS-CUTOVER.md).
