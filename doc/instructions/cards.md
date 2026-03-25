Then let's add the following cards to the game: Get a boat, get a   
  car, get +500 time, get an additional crate dropped. I created assets         
  (including a background) in @src/assets/cards.   

Find a decent, not overengineered, but extensible architecture.
We have the following scenarios:

First, understand that the player only has an ephemeral card inventory.
Cards are instantly executed when owned.

We also need a screen that sort of "full screen" blocks play, allowing the player to pick n cards.
In this case, the player picks one, it gets executed, and then if more cards are to be picked, we go back to the screen, until nothing left to pick.

Actually, in the beginning of the game, show this screen with "pick 2 cards", giving the player
exactly a "Get a boat" and "Get a Car" card.

Activating these cards mean we go into vehicle placement mode.
This should work similar to how pins are placed on the map (with a preview of the vehicle mesh, left click confirm, and so on). 
Of course, for vehicles, they may only be placed on empty tiles in their nav mesh.
After the placement is confirmed, we have a pop-up to set the primary color and the name of the vehicle.

The other two cards cannot be accessed yet, they are mostly there to showcase in which directions the architecture has to be kept open for extension.