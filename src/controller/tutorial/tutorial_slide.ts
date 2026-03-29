import { AvailableVehicleTypes } from '../../model/db/vehicles'
import type { Plan } from '../../model/types/Plan'
import type { DerivedPlanState } from '../../model/types/DerivedPlanState'

export interface TutorialSlide {
  readonly instructions: string
  readonly panToTileId: number
  readonly highlightCountry: string
  buildPlan(): Plan
  checkSuccess(derived: DerivedPlanState, plan: Plan): boolean
}

const slide1: TutorialSlide = {
  instructions:
    '<p class="intro">Your job is to deliver crates to their destination countries.</p>' +
    '<ol>' +
    '<li>Click the <strong>crate</strong> → "Load into vehicle" → click the car.</li>' +
    '<li>Click the <strong>car</strong> → "Add pin / Extend route" → click a tile in <strong>Malawi</strong>.</li>' +
    '<li>Click the <strong>destination pin</strong> → "Unload / Transfer" → click the drop-off tile.</li>' +
    '<li>Click <strong>End Turn</strong> to execute the plan.</li>' +
    '</ol>',
  panToTileId: 13273,
  highlightCountry: 'Malawi',
  buildPlan(): Plan {
    return {
      vehicles: {
        0: {
          name: 'Car',
          hue: 120,
          vehicleType: AvailableVehicleTypes['basic_car'],
          movementCost: AvailableVehicleTypes['basic_car'].baseMovementCost,
          capacity: AvailableVehicleTypes['basic_car'].baseCapacity,
        },
      },
      crates: {
        0: { destinationCountry: 'Malawi', rewardTimecost: 200, remainingLifetime: 10 },
      },
      initialState: {
        vehiclePositions: { 0: 13273 },
        cratePositions: { 0: 13272 },
        vehicleCargo: {},
      },
      steps: [],
    }
  },
  checkSuccess(derived): boolean {
    return derived.deliveredCrates.has(0)
  },
}

const slide2: TutorialSlide = {
  instructions:
    '<p class="intro">Now try a sea delivery — the crate must cross the ocean!</p>' +
    '<ol>' +
    '<li>Load the crate onto the <strong>car</strong>.</li>' +
    '<li>Drive the car to the coast (a tile adjacent to water).</li>' +
    '<li>Unload the crate at the coastal tile.</li>' +
    '<li>Send the <strong>ship</strong> to that same coastal tile, then load the crate onto the ship.</li>' +
    '<li>Send the ship to <strong>Madagascar</strong> and unload the crate there.</li>' +
    '<li>Click <strong>End Turn</strong>.</li>' +
    '</ol>',
  panToTileId: 13214,
  highlightCountry: 'Madagascar',
  buildPlan(): Plan {
    return {
      vehicles: {
        0: {
          name: 'Car',
          hue: 30,
          vehicleType: AvailableVehicleTypes['basic_car'],
          movementCost: AvailableVehicleTypes['basic_car'].baseMovementCost,
          capacity: AvailableVehicleTypes['basic_car'].baseCapacity,
        },
        1: {
          name: 'Ship',
          hue: 210,
          vehicleType: AvailableVehicleTypes['small_boat'],
          movementCost: AvailableVehicleTypes['small_boat'].baseMovementCost,
          capacity: AvailableVehicleTypes['small_boat'].baseCapacity,
        },
      },
      crates: {
        0: { destinationCountry: 'Madagascar', rewardTimecost: 200, remainingLifetime: 10 },
      },
      initialState: {
        vehiclePositions: { 0: 13214, 1: 13566 },
        cratePositions: { 0: 13099 },
        vehicleCargo: {},
      },
      steps: [],
    }
  },
  checkSuccess(derived): boolean {
    return derived.deliveredCrates.has(0)
  },
}

const slide3: TutorialSlide = {
  instructions:
    '<p class="intro">Both cars are loaded and scheduled — but they travel <strong>one after another</strong>, wasting time.</p>' +
    '<p>You are billed for total time elapsed, so sending vehicles in parallel saves budget.</p>' +
    '<p>In the plan panel, <strong>drag Car 2\'s journey step onto Car 1\'s journey step</strong> to merge them into one simultaneous step. Then click <strong>End Turn</strong>.</p>',
  panToTileId: 13050,
  highlightCountry: 'Tanzania',
  buildPlan(): Plan {
    return {
      vehicles: {
        0: {
          name: 'Car 1',
          hue: 30,
          vehicleType: AvailableVehicleTypes['basic_car'],
          movementCost: AvailableVehicleTypes['basic_car'].baseMovementCost,
          capacity: AvailableVehicleTypes['basic_car'].baseCapacity,
        },
        1: {
          name: 'Car 2',
          hue: 200,
          vehicleType: AvailableVehicleTypes['basic_car'],
          movementCost: AvailableVehicleTypes['basic_car'].baseMovementCost,
          capacity: AvailableVehicleTypes['basic_car'].baseCapacity,
        },
      },
      crates: {
        0: { destinationCountry: 'Tanzania', rewardTimecost: 200, remainingLifetime: 10 },
        1: { destinationCountry: 'South Africa', rewardTimecost: 200, remainingLifetime: 10 },
      },
      initialState: {
        vehiclePositions: { 0: 13050, 1: 13051 },
        cratePositions: {},
        vehicleCargo: { 0: [0], 1: [1] },
      },
      steps: [
        { kind: 'JOURNEY', journeys: [{ vehicleId: 0, toTileId: 13000 }] },
        { kind: 'CARGO', action: { kind: 'DELIVER', crateId: 0, vehicleId: 0, toTileId: 13001 } },
        { kind: 'JOURNEY', journeys: [{ vehicleId: 1, toTileId: 711 }] },
        { kind: 'CARGO', action: { kind: 'DELIVER', crateId: 1, vehicleId: 1, toTileId: 30839 } },
      ],
    }
  },
  checkSuccess(derived, plan): boolean {
    const bothDelivered = derived.deliveredCrates.has(0) && derived.deliveredCrates.has(1)
    const journeyStepCount = plan.steps.filter((s) => s.kind === 'JOURNEY').length
    return bothDelivered && journeyStepCount === 1
  },
}

export const TUTORIAL_SLIDES: readonly TutorialSlide[] = [slide1, slide2, slide3]
