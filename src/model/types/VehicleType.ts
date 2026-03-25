export interface VehicleType {
    baseCapacity: number;
    baseMovementCost: number;
    baseSpeed: number;
    meshPath: string;
    offsetAlongNormal: number;
    navMesh: "WATER" | "LAND" | "ALL";
}