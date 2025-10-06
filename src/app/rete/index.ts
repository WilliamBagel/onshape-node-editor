/* eslint-disable */
import { createEditor as createDefaultEditor } from './default'
import { createEditor as createPerfEditor } from './perf'
import { createEditor as createCustomEditor } from './customization'
import { createEditor as createScopesEditor } from './scopes'
import { isHeadless } from '../headless'

const factory = {
  'default': createDefaultEditor,
  'perf': createPerfEditor,
  'customization': createCustomEditor,
  'scopes': createScopesEditor
}

const query = typeof location !== 'undefined' && new URLSearchParams(location.search)
const name = ((query && query.get('template')) || 'default') as keyof typeof factory

const create = factory[name]

if (!create) {
  throw new Error(`template with name ${name} not found`)
}

export const createEditor = ((...args: Parameters<typeof create>) => {
  if (isHeadless()) {
    args[0].classList.add('headless')
    document.body.style.overflow = 'hidden';
  }
  return create.apply(this, args)
}) as typeof create
