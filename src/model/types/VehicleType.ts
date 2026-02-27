export interface VehicleType {
    baseCapacity: number;
    baseSpeed: number;
    baseMovementCost: number;
    meshPath: string;
    scale: number;
    offsetAlongNormal: number;
    navMesh: "WATER" | "LAND" | "ALL";
}