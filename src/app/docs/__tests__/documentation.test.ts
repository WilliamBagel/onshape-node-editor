// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import DocumentationPanel from '../../components/DocumentationPanel.vue'
import { DOC_SECTIONS, buildDocumentation, findNodeTopic, resolveDocTarget, searchDocumentation } from '../index'
import { buildPaletteInsertables } from '../../rete/catalog-node-factory'
import { defaultCatalog } from '../../onshape/catalog/spec-catalog'

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

describe('documentation sections', () => {
  it('has General, Design practice and Nodes, each with substantive topics', () => {
    expect(DOC_SECTIONS.map(section => section.id)).toEqual(['general', 'design-practice', 'nodes'])
    expect(DOC_SECTIONS.map(section => section.title)).toEqual(['General', 'Design practice', 'Nodes'])
    for (const section of DOC_SECTIONS) {
      expect(section.topics.length).toBeGreaterThan(0)
      for (const topic of section.topics) {
        expect(topic.id).not.toBe('')
        expect(topic.section).toBe(section.id)
        expect(topic.title.trim()).not.toBe('')
        expect(topic.summary.length).toBeGreaterThan(15)
        expect(topic.body.length).toBeGreaterThan(0)
      }
    }
  })

  it('keeps topic ids unique across sections', () => {
    const ids = DOC_SECTIONS.flatMap(section => section.topics.map(topic => topic.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('node coverage', () => {
  const insertables = buildPaletteInsertables(defaultCatalog.entries)
  const documented = buildDocumentation(insertables)
  const nodes = documented.find(section => section.id === 'nodes')!

  it('documents every insertable node in the live catalog', () => {
    expect(insertables.length).toBeGreaterThan(0)
    const byKey = new Map(nodes.topics.filter(topic => topic.catalogKey != null).map(topic => [topic.catalogKey as string, topic]))
    expect(byKey.size).toBe(insertables.length)
    for (const item of insertables) {
      const topic = byKey.get(item.key)
      expect(topic, `missing docs for ${item.key}`).toBeDefined()
      expect(topic!.title).toBe(item.name)
      expect(topic!.category).toBe(item.category)
      expect(topic!.summary.trim().length).toBeGreaterThan(15)
      expect(findNodeTopic(item.key)?.id).toBe(topic!.id)
    }
  })

  it('documents every palette category once', () => {
    const categories = new Set(insertables.map(item => item.category))
    for (const category of categories) {
      const matches = nodes.topics.filter(topic => topic.id === `category:${category}`)
      expect(matches, `missing category docs for ${category}`).toHaveLength(1)
      expect(matches[0].title).toBe(`${category} nodes`)
    }
  })

  it('uses real copy, not placeholder URLs or lorem ipsum', () => {
    for (const topic of nodes.topics) {
      const text = JSON.stringify(topic.body)
      expect(text).not.toMatch(/https?:\/\//i)
      expect(text).not.toMatch(/example\.com|TODO|lorem ipsum|coming soon|TBD/i)
    }
  })

  it('resolves node topics by catalog key and by title', () => {
    expect(findNodeTopic('opChamfer::')?.title).toBe('OpChamfer')
    expect(findNodeTopic('OpChamfer')?.title).toBe('OpChamfer')
    expect(findNodeTopic('fillet')?.title).toBe('Fillet')
    expect(findNodeTopic('no-such-node')).toBeUndefined()
    expect(findNodeTopic('   ')).toBeUndefined()
  })
})

describe('search', () => {
  it('matches titles first and is case-insensitive', () => {
    const results = searchDocumentation(DOC_SECTIONS, 'EXTRUDE')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].topic.title).toBe('Extrude')
    expect(results[0].matchedIn).toContain('title')
  })

  it('matches category names', () => {
    const results = searchDocumentation(DOC_SECTIONS, 'onshape features')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some(result => result.matchedIn.includes('category'))).toBe(true)
    expect(results.every(result => result.topic.category === 'Onshape features')).toBe(true)
  })

  it('matches body text that is absent from the title', () => {
    const results = searchDocumentation(DOC_SECTIONS, 'hairline border')
    expect(results.length).toBeGreaterThan(0)
    const canvas = results.find(result => result.topic.id === 'general:canvas')
    expect(canvas).toBeDefined()
    expect(canvas!.matchedIn).toContain('body')
  })

  it('requires every token and returns nothing for an empty term', () => {
    expect(searchDocumentation(DOC_SECTIONS, 'fillet')[0].topic.title).toBe('Fillet')
    const multi = searchDocumentation(DOC_SECTIONS, 'fillet radius')
    expect(multi.length).toBeGreaterThan(0)
    expect(multi[0].topic.title).toContain('Fillet')
    expect(searchDocumentation(DOC_SECTIONS, '')).toEqual([])
    expect(searchDocumentation(DOC_SECTIONS, 'fillet zzzznotaword')).toEqual([])
  })
})

describe('resolveDocTarget', () => {
  it('opens a requested node by key, title or id', () => {
    expect(resolveDocTarget(DOC_SECTIONS, 'nodes', 'extrude::')).toMatchObject({ fallback: false, topic: { title: 'Extrude' } })
    expect(resolveDocTarget(DOC_SECTIONS, 'nodes', 'Fillet')).toMatchObject({ fallback: false, topic: { title: 'Fillet' } })
    expect(resolveDocTarget(DOC_SECTIONS, undefined, 'general:canvas')).toMatchObject({ fallback: false, section: { id: 'general' } })
  })

  it('falls back to the first topic instead of throwing on an invalid topic', () => {
    const target = resolveDocTarget(DOC_SECTIONS, 'nodes', 'not-a-real-topic')
    expect(target.fallback).toBe(true)
    expect(target.section.id).toBe('nodes')
    expect(target.topic.id).toBe(DOC_SECTIONS.find(section => section.id === 'nodes')!.topics[0].id)

    const unknownSection = resolveDocTarget(DOC_SECTIONS, 'nope', undefined)
    expect(unknownSection.section.id).toBe('general')
    expect(unknownSection.fallback).toBe(false)
  })
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
})
