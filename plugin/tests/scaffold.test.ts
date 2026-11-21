import { test, expect } from 'claude-code/testing'

test('scaffold: the plugin loads and draws nothing above the prompt', async ($, on) => {
  on('ui.render', (h, e) => h.ui.resolve(e).Text({ children: [''] }))
  const ui = await $.ui.mount({ plugin: 'clawpit', surface: 'desktop', component: 'AbovePrompt', props: { bodyColumns: 120, hasSurvey: false, maxRows: 5 } as never })
  expect(await ui.find({ key: 'clawpit-panel' })).toBeUndefined()
  await ui.unmount()
})
