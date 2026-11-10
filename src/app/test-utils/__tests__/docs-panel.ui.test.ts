// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
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
