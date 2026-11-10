import { describe, expect, it } from 'vitest'
import { DOC_SECTIONS, buildDocumentation, findNodeTopic, resolveDocTarget, searchDocumentation } from '../index'
import { buildPaletteInsertables } from '../../rete/catalog-node-factory'
import { defaultCatalog } from '../../onshape/catalog/spec-catalog'

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
