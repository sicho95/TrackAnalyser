import { afterEach, describe, expect, it, vi } from 'vitest'
import { PhoneMotionSensorSource } from './phone'

class GrantedMotionEvent extends Event {
  static readonly requestPermission = vi.fn(async () => 'granted' as const)
  readonly acceleration = { x: 1.25, y: -0.5, z: 0.2 }
  readonly accelerationIncludingGravity = { x: 1.25, y: -0.5, z: 10.01 }
  readonly rotationRate = { alpha: 1, beta: 2, gamma: 3 }
  readonly interval = 20
}

describe('source DeviceMotion du smartphone', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    GrantedMotionEvent.requestPermission.mockClear()
  })

  it('demande la permission une seule fois puis publie les axes bruts et le repère écran', async () => {
    vi.stubGlobal('DeviceMotionEvent', GrantedMotionEvent)
    const source = new PhoneMotionSensorSource('phone')
    const samples: import('@track-analyser/domain').SensorSample[] = []
    source.subscribe((sample) => samples.push(sample))

    await expect(source.requestPermission()).resolves.toBe(true)
    await source.start()
    window.dispatchEvent(new GrantedMotionEvent('devicemotion'))
    await source.stop()

    expect(GrantedMotionEvent.requestPermission).toHaveBeenCalledTimes(1)
    expect(samples.map((sample) => sample.channel)).toEqual(expect.arrayContaining([
      'acceleration', 'custom:acceleration-x', 'custom:acceleration-y', 'custom:acceleration-z',
      'longitudinalAcceleration', 'lateralAcceleration', 'verticalAcceleration', 'rotationRate',
    ]))
    const lateral = samples.find((sample) => sample.channel === 'lateralAcceleration')
    expect(lateral?.provenance.original).toBe(false)
    expect(lateral?.provenance.method).toMatch(/repère écran/)
    expect(lateral?.quality).toBeLessThanOrEqual(0.55)
    expect(samples.find((sample) => sample.channel === 'custom:acceleration-x')?.provenance.original).toBe(true)
  })

  it('signale proprement un navigateur sans DeviceMotion', async () => {
    vi.stubGlobal('DeviceMotionEvent', undefined)
    const source = new PhoneMotionSensorSource('phone')
    await expect(source.requestPermission()).resolves.toBe(false)
    await expect(source.start()).rejects.toThrow(/indisponible/i)
  })
})
