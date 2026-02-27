import type { VehicleType } from "../types/VehicleType";

export const AvailableVehicleTypes: Record<string, VehicleType> = {
    "basic_car": {
        baseCapacity: 2,
        baseMovementCost: 1,
        baseSpeed: 10,
        meshPath: "assets/items/vehicles/car.glb",
        offsetAlongNormal: 0.0065,
        scale: 0.008,
        navMesh: "LAND"
    },
    "small_boat": {
        baseCapacity: 2,
        baseMovementCost: 1,
        baseSpeed: 5,
        meshPath: "assets/items/vehicles/boat.glb",
        offsetAlongNormal: -.01,
        scale: 0.008,
        navMesh: "WATER"
    }
} as const