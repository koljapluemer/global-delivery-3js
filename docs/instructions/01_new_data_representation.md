Let's commit to a new data representation, using intents instead of object-position-at-timestep.

From now on, the `Plan` should be a sort of (SORT OF!!) Gantt Chart.
I created `docs/inspiration/gantt-style-plan.html` as a rough visual mock about the kind of data structure it is (please don't leave the visual design so ugly, this is just a structural mock).

Properties of new `Plan` paradigm:

- Ordered List of Steps
- two types of steps: `journey` steps and `cargo` steps
- `journey` and `cargo` steps alternate, but `cargo` steps may be empty, and then there shouldn't really be displayed in the plan sidebar

## General Notes

- Any given tile on the map may only be occupied once ACROSS THE WHOLE PLAN. E.g., it is not allowed to have two vehicles on the same tile, even if vehicle A would leave this tile before vehicle B wants to arrive. This is for rendering simplicity, and maybe also helps with the data model.
- Don't allow setting illegal intents at "interaction time". Yes, intents may become invalid due to dependencies changing and we must handle that, but while the user is setting a route pin or a crate unload tile, don't even allow them to target a journey target outside the nav mesh, an occupied tile or a full vehicle for loading. Prevent illegal actions as far as possible
- For now, track but don't enfore global `traveltime`. Let the budget go into the negative.
- Mark invalid intents with a `small_bubble.png` placed at e.g. the loading arrow. On the bubble, show an "invalid" icon and offer an icon button to delete the intent. use the same icon/button combination in the plan overview.

## Journey Step

A journey step is a list of I-want-to-move-this-vehicle-to-this-position steps.
They are executed *in parallel*, and thus visualized in a row.

A journey step has a certain `traveltime`.
Given the parallelism, the `traveltime` is exclusively determined by how long the journey within it with the SHORTEST `traveltime` takes.
Thus, the user has NO direct control over time, only by adjusting where a given vehicle goes.

These steps correspond fairly well to our game world so far: A pin in the map shows where a vehicle will go within a certain journey step; we can keep the labels with "#3" or whatever (meaning "this leg of the journey will happen in the fourth [=zero indexing] existing journey step").

Due to the parallelism, we know exactly where all vehicles are at the end of a journey step, without any weirdness.

In the plan sidebar, it should be possible to drag & drop any movement intents into another journey step.
Note that as soon as such a drag event starts, we need to show certain "ghost" journey steps as drop targets:

- Any currently hidden journey steps (if there are any), should become available as a box to drop the intent in
- There is always a "-1 index" step, such as that even an intent currently in the first existing journey step, it can be moved "earlier" to a journey step above
- There is always a "max index+1" step, such as that even an intent currently in the last journey step of the plan can be moved to be "later"

Any vehicle may only do ONE movement within a journey step.
If the user drags an intent of a vehicle into a journey step that already has an intent for that vehicle, REPLACE that, as in delete (not "make invalid", DELETE) the previous intent. This can after all be undone with the undo/redo discussed below.

When the player selects a vehicle without any route yet and does the "new route pin" flow, or adds another pin to the end of the route, always add these intents to the EARLIEST POSSIBLE journey step (ie an existing journey step that has no intent for this vehicle yet)

Note that you must somehow encode the not-player-changeable initial position of the vehicles on the map.

I believe that journey intents can never be invalid.
We prevent illegal targets (occupied tiles, tiles outside the nav mesh, ...) at pin-placement time, so this is here of no concern.

## Cargo Step

A cargo step is a list of cargo action intents.
A cargo step has no `traveltime` cost, and may contain arbitrarily many cargo steps.
Cargo actions within a step are STRICTLY LINEAR.

There are the following actions:

- `LOAD`: loading cargo onto a vehicle. Valid if there's a vehicle on the (neighboring) tiles which still has capacity. When the user is creating this intent via the in-world UI, smartly detect validity, and smartly place it in the plan: For example, if a vehicle only arrives at a target tile at a certain point, put the intent in the first cargo step where it's actually valid. If the vehicle arrives at a certain point, but at that point has no capacity left, but then unloads, place the intent in the relevant cargo step behind the unload intent.
- `UNLOAD`: putting cargo out of a vehicle, onto an unoccupied, exactly neighboring tile.
- `DELIVER`: Just an unload, but onto a tile that belongs to the cargo's destination country. As such, the crate will then disappear (no ghost crate) and not be available further down the plan. We however still draw the unload arrow, and of course check if it's land and neighboring the vehicle, and count the tile as occupied.


Start caring about `capacity`. A given [vehicle](src/model/types/Vehicle.ts) may only load cargo according to its `capacity`, which for now it should simply inherent at instantiation from its [VehicleType](src/model/types/VehicleType.ts). A loading action is invalid if the receiving vehicle has not enough capacity left (for now, every crate simply takes 1 capacity).

Similar to journey intents, a cargo action intents can be dragged and dropped.
They can be dragged and dropped *within* their cargo step, and also to other cargo steps, and we show similar ghost steps as for journey steps, but with some conditions: show a drop target "before" the complete existing plan only if the first existing step of the plan isn't already a cargo step (since there is no difference between moving an intent to the start of a given step or to the end of a new step before that step), and only show a new drop target at the end of the plan if the last step of the plan isn't already a cargo step (same reason).

Note that there is a lot of potential for rippling invalidity here: If the player drags a `LOAD` action for a crate before the `UNLOAD` action of the same crate, that `LOAD` action will likely become invalid, and so will all subsequent `UNLOAD`/`LOAD` actions of that crate. Carefully and cleanly implement this.

Note that for cargo action intents, we don't auto-delete intents, but we set them invalid.

## Undo/Redo

Let's add a meta utility to keep track of versions of our plan.
Thus, the user can undo/redo their actions along a simple stack.
This interaction should be doable by using forward/backword lucide icons to be added to the top bar, or with Ctrl+Z and Ctrl+Y.

KISS; make a simple linear undo/redo.
When the user for example does undo, than changes an action, we simply nuke the rest of the stack, it's then no longer possible to `redo`. No crazy branching.
If you're confused about this, web-research simple undo/redo models. 
Type this cleanly.


# AI CONSIDERATIONS

● Good spec overall — the structure is sound and the reasoning about parallelism vs. linearity is correct. Here are the issues I found, roughly in order of severity.

  ---
  1. Typo: "SHORTEST" should be "LONGEST"

  "the traveltime is exclusively determined by how long the journey within it with the SHORTEST traveltime takes"

  The mockup contradicts this: the step height is 124, which is the taller of the two journey bars (car = 124, boat = 65). The correct rule is longest (maximum), because
  cargo can't start until all vehicles have arrived. If it were the shortest, a vehicle mid-journey would be participating in cargo actions, which is undefined. Almost
  certainly a typo.

  ---
  2. DELIVER contradicts the single-tile-occupation rule

  The spec says a tile may only be occupied once across the whole plan for rendering simplicity. DELIVER unloads a crate then removes it from existence. So: does the delivery
   tile stay "occupied" forever even though the crate is gone? If yes, that tile is permanently blocked for routing or any future cargo, which is extremely restrictive. If no
   — if DELIVER frees the tile — then you have a special case in the global occupation model that complicates everything.

  This needs a clear decision. The simplest resolution: delivery tiles are permanently occupied (the crate "exists" there forever from the model's perspective, just rendered
  differently). But that means a player can never deliver to a major port city and then have another vehicle stop there — which could be very frustrating.

  Related question: does a crate's starting tile remain permanently occupied for the whole plan, even after it's been loaded? The same issue applies.

  ---
  3. Independent cargo actions should NOT cascade-invalidate each other

  The spec says cargo steps are "strictly linear" but also that invalidity ripples from LOAD → downstream actions on that crate. These two things need to be distinguished:

  - Execution order is strictly linear (action 2 runs after action 1's effects are applied)
  - Invalidity should be per-crate chain, not positional

  If action 1 is Load crate A (invalid) and action 2 is Unload crate B from vehicle Y (completely unrelated), action 2 should not become invalid just because action 1 is
  above it. Invalidity should cascade only through actions that share a dependency on the same crate's state. The spec hints at this but doesn't say it explicitly.

  ---
  4. Vehicle position in cargo steps for vehicles that skipped a journey step

  A vehicle may have zero intents in a given journey step (it stays put). Where is it during the subsequent cargo step? The obvious answer is "wherever it was after the last
  journey step it participated in, or its initial position." This should be stated explicitly, because it determines which cargo steps a vehicle can participate in — a
  vehicle that hasn't moved since step 0 is still at its starting tile in cargo step 4.

  ---
  5. Can the plan start with a cargo step?

  The spec doesn't say. All vehicles start at some initial position, and crates start at ground tiles. It seems natural (and valid) that the player might want to load a crate
   onto a vehicle before anyone has moved — i.e., a cargo step before the first journey step. Does the alternating structure permit this? If not, why not?

  Related: how does the initial state get represented at all? "You must somehow encode the initial positions" is left vague. The most natural model is: initial positions are
  an implicit zeroth context, and the first step can be either a journey or a cargo step.

  ---
  6. Dragging a journey intent cascades into cargo invalidity — underspecified

  The spec says dragging a journey intent to a step that already has one for that vehicle replaces the old intent (delete, not invalidate). But the spec only mentions this in
   the context of journey-level drag. It doesn't address what happens to cargo actions that were valid because of the old intent's position.

  Example: car had intent [step 2: go to tile X]. A LOAD crate A in cargo step 2 was valid because car arrived at X adjacent to the crate. Player drags car's step-2 intent to
   step 3 instead (car now goes to tile Y in step 2 and X in step 3). The LOAD in cargo step 2 is now geometrically invalid. Does it become invalid immediately? Yes, but the
  spec should explicitly state this linkage.

  ---
  7. Empty journey steps — are they auto-pruned?

  Cargo steps may be hidden when empty. What about journey steps with no intents? Their traveltime would be 0. Should they be pruned automatically? Or should they remain in
  the list (perhaps as a structural placeholder)? The spec addresses empty cargo steps but not empty journey steps.

  ---
  8. Mockup terminology

  Line 2 of the mockup cargo step: "Little Boat transfers Crate to Brazil to spot in Argentina" — this is moving a crate from a vehicle to a ground tile, i.e. an UNLOAD (or
  DELIVER if the tile is in the crate's destination country). The spec defines only LOAD, UNLOAD, and DELIVER. Clean up the mock so it matches these action types.

  ---
  9. "Earliest possible journey step" auto-assignment is fragile at scale

  "add these intents to the EARLIEST POSSIBLE journey step (ie an existing journey step that has no intent for this vehicle yet)"

  For a vehicle adding its second, third, fourth route pin, this auto-assignment is predictable. But it could conflict with the player's mental model: they might add pin A
  (gets assigned to step 1), add pin B (gets assigned to step 2), then decide they want pin B to happen before pin A. They'd have to use drag-and-drop in the sidebar to fix
  it. That's fine, but the spec should note that the auto-assignment is a default that players will frequently need to override, and the drag-and-drop in the sidebar is the
  primary way to reorder.


# PLAYER ANSWER

1) you are absolutely right. LONGEST is correct. 2) Convinced me. Let's keep it consistent. Yes, delivery still blocks the tile the cargo is delivered to. However, let's  
  do add the ghost crate at that point, and above it spawn @src/assets/ui/checkmark.png (standard UI label, hide when behind globe) to show that it's correctly delivered.    
  Crate's starting tile stays permanently occupied, all tiles where crate's ever delivered to, temporarily or not, are also occupied (if only for visual clarity). 3) kinda.  
  Cargo actions are still strictly linear. Image we'd animate the loading action; in that case we would show the crate's movements one by one, strictly non-parallel, going   
  down the steps. However, of course you are right, this does NOT mean that invalidation should ripple to intents that are not, in fact, being invalidated. That's what I'm   
  saying. 4) yes, right. Both cargo and vehicle stay where they are (for cargo ofc this may mean "stay in a vehicle and go where it goes) until the next intent in however    
  many steps. 5) Yes, implement initial state as unchangeable zeroth context. Plans can then actually start with either step, depending on which action player plans first    
  or even determined by later drag and drop of the player when they drag an element before the current first step. 6) yes, you are right. Cargo intents can become invalid    
  in many ways, and one of them of course is one of the involved vehicles suddenly not being where they need to be. 7) Sure, feel free to prune. However, when dragging a     
  journey intent, show "ghost" drop targets basically everywhere: before/after every other journey step. On the topic of pruning: Also auto-merge two cargo steps directly    
  behind each other into one, since that's semantically the same 8) you are right, mock is wrong, it should be UNLOAD in that example 9) noted, but this is fine. Please      
  write a plan base    