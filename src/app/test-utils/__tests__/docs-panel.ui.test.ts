// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mount, type VueWrapper } from '@vue/test-utils'
import DocumentationPanel from '../../components/DocumentationPanel.vue'
import { DOC_SECTIONS } from '../../docs'

const wrappers: VueWrapper[] = []

async function mountPanel(props: Record<string, unknown> = {}) {
  const wrapper = mount(DocumentationPanel, {
    props: { open: false, ...props },
    attachTo: document.body,
  })
  wrappers.push(wrapper)
  await wrapper.setProps({ open: true })
  await nextTick()
  await nextTick()
  return wrapper
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
})

describe('DocumentationPanel', () => {
  it('renders as an in-app dialog with focus in the search field', async () => {
    const wrapper = await mountPanel()
    const panel = wrapper.find('[role="dialog"]')
    expect(panel.exists()).toBe(true)
    expect(panel.attributes('aria-labelledby')).toBe('docs-panel-title')
    const input = wrapper.find('input.docs-search')
    expect(document.activeElement).toBe(input.element)
    expect(input.attributes('role')).toBe('combobox')
    expect(input.attributes('aria-controls')).toBe('docs-topic-list')
    expect(wrapper.find('#docs-topic-list').attributes('role')).toBe('listbox')
  })

  it('Escape closes from the search field and from a topic row', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('input.docs-search').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)

    const row = wrapper.find('.docs-nav-item')
    ;(row.element as HTMLElement).focus()
    await row.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(2)
  })

  it('arrow keys move the option and Enter opens it', async () => {
    const wrapper = await mountPanel()
    const rows = wrapper.findAll('.docs-nav-item')
    const input = wrapper.find('input.docs-search')
    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.find('.docs-article-title').text()).toBe(rows[2].find('.docs-nav-name').text())
  })

  it('filters as you type and Enter opens the highlighted node', async () => {
    const wrapper = await mountPanel()
    await wrapper.find('input.docs-search').setValue('fillet')
    await nextTick()
    const rowTitle = wrapper.find('.docs-nav-item .docs-nav-name').text()
    expect(rowTitle).toBe('Fillet')
    await wrapper.find('input.docs-search').trigger('keydown', { key: 'Enter' })
    expect(wrapper.find('.docs-article-title').text()).toBe('Fillet')
  })

  it('opens initialSection / initialTopic props', async () => {
    const wrapper = await mountPanel({ initialSection: 'nodes', initialTopic: 'extrude::' })
    expect(wrapper.find('.docs-crumb').text()).toContain('Nodes')
    expect(wrapper.find('.docs-article-title').text()).toBe('Extrude')
  })

  it('falls back to the first topic when initialTopic is invalid', async () => {
    const wrapper = await mountPanel({ initialSection: 'nodes', initialTopic: 'no-such-topic' })
    const nodes = DOC_SECTIONS.find(section => section.id === 'nodes')!
    expect(wrapper.find('.docs-article-title').text()).toBe(nodes.topics[0].title)
  })

  it('restores focus to the opener when closed', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Open docs'
    document.body.appendChild(trigger)
    trigger.focus()

    const wrapper = mount(DocumentationPanel, { props: { open: true }, attachTo: document.body })
    wrappers.push(wrapper)
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(wrapper.find('input.docs-search').element)

    await wrapper.setProps({ open: false })
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(trigger)
  })

  it('section tabs reach General, Design practice and Nodes by click', async () => {
    const wrapper = await mountPanel()
    const tabs = wrapper.findAll('.docs-section-tab')
    expect(tabs.map(tab => tab.text())).toEqual(['General', 'Design practice', 'Nodes'])
    expect(tabs[0].attributes('aria-pressed')).toBe('true')

    await tabs[1].trigger('click')
    expect(wrapper.find('.docs-article-title').text()).toBe(DOC_SECTIONS[1].topics[0].title)
    expect(wrapper.find('.docs-crumb').text()).toContain('Design practice')

    await tabs[2].trigger('click')
    expect(wrapper.find('.docs-article-title').text()).toBe(DOC_SECTIONS[2].topics[0].title)
    expect(wrapper.find('.docs-crumb').text()).toContain('Nodes')
    expect(tabs[2].attributes('aria-pressed')).toBe('true')
  })
})

/*
 * Inset/clipping contract (wave2-docs-spacing).
 *
 * jsdom has no layout engine, so the real geometry (panel top >= 8px, header
 * inside the panel, article scroll range) is asserted in the browser harness
 * qa/harness/docs-nav-check.mjs. What a component test can lock down is the CSS
 * that produces it: the layer must out-rank the toolbar, the panel must be
 * inset with a clipping rounded frame, and the two panes must keep their own
 * scroll. The declarations are read from the SFC's own <style scoped> block so
 * a regression in the stylesheet fails here rather than only in QA.
 */
const sfc = readFileSync(join(process.cwd(), 'src/app/components/DocumentationPanel.vue'), 'utf8')
const panelStyle = sfc.match(/<style scoped>([\s\S]*?)<\/style>/)?.[1] ?? ''
const toolbarCss = readFileSync(join(process.cwd(), 'src/app/assets/main.css'), 'utf8')

/** Declarations of the first rule whose selector matches exactly. */
function declarations(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = panelStyle.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
  return Object.fromEntries(
    block.split(';')
      .map(line => line.trim())
      .filter(Boolean)
      .map((line) => {
        const at = line.indexOf(':')
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()]
      }),
  )
}

describe('DocumentationPanel inset sheet contract', () => {
  it('docks a rounded, clipping panel above the toolbar with a visible window margin', () => {
    const layer = declarations('.docs-layer')
    const panel = declarations('.docs-panel')

    expect(layer.position).toBe('fixed')
    expect(layer.inset).toBe('0')
    // The toolbar is z-index 10000 (assets/main.css) and used to paint over the
    // panel header at the window top; the layer has to win that stacking test.
    const toolbarZ = Number(toolbarCss.match(/\.toolbar\s*\{[^}]*z-index:\s*(\d+)/)?.[1])
    expect(toolbarZ).toBeGreaterThan(0)
    expect(Number(layer['z-index'])).toBeGreaterThan(toolbarZ)

    expect(panel.margin).toBe('12px')
    expect(panel['border-radius']).toBe('6px')
    expect(panel.border).toBe('1px solid var(--hairline)')
    expect(panel.overflow).toBe('hidden')
    // Height comes from the stretched layer minus the margin, not a 100%
    // full-bleed box glued to y=0.
    expect(panel.height).toBeUndefined()
    expect(panel['width']).toContain('760px')
  })

  it('keeps the nav and article panes scrolling inside the clipped frame', () => {
    expect(declarations('.docs-nav')['overflow-y']).toBe('auto')
    expect(declarations('.docs-article')['overflow-y']).toBe('auto')
    expect(declarations('.docs-body')['min-height']).toBe('0')
  })

  it('orders the header, tabs, search and scrolling body inside the panel', async () => {
    const wrapper = await mountPanel()
    const panel = wrapper.find('.docs-panel')
    const order = [...panel.element.children].map(child => child.className)
    expect(order.slice(0, 4)).toEqual(['docs-head', 'docs-sections', 'docs-search-row', 'docs-body'])

    expect(panel.find('.docs-head #docs-panel-title').exists()).toBe(true)
    expect(panel.find('.docs-head .docs-close').exists()).toBe(true)
    expect(panel.findAll('.docs-sections .docs-section-tab')).toHaveLength(3)
    expect(panel.find('.docs-body > .docs-nav').exists()).toBe(true)
    expect(panel.find('.docs-body > .docs-article').exists()).toBe(true)
  })
})
