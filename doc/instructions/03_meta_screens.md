You see here a prototype for a route-setting/delivery game's core interaction, scheduling vehicle routes.

Let's build some of the required meta screens that will eventually make this a game.

We want to have the following infinite progression

0. MAIN MENU
1. SHOP
2. START LEVEL
3. PLAN, ANIMATE, PLAN, ANIMATE, PLAN, ANIMATE, PLAN, ANIMATE
4. LEVEL EVALUATION
5. new loop, starting from SHOP

`PLAN` is the screen that we currently have. I will now describe you the minimal needed implementation for the other screens

## MAIN MENU

Nothing but a button "Start Game"

## SHOP

Also just a mock.
A heading "Shop", and a button "To Level"

## START LEVEL

Here, the player will eventually make choices regarding the next level.
For now, just a <p> with "Earn at least 10 stamps" and a button "Start Level"

The player's inventory of the *stamps* currency is per level, so it is reset at this point.

## PLAN

As I said, this is the game as it currently is.
We need some additions:
- "Confirm Plan" button below the plan on the left sidebar. Disabled if current `traveltime` budget is overrun (=traveltime in the top bar is less than 0) or if plan contains invalid intents

## ANIMATE

After the plan is confirmed, we should have a new mode:
We still see the globe and all that, but it's not interactive (nothing can be clicked or hovered and the camera isn't player controlled).
Then, we should animate the plan step by step, as in *actually drive the vehicles where they are scheduled to go*, animate loading/unloading crates (show loaded crates on top of the vehicle's mesh) with a quick movement animation, and so on.
When a crate is delivered within this animation, now actually destroy it and add the money and stamps to the user's economy, and display correctly in the top bar.

*...then, go back into plan mode, of course keeping the vehicle's positions and remaining crate's positions, as the user has four turns per run*

## LEVEL EVALUATION

After the last ANIMATE, go to a level evaluation screen.
Give a quick overview of how many crates the player delivered, how far vehicles have driven, how much money earned this level, that kind of stuff.
If the player earned at least the goal of stamps (currently hardcoded to 10), show "success", and show a "Next" button that brings the player to the next SHOP.
If earning goal not reached, show "Back to Menu" which brings player to MAIN MENU


# Meta

- as you can probably guess, all these screens are going to grow in complexity later. Implement this very cleanly on every level (HTML, states, event flow, patterns)
- prefer many files/functions/classes that work on ONE level of abstraction and have ONE purpose over god objects
- type everything well, ensure build and lint are green
- web (yes, WEB!!!!!!!!) research relevant UI patterns, helper libraries and paradigms and architecture patterns before deciding on an implementation