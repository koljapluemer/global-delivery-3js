import { AvailableVehicleTypes } from "../db/vehicles"

export interface Vehicle {
    name: string
    vehicleType: (typeof AvailableVehicleTypes)[keyof typeof AvailableVehicleTypes]
    hue: number // first value of a HSV color
}

export interface VehicleRef {
    readonly kind: "Vehicle"
    id: number
} 