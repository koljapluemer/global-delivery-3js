import { AvailableVehicleTypes } from "../db/vehicles"

export interface Vehicle {
    readonly kind: "Vehicle"
    id: number
    name: string
    vehicleType: (typeof AvailableVehicleTypes)[keyof typeof AvailableVehicleTypes]
}

