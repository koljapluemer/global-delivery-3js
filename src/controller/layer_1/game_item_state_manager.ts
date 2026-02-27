import { AvailableVehicleTypes } from "../../model/db/vehicles";
import type { Plan } from "../../model/types/Plan";
import type { Timestep } from "../../model/types/Timestep";


export class GameItemStateManager {


    private demoPlan: Plan = {
        steps: [
            {
                28068: {
                    kind: "Crate",
                    destinationCountry: "Ghana",
                    isGhost: false
                },
                3399: {
                    id: 0,
                    name: "My small Car",
                    kind: "Vehicle",
                    vehicleType: AvailableVehicleTypes["basic_car"]
                },
                28065: {
                    kind: "Crate",
                    destinationCountry: "Germany",
                    isGhost: false
                },
                20604: {
                    kind: "Crate",
                    destinationCountry: "Germany",
                    isGhost: false
                },
                3400: {
                    kind: "Vehicle",
                    id: 1,
                    name: "MS Boat",
                    vehicleType: AvailableVehicleTypes["small_boat"]
                },
            }
        ]
    }

    getStepAtIndex(i: number): Timestep {
        return this.demoPlan.steps[i]
    }
}