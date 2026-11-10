// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onDocHelp, requestDocHelp } from '../help-request'

const unsubscribers: Array<() => void> = []

afterEach(() => {
  for (const unsubscribe of unsubscribers.splice(0)) unsubscribe()
})

describe('documentation help requests', () => {
  it('delivers the topic and section to every subscriber', () => {
    const first = vi.fn()
    const second = vi.fn()
    unsubscribers.push(onDocHelp(first), onDocHelp(second))

    requestDocHelp({ section: 'nodes', topic: 'Chamfer' })

    expect(first).toHaveBeenCalledWith({ section: 'nodes', topic: 'Chamfer' })
    expect(second).toHaveBeenCalledWith({ section: 'nodes', topic: 'Chamfer' })
  })

  it('stops delivering after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = onDocHelp(listener)
    unsubscribe()
    requestDocHelp({ topic: 'Fillet' })
    expect(listener).not.toHaveBeenCalled()
  })

  it('is a no-op when nobody is listening', () => {
    expect(() => requestDocHelp()).not.toThrow()
  })

  it('copies the request so a subscriber cannot mutate the sender payload', () => {
    const request = { topic: 'Extrude' }
    let received: { topic?: string } | null = null
    unsubscribers.push(onDocHelp((value) => { received = value; value.topic = 'changed' }))
    requestDocHelp(request)
    expect(request.topic).toBe('Extrude')
    expect(received).not.toBeNull()
  })
})
