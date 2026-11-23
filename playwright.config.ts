import { defineConfig, devices } from '@playwright/test'

// The limits' reset times read in local time: one zone, so a baseline reads the same on every machine.
process.env.TZ = 'UTC'

export default defineConfig({
  testDir: 'tests/visual',
  // The @shot baselines are macOS renders (`-chromium-darwin`); elsewhere only the structural tests run.
  grepInvert: process.platform === 'darwin' ? undefined : /@shot/,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled' } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], deviceScaleFactor: 2 } }],
})
