export interface VehicleType {
    baseCapacity: number;
    baseMovementCost: number;
    baseSpeed: number;
    meshPath: string;
    scale: number;
    offsetAlongNormal: number;
    navMesh: "WATER" | "LAND" | "ALL";
}