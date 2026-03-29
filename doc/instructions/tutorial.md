Let's replace the minial how-to-play UI with a proper tutorial, accessible from main screen.

The tutorial generally is a "cropped" part of real gameplay, basically a mini-turn. 
We also need an instruction box on top center of the UI, telling the player things.

Each such slide should have reasonable check conditions allowing to player to click on a "Next" button to go to next tutorial slide,
and a always-avaialble "Reset" button resetting the state of the slide.

Engineer this well.

## Slide 1

Spawn one car, one crate adjacent to it, with destination "Malawi".
pan to car.
Also, "Malawi" should be country-highlighted.

Instruction (paraphrased): your job is to deliver crates. Select the crate, then load it into the vehicle. then click on vehicle, and schedule driving it to Malawi. There, schedule to unload the crate again by clicking on the vehicle and selecting from menu. Once you done all that.

Success when after turn animation crate is actually delivered.

Car: Tile 13273
Crate: Tile 13272; 

## Slide 2

Similar, but now spawn one car (13214) and a ship(13566). Pan view to car.
One crate (13099), target country Madagaskar. 

Point of the lesson is to load the crate on the ship, unload it at the coast, pick it up from the coast with the ship, and deliver it to Madagascar.
Country-highlight Madagascar

## Slide 3

Point here is to explain that players can also interact with the cargo plan.
Start with a plan where two cars (13050, 13051) exist, both with a crate already loaded, both already scheduled to go to their respective target countries (13000 target, unloading to tile 13001 for target country Tanzania; going to 711 unloading to 30839 for target country South Africa), but AFTER ANOTHER, in two journey steps.
Explain to the player that they they are getting billed for overall time spent, so it's worth ideally coordinating their vehicles.

Success conditions is crates being delivered, within a single journey step

## End

After the last "Next" button, just start the Daily Challenge automatically.