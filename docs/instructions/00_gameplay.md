Let's build some basic gameplay.

We need mostly some economy, let's establish 3 resources:

- `traveltime`, symbolized with a clock
- `money` (we're not doing much with that yet)
- `stamps`

The goal for the player is to collect a required amount of stamps per round, to not lose.
Money can also be earned to buy upgrades and new vehicles (gonna implement that later).
`traveltime` is a per-turn budget, let's give the player 1000 for starters.

A [vehicle](src/model/types/Vehicle.ts) has the (newly established) prop `movementCost`, for now just directly derived from `src/model/types/VehicleType.ts`. This defines the `traveltime` cost per tile moved.

Thus, we can assign a cost to every route's leg now.
Indeed, we should add a label to route line's, showing the `traveltime` cost.

It should also show up in the plan.
However, there is one kink here:
We only count the highest `traveltime` per step.
So if vehicle A moves somewhere to timestep #2 with `traveltime` 72 and vehicle B moves somewhere with `traveltime` 23, we only show 72 in the plan, and we also only subtract 72 from the general `traveltime` budget.
When visualizing the `traveltime` on the label hovering a route leg, lower the opacity if it's a traveltime that "isn't counted". 

`src/model/types/Crate.ts` now should have a randomized `rewardMoney` (randomly 50-1000 in steps of 50) and `rewardStamps` (random whole number between 1 and 5). Show this information on the crate label (with a slim icon+number graphic), and on the right sidebar when the crate is selected.


Get RID!! of the [demo plan](src/model/db/demo_plan.ts).
Instead, at start of game, generate and place 6 crates all over the world (of course, only on unoccupied land tiles).
Also, place the two player vehicles randomly.
Make sure that each is placed on the biggest nav component of their respective navmesh (to avoid them to be stuck on tiny lakes or island tiles).

Show money and stamps in a to-be-established canvas UI on top left. Show `traveltime` budget in the same top bar, but on the right.

Implement cleanly. Type well, ensure that functions have single responsibility and are hack-free. CLeanly green build and lint. Research appropriate architecture patterns on the web before planning.