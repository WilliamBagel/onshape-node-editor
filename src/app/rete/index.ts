/* eslint-disable */
import { createEditor as create } from './editor'
import { createEditor as createDev } from './devEditor'

export const createEditor = ((...args: Parameters<typeof create>) => {
  return create.apply(this, args)
}) as typeof create

export const createEditorDev = ((...args: Parameters<typeof createDev>) => {
  return createDev.apply(this, args)
}) as typeof createDev