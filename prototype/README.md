# PTG-21 Product Record State Machine Prototype

**THROWAWAY PROTOTYPE - DO NOT MERGE TO MAIN**

## Purpose

Test whether one synthetic packing-cube product record can preserve source-rights, freshness, reviewer-consent, disclosure, and human-review state through draft generation while rejecting every unknown or disallowed transition.

## Linear Context

- **Issue**: [PTG-21 - Test the PTG product-record state model](https://linear.app/scale-lean/issue/PTG-21/test-the-ptg-product-record-state-model)
- **Parent**: PTG-7 (Practical Travel Gear content and data flywheel)
- **Owner Decisions**:
  - PTG-9 Done: v1 product unit is one per-product record
  - PTG-10 Done: First category is packing cubes (thin slice)

## Question

Can one synthetic packing-cube product record preserve source-rights, freshness, reviewer-consent, disclosure, and human-review state through draft generation while rejecting every unknown or disallowed transition?

## One-Command Run Path

```bash
node prototype/ptg-21-state-machine.js
```

No dependencies required beyond Node.js runtime (already in this repo).

## What It Tests

The prototype demonstrates:

### ✓ Allowed Path
- Complete happy path from `draft` → `review-ready` when all conditions are satisfied

### ✗ Rejected Paths
1. **Unknown source rights** - cannot reach review-ready
2. **Missing reviewer consent** - cannot reach review-ready
3. **Stale required data** - cannot reach review-ready
4. **Missing disclosure** - cannot reach review-ready
5. **Failed human review** - cannot reach review-ready
6. **Transition to published** - NEVER allowed (hard boundary)

## State Model

### States
- `draft` - initial state
- `review-ready` - can be reached when all conditions met
- `published` - cannot be reached (prototype boundary)

### Required Conditions for `review-ready`
All five must be satisfied:
- `sourceRights === 'known'`
- `freshness === 'fresh'`
- `reviewerConsent === 'granted'`
- `disclosure === 'complete'`
- `humanReview === 'passed'`

## Logic Type

Simple finite-state machine with explicit illegal-transition errors. State transitions are validated against required conditions, and all rejections print specific reason(s).

## Safe Inputs

- Product: "SynCube 2000" (synthetic)
- Category: "packing-cubes" (synthetic)
- All facts are clearly fake - no real brand copy, reviews, or site content

## Mutation Boundary

- In-memory state only
- No network access
- No file writes (except console output)
- No database operations
- No cloud writes
- No production actions

## Hard Boundaries Observed

✓ Synthetic category, product, facts, rights, and consent only  
✓ No real reviewer samples, outside source content, or credentials  
✓ No real data, network access, or runtime secrets  
✓ No publication, task creation, cloud write, or production action  
✓ Clearly marked throwaway branch  
✓ Does not touch x402, wallets, or live CMS content  

## Output

The script prints **complete state after every action**, including:
- Product name and category
- Current state
- All five state flags (source rights, freshness, consent, disclosure, review)
- Transition log with success/failure reasons
- Verification summary

## Branch

`cursor/ptg-21-state-machine-prototype-d214`

## Evidence

Running the script demonstrates:
1. One synthetic packing-cube record moves through state transitions
2. Each rejected path prints specific blocking reason(s)
3. Happy path reaches `review-ready`
4. Transition to `published` is always rejected
5. Complete state is visible after every mutation

## Next Steps (NOT in this prototype)

This prototype validates the state model hypothesis. It does NOT implement:
- PTG-8: Field-contract implementation (deferred)
- Content pipeline integration (deferred)
- Real data sources (out of scope)
- Publication workflow (hard boundary)

## How to Tell It Is Done

✓ One-command run path documented  
✓ Running it prints complete state after every action  
✓ Demonstrates allowed path (to review-ready, never published)  
✓ Demonstrates all rejected paths listed above  
✓ PR opened against this repo, not merged  
