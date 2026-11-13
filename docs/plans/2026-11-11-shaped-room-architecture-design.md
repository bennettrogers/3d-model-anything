# Shaped room architecture design

Status: independently approved on 2026-11-11; review details are recorded in the execution log. This document authorizes no implementation. The next step is the user's scope decision.

## Outcome and stopping conditions

Enable the existing scan-to-Three.js workflow to retain shaped wall boundaries and build editable gabled or sloped-top walls. Then, in a separately authorized local modeling pass, use the existing bonus-room capture to establish the room's architecture before furnishing it.

The reusable software slice stops when conversion preserves outlines, the runtime builds the supported profiles with correct openings, synthetic geometry checks pass, and the existing office still renders correctly. The subsequent private architecture pass stops at a reviewed shell containing the footprint, shaped walls, main roof planes, skylight nook and well, and architectural openings. Furniture, materials refinement, and full reconstruction are later work.

## Evidence and limits

Repository baseline: `31b2dc9`. `bundle_to_room.py` currently exports wall length and height but discards RoomPlan `polygonCorners`. `packages/room-runtime/walls.ts` creates rectangular slabs even when the source wall has a gable or sloping top. These are concrete reusable gaps; they do not prevent a one-off room module from using custom Three.js geometry today.

The local capture review found usable wall polygons, a classified ceiling mesh, and photographs covering the cathedral ceiling and skylight nook. The evidence supports starting with the current scan. It does not establish survey accuracy or fully determine every skylight-well junction. Scan mesh, RoomPlan polygons, and photographs must be compared rather than treating any one as exact ground truth. The capture and review images remain private and ignored.

The iPhone app already supports continuing saved scans and retaining selectable scan versions. A selected export contains that version's own capture data; it is not an automatic union of every prior version. Scanner changes, scan merging, and a rescan are outside this proposal. Targeted additional photographs or measurements should be requested only if the architecture pass identifies a specific unresolved junction or dimension.

## Options and total estimated investment

Estimates include authoring, setup, verification, visual checking, and independent review where applicable. They exclude a furnished reconstruction and are planning estimates, not approved implementation budgets.

| Option | Estimated total | What it achieves | Residual |
| --- | --- | --- | --- |
| Room-only custom shell using existing Three.js shapes | 2–4 hours | Cheapest sufficient route to an editable, correctly shaped room shell | Room-specific profile extraction and slab code; converter and shared builder still lose shaped-wall information for future rooms |
| Preserve outlines in the converter only, then author custom room-local slabs | 2–3 hours converter/docs, plus 2–4 hours private shell | Cheapest reusable improvement; source boundaries stop being lost | Shared wall builder stays rectangular; each shaped room still authors its slabs and openings locally; no new runtime test runner or browser fixture |
| Preserve outlines and extend the shared wall builder, then author the private shell | 4–8 hours reusable software, plus 2–4 hours private shell | Reusable shaped-wall support and the same architecture-first modeling outcome | Roof planes and skylight wells still need explicit modeling; supported runtime profiles are deliberately bounded |
| Infer arbitrary ceilings and skylights automatically from meshes | Multiple days; not costed further | Potentially reduces later manual architecture authoring | New inference, topology, and validation problem with uncertain accuracy; unnecessary for this room |

The selected planning direction is the converter-plus-shared-builder option, reflecting the user's request to plan the reusable improvement. Both cheaper options remain viable for the pending scope decision. The current planning and review session does not approve an implementation budget. If implementation is chosen, use one cohesive software PR; do not turn this into a multi-PR platform program. If the user instead selects converter-only, execute Task 1 with the relevant conversion/skill documentation and independent implementation review; omit runtime changes, the runtime fixture, and the new Node test dependency.

## Conversion contract

Every newly converted wall gains `outline: number[][]`, an ordered boundary of `[u, v]` coordinates in meters. `u` uses the wall's final inward-facing horizontal basis; `v` is elevation above the converted room floor. The existing `origin.y = 0` convention remains. Existing `height` remains the source bounding-box height, not a ceiling elevation or a second authority over the outline.

For a nonempty RoomPlan polygon, transform each corner through the surface transform and `worldToRoom`, then project into the final wall basis. This must happen after the converter decides whether to reverse `u`. Preserve vertical offsets and asymmetric profiles. Normalize winding to counterclockwise and choose a deterministic starting vertex; remove only a repeated closing vertex. Round coordinates to four decimal places, consistent with wall positions.

An empty or absent `polygonCorners` in the current source format denotes the source rectangle: construct its four corners from the surface transform and dimensions, including its actual vertical offset. This is an explicit source-shape case, not a fallback for old converted JSON. Reject nonfinite, degenerate, nonplanar, or self-intersecting source boundaries with a wall-specific error before writing output. Use a 1 mm geometric tolerance; do not silently flatten invalid geometry. Existing room selection, `--turn`, photo metadata, opening metadata, and house placement behavior remain unchanged.

The converter preserves simple planar boundaries beyond the runtime subset below. It does not fit ceilings, repair wall junctions, or force captured wall bottoms onto the floor. It also does not infer skylights from the vertical-window list. `house_to_rooms.py` should continue forwarding the converted fields without a second conversion path.

## Runtime contract

Keep rectangular walls as a supported authoring mode with their current defaults. Add an explicit profile mode to `WallDef`, expressed as a TypeScript union over the existing common wall properties:

- Rectangle mode: no `topProfile`; existing `height`, crown, extensions, panels, and opening behavior.
- Profile mode: `topProfile: readonly (readonly [number, number])[]`; `height?: never`; explicit `crown: false`; explicit `ext: [0, 0]`; no picture-frame panels; rectangular openings only.

Profile mode accepts at least two finite `[u, v]` top points with strictly increasing `u`, positive `v`, and endpoints at `u = 0` and `u = length`. Construct the horizontal floor edge and vertical ends internally. This covers gables and asymmetric or clipped sloping tops without accepting arbitrary polygon winding, non-horizontal bottoms, or self-intersections. Reject unsupported profiles with a useful error before adding meshes. Use a 1 mm comparison tolerance for serialized endpoint coordinates. The converter's preserved source `outline` and the runtime's authored `topProfile` are deliberately different: a room author must make any scan-to-idealized-floor adjustment explicitly, using source evidence, rather than passing a captured polygon directly into the runtime.

Derive the profile wall's maximum elevation from its top points. Build the slab from that boundary; splice floor-reaching rectangular openings into the bottom boundary, and create contained interior openings as holes. For each opening, check the entire horizontal interval against the piecewise-linear top, not just the two ends. Reject overlapping openings, side/top edge contact, out-of-range coordinates, and insufficient clearance for requested casing. Apply these new restrictions to profile mode; preserve the existing rectangular path and arched windows.

Use the existing extrusion, wall matrix, material groups, baseboards, and casing helpers. Verify exposed slab ends stay painted and opening reveals retain the trim material. Disable crown and extensions by contract for profile walls rather than inventing roof-following trim or extrapolated corner geometry. A shaped wall requiring arches, curved boundaries, non-horizontal bottoms, or ornate trim remains explicit custom room geometry in this slice.

Do not add format-version probing, old converted-file fallback logic, automatic regeneration of checked-in scans, polygon-boolean dependencies, or a ceiling inference subsystem. Existing authored rectangular walls are a first-class supported mode, not a legacy data format to detect.

## Test and integration approach

Use fictional synthetic RoomPlan inputs in Python tests for rectangles, raised source rectangles, gables, asymmetric clipped tops, reversed wall directions, translated floors, quarter turns, openings, and house conversion. Assert transformed vertices against independently calculated coordinates, not snapshots regenerated by the production helper. Keep all private capture geometry and images out of fixtures and commits.

Before opening the software PR, also run the new converter on the already reviewed local capture and any other raw bundle available locally, writing only ignored outputs. Confirm every wall converts, source rectangles agree with their source boxes, and transformed outlines preserve the source boundaries. Check outline extents against wall length and source height without assuming a zero source bottom. Compare the same selected room's JSON with `main`'s converter: after removing the added outlines, every preexisting field must be identical. Log pass/fail and largest deviations only, without private coordinates. Any rejected real wall triggers the unsupported-profile scope checkpoint before the PR; synthetic tests alone cannot validate the outside format.

Use Node's built-in test runner with one `tsx` development dependency to import the existing TypeScript runtime. Put JavaScript geometry tests under `tests/room-runtime/`; no new test framework or browser automation framework. Inspect shape and extruded triangles for coverage, holes, area, elevation, transform, and material assignment. Include a tiny fictional browser fixture for visual inspection of sloped surfaces and openings, outside the public demo registry and production build inputs.

The implementation must pass Python discovery, real-capture conversion checks, runtime geometry tests, the existing TypeScript/Vite build, and the public-boundary audit. Inspect before/after views of the existing office, plus the fictional shaped-wall fixture. The office exercises rectangular walls with crown disabled and rectangular openings; test default crown separately through `buildWall` with supplied plain materials, and test arches at the `wallShape` hole level. Do not call `buildWall` with an arch in Node: the existing `buildWindow` path initializes its own textured materials. Fixing that material path is outside this slice. Follow `github-visual-evidence` before collecting PR images. A numeric tolerance tests computational geometry, not the accuracy of the captured room. Avoid pixel-perfect render assertions or survey-grade claims.

## Later private architecture pass

Once separately authorized, use `scan-to-threejs` directly. First convert the selected room with `--room 0`, and reconcile outlines against the existing capture review. Author the main ceiling as explicit pitched planes; model the nook transition, skylight aperture, reveal/well, and glazing as separate editable surfaces. Use the scan ceiling and photo poses to choose junctions, not a rectangular ceiling generated from a single height. Set `BuiltRoom.wallTop` to the actual highest modeled surface and include all roof/well surfaces in `BuiltRoom.ceiling` for cutaway behavior.

Keep this work local and private. Before authoring it, choose a local-only preview arrangement that respects the repository's public demo allowlist; do not add the private room to `demos/index.ts`, broaden the public asset allowlist, or commit a room module containing private measurements. The local preview arrangement is a prerequisite of that later pass, not a new feature in the shared software PR.

Review one overall view, one ridge/eave view, and two views through the skylight nook, using matched capture photo poses where useful. Compare the floor boundary, wall/ceiling intersections, roof pitch, opening placement, and continuity through the nook. Record ambiguities and any measurement that would resolve them. Stop for the user's architecture review before furniture or finish detail. No automatic rescan request and no full-room quality claim follows from a passing software test suite.

## Delivery, recovery, and review

The reusable implementation is conservatively Tier A because it changes the converted geometry contract consumed by modeling tools. It requires this plan review and a later independent implementation review. The present planning-only slice changes documentation and is Tier C, with the explicitly requested independent design review in addition to self-review.

Implementation starts from `main` in a worktree under `.worktrees/`, on its own kebab-case branch. Run long commands through `agent-job`, record results in the dated execution log, and open a draft PR before implementation review. The current upstream remote grants this account read access; resolve a writable PR destination before pushing, without creating a fork or changing remotes implicitly. User approval remains required for merging or publication.

Recovery is to revert the cohesive software change and regenerate only its disposable conversion outputs. Raw captures are immutable inputs. Do not migrate or overwrite existing authored demos as part of this slice. A material expansion, unsupported real-room profile, or implementation estimate beyond the selected scope requires presenting findings and the cheapest sufficient alternative before further investment.
