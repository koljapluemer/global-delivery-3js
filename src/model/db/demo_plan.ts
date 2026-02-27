import { AvailableVehicleTypes } from './vehicles'
import type { Plan } from '../types/Plan'
import type { Vehicle } from '../types/Vehicle'
import type { Crate } from '../types/Crate'

export const DEMO_VEHICLE_MANIFEST: Record<number, Vehicle> = {
  0: { name: 'My small Car', vehicleType: AvailableVehicleTypes['basic_car'], hue: 70 },
  1: { name: 'MS Boat', vehicleType: AvailableVehicleTypes['small_boat'], hue: 150 }
}

export const DEMO_CRATE_MANIFEST: Record<number, Crate> = {
  0: { destinationCountry: 'Argentina' },
  1: { destinationCountry: 'Guyana' },
  2: { destinationCountry: 'Germany' }
}

export const DEMO_PLAN: Plan = {
  vehicles: DEMO_VEHICLE_MANIFEST,
  crates: DEMO_CRATE_MANIFEST,
  steps: [
    {
      tileOccupations: {
        28068: ['CRATE', 0],
        28060: ['VEHICLE', 0],
        28065: ['CRATE', 1],
        20604: ['CRATE', 2],
        3400: ['VEHICLE', 1],
      },
      transportedCargo: {}
    },
    {
      tileOccupations: {
        28068: ['CRATE', 0],
        28104: ['VEHICLE', 0],
        20604: ['CRATE', 2],
        11460: ['VEHICLE', 1],
      },
      transportedCargo: {
        1: 0
      }
    },
    {
      tileOccupations: {
        28068: ['CRATE', 0],
        28763: ['VEHICLE', 0],
        20604: ['CRATE', 2],
        11464: ['VEHICLE', 1],
      },
      transportedCargo: {
        1: 0
      }
    },
    {
      tileOccupations: {
        28068: ['CRATE', 0],
        28763: ['VEHICLE', 0],
        20604: ['CRATE', 2],
        20558: ['VEHICLE', 1],
      },
      transportedCargo: {
        1: 0
      }
    },
    {
      tileOccupations: {
        28068: ['CRATE', 0],
        28067: ['VEHICLE', 0],
        20604: ['CRATE', 2],
        20558: ['VEHICLE', 1],
      },
      transportedCargo: {
        1: 0
      }
    },

    {
      tileOccupations: {
        39710: ['VEHICLE', 0],
        20604: ['CRATE', 2],
        20558: ['VEHICLE', 1],
      },
      transportedCargo: {
        1: 0,
        0: 0
      }
    },
  ],
}
