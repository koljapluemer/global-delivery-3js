import { TUTORIAL_SLIDES } from './tutorial_slide'
import type { TutorialSlide } from './tutorial_slide'
import type { App } from '../../app/App'
import type { PlanIntentManager } from '../plan_intent_manager'
import type { TileCentersApi } from '../layer_0/tile_centers_api'
import type { NavApi } from '../navigation'
import type { TutorialInstructionBox } from '../../view/ui/tutorial/tutorial_instruction_box'

export interface TutorialControllerDeps {
  app: App
  intentManager: PlanIntentManager
  tileCentersApi: TileCentersApi
  navApi: NavApi
  instructionBox: TutorialInstructionBox
}

export class TutorialController {
  onTutorialDone: (() => void) | null = null

  private readonly deps: TutorialControllerDeps
  private slideIndex = 0
  private animating = false

  constructor(deps: TutorialControllerDeps) {
    this.deps = deps
  }

  start(): void {
    const { instructionBox } = this.deps
    instructionBox.onNext = () => void this.onNext()
    instructionBox.onReset = () => void this.onReset()
    void this.loadSlide(0)
  }

  dispose(): void {
    this.deps.app.onConfirmPlan = null
    this.deps.instructionBox.hide()
  }

  private get currentSlide(): TutorialSlide {
    return TUTORIAL_SLIDES[this.slideIndex]
  }

  private async loadSlide(index: number): Promise<void> {
    const { app, intentManager, instructionBox } = this.deps
    const slide = TUTORIAL_SLIDES[index]
    this.slideIndex = index
    this.animating = false

    intentManager.resetPlan(slide.buildPlan())
    await app.rerender()
    app.showPlanUI()
    app.setZoomFraction(0.02)
    app.panToTile(slide.panToTileId)
    app.highlightCountry(slide.highlightCountry)
    instructionBox.show(index, TUTORIAL_SLIDES.length)
    instructionBox.setInstructions(slide.instructions)
    instructionBox.setNextEnabled(false)
    app.onConfirmPlan = () => void this.onEndTurn()
  }

  private async onEndTurn(): Promise<void> {
    if (this.animating) return
    this.animating = true

    const { app, intentManager, instructionBox } = this.deps
    app.onConfirmPlan = null
    app.hidePlanUI()

    const plan = intentManager.getPlan()
    const slide = this.currentSlide

    await app.enterAnimateMode(async () => {
      const derived = app.getDerived()
      const succeeded = slide.checkSuccess(derived, plan)
      app.advancePlanToNextTurn()
      await app.rerender()
      app.showPlanUI()
      app.onConfirmPlan = () => void this.onEndTurn()
      this.animating = false
      if (succeeded) instructionBox.setNextEnabled(true)
    })
  }

  private async onReset(): Promise<void> {
    if (this.animating) return
    this.deps.app.clearCountryHighlight()
    await this.loadSlide(this.slideIndex)
  }

  private async onNext(): Promise<void> {
    const { app, instructionBox } = this.deps
    app.clearCountryHighlight()

    if (this.slideIndex < TUTORIAL_SLIDES.length - 1) {
      await this.loadSlide(this.slideIndex + 1)
    } else {
      app.hidePlanUI()
      instructionBox.hide()
      this.onTutorialDone?.()
    }
  }
}
