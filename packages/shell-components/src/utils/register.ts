import { createApp } from 'vue'
import type { App, Component, ComponentPublicInstance } from 'vue'
import { ShellComponentContainer } from '@takeover/shared-utils'

let swapApp: App | null = null
let canClose: (() => boolean) | undefined

export function registerEl(target: Component, container?: Element) {
  if (canClose && !canClose()) return
  if (swapApp) swapApp.unmount()
  swapApp = createApp(target)
  const host = document.getElementById(ShellComponentContainer)
  const mount = container ?? host
  if (mount) {
    const instance = swapApp.mount(mount) as ComponentPublicInstance & { canClose?: () => boolean }
    canClose = instance?.canClose
  }
}
