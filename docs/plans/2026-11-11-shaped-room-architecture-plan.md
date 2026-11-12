# Shaped Room Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. For this small, coupled change, prefer inline execution with `superpowers:executing-plans`; delegation is not required.

**Goal:** Preserve scan wall outlines and build supported nonrectangular walls, enabling a later private cathedral-ceiling room shell.

**Architecture:** Extend the existing converter with full wall-local source outlines, then add an explicit authored `topProfile` mode to the existing wall builder. Reuse the extrusion and opening machinery. Roof planes and skylight wells remain authored room geometry.

**Tech Stack:** Python standard library and Pillow; TypeScript, Three.js, Vite; Node built-in tests with `tsx` as one new development dependency.

**Spec:** [Shaped room architecture design](2026-11-11-shaped-room-architecture-design.md).

## Global Constraints

- This plan does not authorize implementation. Obtain the user's scope/budget decision first; reusable software is estimated at 4–8 hours, with a later private shell estimated separately at 2–4 hours.
- Use one cohesive software PR from `main`; keep worktrees under `.worktrees/` and follow the independent Tier A plan and implementation review gates.
- Every newly converted wall has a floor-referenced, counterclockwise `outline` of `[u, v]` coordinates in meters, rounded to four decimal places. Use a 1 mm geometric comparison tolerance.
- Rectangle and top-profile modes are explicit supported authoring modes. Add no legacy-format fallback, compatibility shim, ceiling inference, or polygon-boolean dependency.
- Keep captures, real-room measurements, photos, review images, and private room modules out of tracked fixtures and the public demo registry. Do not broaden `tools/audit-public.py` or `docs/public-assets.json`.
- Raw captures are immutable inputs. Test conversion outputs are disposable; do not overwrite checked-in scan assets or regenerate existing demos.

## Review Focus

- A gable that reverses its wall basis must retain its asymmetric peak position; Task 1 tests reversed `u`, winding, and all quarter turns.
- A source rectangle above the room floor must retain its vertical offset; Task 1 checks synthetic and real source boundaries, while Task 2 uses explicit authored top profiles rather than accepting captured polygons.
- A wide opening can intersect a low point between two top-profile vertices even if its endpoint checks pass; Task 2 tests full-interval containment and casing clearance.
- Defaults and material groups can regress existing walls; Task 2 covers rectangle geometry, default crown with plain materials, arch holes at shape level, and painted ends. Task 3 checks the office's actual crown-free rectangular walls.
- A passing wall test does not reconstruct a skylight well or validate capture accuracy; Task 3 documents the manual architecture boundary and the conditional pass below verifies it visually.

## Preparation and file map

Before implementation, recover the reviewed design and review result from the dated log. Reconfirm scope and budget, create the implementation worktree from `main`, and verify ignored `.worktrees/` and `.agent-loop/` handling without changing unrelated repository behavior. Resolve a writable PR destination before a push; current `origin` is read-only for this account. Do not install implementation dependencies in this planning slice.

Carry these reviewed documents from the planning commit onto the implementation branch created from `main`, and include them in the single software PR; do not stack on the planning branch or open a separate planning PR. The local planning branch is superseded once its documents are carried, with cleanup left until after integration.

| File | Responsibility |
| --- | --- |
| `.agents/skills/scan-to-threejs/scripts/bundle_to_room.py` | Project source wall boundaries into final wall coordinates and emit outlines |
| `.agents/skills/scan-to-threejs/scripts/test_wall_outlines.py` (new) | Synthetic conversion and invalid-boundary tests |
| `.agents/skills/scan-to-threejs/scripts/test_house_import.py` | Confirm house import retains outlines without duplicating conversion |
| `packages/room-runtime/walls.ts` | Explicit top-profile wall type, validation, shape generation, derived top, and material behavior |
| `tests/room-runtime/walls.test.mjs` (new) | Node geometry assertions using fictional dimensions |
| `tests/room-runtime/wall-fixture.html` and `wall-fixture.ts` (new) | Small synthetic browser fixture with no private assets or production registration |
| `package.json`, `package-lock.json` | `tsx` dev dependency and `test:geometry` script |
| `.github/workflows/check.yml` | Runtime geometry checks and Python discovery alongside existing release checks |
| `.agents/skills/scan-to-threejs/SKILL.md`, `references/modeling.md`, `references/house-capture.md` | Document shaped walls, source offsets, authoring limits, and explicit ceilings |
| `docs/plans/2026-11-11-shaped-room-architecture-log.md` | Evidence, review dispositions, and implementation results |

### Task 1: Preserve source boundaries in converted rooms

**Interfaces:** Add `project_wall_outline(surface, world_to_room, origin, u) -> list[list[float]]` in `bundle_to_room.py`. It consumes the current RoomPlan surface and the already selected final wall basis. Each emitted wall gains required `outline`; existing fields retain their meanings. Consumers do not infer an outline from old converted files.

- [ ] Write synthetic tests in `test_wall_outlines.py` for an empty-polygon rectangle, a vertically offset rectangle, a pentagonal gable, and an asymmetric clipped top. Include a translated floor, a reversed inward-facing `u`, and `--turn` values 0–3. Independently calculate expected wall-local elevations and horizontal coordinates, checking within 1 mm and checking counterclockwise winding.
- [ ] Add invalid-input tests for nonfinite coordinates, fewer than three distinct vertices, zero area, self-intersection, and a corner more than 1 mm outside the wall plane. Assert an actionable wall identifier/index in the failure and no newly written output file.
- [ ] Run `python3 -m unittest discover -s .agents/skills/scan-to-threejs/scripts -p 'test_wall_outlines.py' -v`. Confirm the new outline assertions fail before changing conversion.
- [ ] Implement the projection helper and call it only after the existing inward-normal decision. Transform real corners through the full surface and room matrices; derive source-rectangle corners only for empty/absent source polygons. Normalize winding/start, preserve non-closing vertices and source offsets, validate, and serialize at four decimals before output is written.
- [ ] Extend the existing synthetic house-import test to assert that active-room conversion retains the outline and that photo ordering, placements, and opening coordinates remain unchanged. Add an interior opening and a floor door to a shaped-wall conversion fixture; verify their coordinates share the outline's final basis.
- [ ] Before the software PR, run both the new converter and `main`'s converter on `data/captures-in/bonus-room` with `--room 0`, and on each other raw bundle available locally using its appropriate room selection. Use the same CLI options and write all results and any temporary baseline script under ignored `data/captures/`. Confirm all walls convert; compare each outline with its transformed source corners (or source box for empty polygons), and check its u/v extents against `[0, length]` and the source `height`, retaining any genuine vertical offset. Confirm every preexisting JSON field is identical after stripping only the new `outline` fields. Record pass/fail and maximum deviations only, without coordinates. If validation rejects any real wall, present the finding and cheapest sufficient alternative before opening the PR; do not silently relax checks or defer the first real-data run to room modeling.
- [ ] Run `python3 -m unittest discover -s .agents/skills/scan-to-threejs/scripts -p 'test_*.py' -v`. Expect every existing house test and the new boundary tests to pass. Record results and commit the coherent converter/test change.

### Task 2: Build bounded top-profile walls with correct cutouts

**Interfaces:** Export a `WallDef` union retaining the existing common properties and rectangle mode. Profile mode supplies `topProfile: readonly (readonly [number, number])[]`, forbids `height`, and requires `crown: false`, `ext: [0, 0]`, empty panels, and rectangular openings. A profile has at least two finite points, positive heights, strictly increasing u, and endpoints at 0 and `length`; the floor and vertical ends are constructed internally. Keep `wallShape(w, ext?) -> THREE.Shape`, `buildWall(w, materials?, ext?) -> THREE.Group`, and the existing wall-local matrix unchanged. Internal helpers derive maximum elevation and validate the supported profile; do not create a second wall builder or accept the converter's full source outline directly.

- [ ] Add `tsx` as one dev dependency and `test:geometry` with `node --import tsx --test tests/room-runtime/*.test.mjs`. Keep tests as JavaScript so this does not require Node type configuration for the application. Add a minimal first test importing `wallShape` from the existing TypeScript module; confirm it executes under the CI Node 22 environment after `npm ci`.
- [ ] Write failing shape tests using a fictional symmetric gable and an asymmetric top with an interior low point. Verify shape area minus opening area, peak elevation, and point coverage both above and below the slope. Include a floor-reaching door and a contained window; generate extruded triangles and assert no front/back triangle covers an opening's interior.
- [ ] Write rejection tests for fewer than two top points, repeated or decreasing u, missing/misplaced endpoints, nonpositive heights, nonfinite values, conflicting height, nonzero extensions, crown, panels, arch openings, overlapping openings, boundary-touching openings, and an opening or casing crossing any part of the top profile. Check errors describe the unsupported input. Preserve rectangle geometry and test arch holes at the `wallShape` level; do not use the textured `buildWindow` path in Node.
- [ ] Run `npm run test:geometry`. Expect top-profile geometry/validation assertions to fail against the rectangular implementation while the existing rectangle assertions pass.
- [ ] Implement the union and focused profile validation in `walls.ts`. Retain the rectangle path. Construct the floor edge, vertical ends, and reverse top chain, with ordered bottom notches and contained holes; derive the shaped top from `topProfile`, never from `height`. Check the top at every breakpoint in an opening/casing interval, plus both interval endpoints.
- [ ] Exercise `buildWall` for rectangle and top-profile walls with rectangular openings using explicitly supplied plain materials, so tests need no textures or DOM. Separately assert the default rectangular crown is present and respects height with those materials. Check nondegenerate finite triangles, world transform, thickness, material groups on exposed ends and opening reveals, and the maximum elevation. Ensure invalid definitions fail before any partial group is returned. Leave the existing arch material initialization unchanged.
- [ ] Add the tiny fictional browser fixture showing a rectangle beside a gable and asymmetric wall, each with openings. Keep it outside `demos/index.ts`, outside production build inputs, and free of captured data. Use the existing Vite repository filesystem allowance for local viewing; do not add another server or viewer framework.
- [ ] Run `npm run test:geometry` and `npm run build`; expect both to pass. Record evidence and commit the runtime, fixture, tests, and dependency lockfile changes together.

### Task 3: Integrate checks, teach the workflow, and review the software

**Interfaces:** `house_to_rooms.py` remains the house entry point; `bundle_to_room.py --room N` remains the shared-room entry point. `BuiltRoom.ceiling` continues accepting explicit Three.js surfaces, and `wallTop` remains the room's actual maximum modeled elevation. No changes to app capture lifecycle, public room registry, or runtime reference loading are planned.

- [ ] Update CI to run `npm run test:geometry` and Python unittest discovery instead of only the single house-test file. Preserve the public audit and existing build. Reuse existing runners; add no standalone verification ledger or new CI service.
- [ ] Update the skill and the relevant modeling/house references with the full source outline contract, source offsets versus explicit authored top profiles, rectangle/profile modes, unsupported profile errors, explicit pitched ceilings and skylight wells, and the architecture-first stopping condition. Explain that scan continuation does not automatically merge version exports.
- [ ] Run the complete scoped checks: `python3 -m unittest discover -s .agents/skills/scan-to-threejs/scripts -p 'test_*.py' -v`, `npm run test:geometry`, `npm run build`, `python3 tools/audit-public.py`, and `git diff --check`. Stage intended new files before the audit because it examines tracked files. Use `agent-job` for commands expected to exceed 20 seconds and inspect numeric exit files.
- [ ] Follow `github-visual-evidence` and inspect the synthetic browser fixture plus matching before/after office captures. Verify slopes, peak, cutouts, reveals, and painted ends in the fixture, and unchanged office rectangular slabs/openings with crown disabled. Crown is covered by the plain-material unit test; arches are covered at shape level, not by this office. Confirm the fixture is not a production entry point and no private files are tracked. Reuse valid results rather than repeatedly running the full suite.
- [ ] Update the dated execution log with changed files, rationale, exact successful checks, visual evidence locations, and any limitation. Open a draft PR against the chosen writable destination. If no destination is available, complete local work and stop before push/review publication; do not create a fork implicitly.
- [ ] Run the cross-agent controller's Tier A implementation phase with the design, plan, and log against `main`. Disposition every advisory; fix and independently resolve blockers. Bind the finalized review to the final implementation commit using `review-attest` before merge. Stop with the reviewed PR for the user; merging, deploying, and publishing remain outside authorization.

## Conditional later pass: Private architecture shell

This pass begins only after the user chooses to proceed with room modeling. It is not part of the reusable software PR and cannot begin merely because this plan passes review.

- [ ] Choose a local-only preview location and loading method before authoring a private module. Preserve the public demo allowlist and avoid tracked changes containing private dimensions; if the existing layout cannot do that simply, present the smallest local-preview option before expanding the software scope.
- [ ] Apply `scan-to-threejs` to the existing selected capture with `--room 0`, writing disposable outputs under ignored `data/captures/`. Inspect converted outlines against the preserved source and ceiling mesh. Record any evidence-based floor idealization rather than silently rewriting the captured boundary.
- [ ] Build only the shell: footprint, shaped walls, main pitched roof surfaces, architectural openings, nook transition, skylight aperture, well/reveals, and glazing. Keep roof and well surfaces editable and in `BuiltRoom.ceiling`; set `wallTop` from the actual highest surface. Use a separate custom surface for any unsupported wall rather than weakening shared validation.
- [ ] Compare an overall view, a ridge/eave view, and two nook views against matched photo poses and scan sections. Verify continuity and recognizable architecture; record uncertainties without asserting survey accuracy. Request a targeted photo or dimension only for a named ambiguity that the capture cannot resolve.
- [ ] Present the private shell for the user's architecture review and stop. No furnishings, finish pass, app scanner changes, or full reconstruction follow automatically.
