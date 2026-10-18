/** Future OCR/AI integration boundary. V1 deliberately performs no image analysis. */
import type { Screenshot } from '../types'

export interface ScreenshotAnalysisService {
  analyze(screenshot: Screenshot): Promise<null>
}

export const screenshotAnalysis: ScreenshotAnalysisService = {
  async analyze() {
    throw new Error('Screenshot analysis is not available in V1.')
  },
}
