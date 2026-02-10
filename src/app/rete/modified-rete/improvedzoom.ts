import { Zoom as OriginZoom } from "rete-area-plugin";

//Source: https://github.com/retejs/area-plugin/issues/31#issuecomment-3729972490

export class Zoom extends OriginZoom {
  protected wheel = (e: WheelEvent) => {
    e.preventDefault()

    const { left, top } = this.element.getBoundingClientRect()
    const delta = -e.deltaY * this.intensity;
    const ox = (left - e.clientX) * delta
    const oy = (top - e.clientY) * delta

    this.onzoom(delta, ox, oy, 'wheel')
  }
}