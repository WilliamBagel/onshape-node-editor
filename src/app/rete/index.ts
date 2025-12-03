/* eslint-disable */
import { createEditor as createDefaultEditor } from './customization'

const create = createDefaultEditor

if (!create) {
  throw new Error(`template with name ${name} not found`)
}

export const createEditor = ((...args: Parameters<typeof create>) => {
  return create.apply(this, args)
}) as typeof create
