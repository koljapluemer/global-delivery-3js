import { AvailableVehicleTypes } from './vehicles'
import type { Plan } from '../types/Plan'

export const DEMO_PLAN: Plan = {
  steps: [
    {
      28068: { kind: 'Crate', destinationCountry: 'Ghana', isGhost: false },
      3399:  { kind: 'Vehicle', id: 0, name: 'My small Car', vehicleType: AvailableVehicleTypes['basic_car'] },
      28065: { kind: 'Crate', destinationCountry: 'Germany', isGhost: false },
      20604: { kind: 'Crate', destinationCountry: 'Germany', isGhost: false },
      3400:  { kind: 'Vehicle', id: 1, name: 'MS Boat', vehicleType: AvailableVehicleTypes['small_boat'] },
    },
    {
      28068: { kind: 'Crate', destinationCountry: 'Ghana', isGhost: false },
      3399:  { kind: 'Vehicle', id: 0, name: 'My small Car', vehicleType: AvailableVehicleTypes['basic_car'] },
      28065: { kind: 'Crate', destinationCountry: 'Germany', isGhost: false },
      20604: { kind: 'Crate', destinationCountry: 'Germany', isGhost: false },
      11460:  { kind: 'Vehicle', id: 1, name: 'MS Boat', vehicleType: AvailableVehicleTypes['small_boat'] },
    },
        {
      28068: { kind: 'Crate', destinationCountry: 'Ghana', isGhost: false },
      3399:  { kind: 'Vehicle', id: 0, name: 'My small Car', vehicleType: AvailableVehicleTypes['basic_car'] },
      28065: { kind: 'Crate', destinationCountry: 'Germany', isGhost: false },
      20604: { kind: 'Crate', destinationCountry: 'Germany', isGhost: false },
      11464:  { kind: 'Vehicle', id: 1, name: 'MS Boat', vehicleType: AvailableVehicleTypes['small_boat'] },
    },
  ],
}
