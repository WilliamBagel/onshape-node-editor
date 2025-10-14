/* eslint-disable */
import { createEditor as createDefaultEditor } from './default'

const create = createDefaultEditor

if (!create) {
  throw new Error(`template with name ${name} not found`)
}

export const createEditor = ((...args: Parameters<typeof create>) => {
    args[0].classList.add('headless')
    document.body.style.overflow = 'hidden';
  return create.apply(this, args)
}) as typeof create
