import { AvailableVehicleTypes } from './vehicles'
import type { Plan } from '../types/Plan'
import type { Vehicle } from '../types/Vehicle'

export const DEMO_VEHICLE_MANIFEST: Record<number, Vehicle> = {
  0: { name: 'My small Car', vehicleType: AvailableVehicleTypes['basic_car'], hue: 70 },
  1: { name: 'MS Boat', vehicleType: AvailableVehicleTypes['small_boat'], hue: 150 }
}


export const DEMO_PLAN: Plan = {
  vehicles: DEMO_VEHICLE_MANIFEST,
  steps: [
    {
      28068: { kind: 'Crate', destinationCountry: 'Guyana', isGhost: false },
      28060: { kind: 'Vehicle', id: 0 },
      28065: { kind: 'Crate', destinationCountry: 'Germany', isGhost: false },
      20604: { kind: 'Crate', destinationCountry: 'Germany', isGhost: false },
      3400: { kind: 'Vehicle', id: 1 },
    },
    {
      28068: { kind: 'Crate', destinationCountry: 'Guyana', isGhost: false },
      28104: { kind: 'Vehicle', id: 0 },
      28065: { kind: 'Crate', destinationCountry: 'Germany', isGhost: false },
      20604: { kind: 'Crate', destinationCountry: 'Germany', isGhost: false },
      11460: { kind: 'Vehicle', id: 1 },
    },
    {
      28068: { kind: 'Crate', destinationCountry: 'Guyana', isGhost: false },
      28763: { kind: 'Vehicle', id: 0 },
      28065: { kind: 'Crate', destinationCountry: 'Germany', isGhost: false },
      20604: { kind: 'Crate', destinationCountry: 'Germany', isGhost: false },
      11464: { kind: 'Vehicle', id: 1 },
    },
    {
      28068: { kind: 'Crate', destinationCountry: 'Guyana', isGhost: false },
      28763: { kind: 'Vehicle', id: 0 },
      28065: { kind: 'Crate', destinationCountry: 'Germany', isGhost: false },
      20604: { kind: 'Crate', destinationCountry: 'Germany', isGhost: false },
      20558: { kind: 'Vehicle', id: 1 },
    },
    {
      28068: { kind: 'Crate', destinationCountry: 'Guyana', isGhost: false },
      27694: { kind: 'Vehicle', id: 0 },
      28065: { kind: 'Crate', destinationCountry: 'Germany', isGhost: false },
      20604: { kind: 'Crate', destinationCountry: 'Germany', isGhost: false },
      2571: { kind: 'Vehicle', id: 1 },
    },
  ],
}
