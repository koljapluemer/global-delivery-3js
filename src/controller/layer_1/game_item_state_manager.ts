import type { Plan } from "./types/Plan";
import type { Timestep } from "./types/Timestep";


export class GameItemStateManager {


    private demoPlan: Plan = {
        steps: [
            {
                28068: {
                    destinationCountry: "Ghana",
                    isGhost: false
                },
                28065: {
                    destinationCountry: "Germany",
                    isGhost: false
                },
                           20604: {
                    destinationCountry: "Germany",
                    isGhost: false
                },
            }
        ]
    }

    getStepAtIndex(i:number): Timestep {
        return this.demoPlan.steps[i]
    } 
}