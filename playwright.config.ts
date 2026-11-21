import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/visual',
  // The @shot baselines are macOS renders (`-chromium-darwin`); elsewhere only the structural tests run.
  grepInvert: process.platform === 'darwin' ? undefined : /@shot/,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled' } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], deviceScaleFactor: 2 } }],
})
