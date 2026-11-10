/**
 * Documentation entry points and group-breadcrumb navigation.
 *
 * The toolbar must expose the in-app documentation as a real Help button, and
 * the group trail must be navigable: ancestor segments are buttons that leave
 * every group inside them, while "Exit group" keeps the one-level Tab
 * semantics. App.vue maps these events onto controls.toggleGroupEdit /
 * controls.exitGroupTo.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TopBar from '../../components/TopBar.vue'

function mountTopBar(extraProps: Record<string, unknown> = {}) {
  return mount(TopBar, {
    props: { projectName: 'My Graph', groupBreadcrumb: [], log: undefined, ...extraProps },
    global: {
      directives: { tooltip: {} },
      stubs: { SvgIcon: { template: '<svg />' }, DesignCheckTab: { template: '<div />' } },
    },
  })
}

describe('TopBar documentation', () => {
  it('renders a Help button labelled Documentation and emits help', async () => {
    const wrapper = mountTopBar()
    const button = wrapper.find('button[aria-label="Documentation"]')
    expect(button.exists()).toBe(true)
    await button.trigger('click')
    expect(wrapper.emitted('help')).toHaveLength(1)
    wrapper.unmount()
  })
})

describe('TopBar group breadcrumb navigation', () => {
  it('renders ancestor segments as buttons and the current segment as text', () => {
    const wrapper = mountTopBar({ groupBreadcrumb: ['Top level', 'Group 1', 'Group 2'], groupEditing: true })
    const ancestors = wrapper.findAll('.group-breadcrumb-seg:not(.group-breadcrumb-current)')
    expect(ancestors).toHaveLength(2)
    expect(ancestors[0].element.tagName).toBe('BUTTON')
    expect(ancestors[1].element.tagName).toBe('BUTTON')
    const current = wrapper.find('.group-breadcrumb-current')
    expect(current.element.tagName).toBe('SPAN')
    expect(current.text()).toBe('Group 2')
    expect(current.attributes('aria-current')).toBe('page')
    wrapper.unmount()
  })

  it('clicking an ancestor emits exitGroupTo with that segment depth', async () => {
    const wrapper = mountTopBar({ groupBreadcrumb: ['Top level', 'Group 1', 'Group 2'], groupEditing: true })
    await wrapper.find('button[aria-label="Exit to Top level"]').trigger('click')
    expect(wrapper.emitted('exitGroupTo')?.[0]).toEqual([0])
    await wrapper.find('button[aria-label="Exit to Group 1"]').trigger('click')
    expect(wrapper.emitted('exitGroupTo')?.[1]).toEqual([1])
    wrapper.unmount()
  })

  it('has an explicit Exit group control that emits exitGroup', async () => {
    const wrapper = mountTopBar({ groupBreadcrumb: ['Top level', 'Group 1'], groupEditing: true })
    const exit = wrapper.find('button[aria-label="Exit group"]')
    expect(exit.exists()).toBe(true)
    await exit.trigger('click')
    expect(wrapper.emitted('exitGroup')).toHaveLength(1)
    // The explicit control must not be mistaken for a depth jump.
    expect(wrapper.emitted('exitGroupTo')).toBeUndefined()
    wrapper.unmount()
  })

  it('still shows the trail as text at the top level is hidden', () => {
    const wrapper = mountTopBar({ groupBreadcrumb: ['Top level'], groupEditing: false })
    expect(wrapper.find('.group-breadcrumb').exists()).toBe(false)
    wrapper.unmount()
  })
})
