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

  it('étalonne le zéro de fixation sans publier le compte à rebours dans les RAW', async () => {
    vi.stubGlobal('DeviceMotionEvent', GrantedMotionEvent)
    const source = new PhoneMotionSensorSource('phone')
    const samples: import('@track-analyser/domain').SensorSample[] = []
    source.subscribe((sample) => samples.push(sample))

    await source.start()
    source.beginMountingZero()
    for (let index = 0; index < 60; index += 1) window.dispatchEvent(new GrantedMotionEvent('devicemotion'))
    const calibration = source.completeMountingZero('phone')

    expect(samples).toHaveLength(0)
    expect(calibration?.method).toMatch(/Zéro de fixation/)
    expect(calibration?.biases[0]).toBeCloseTo(-0.5)
    expect(calibration?.biases[1]).toBeCloseTo(1.25)
    expect(calibration?.biases[2]).toBeCloseTo(0.2)
    window.dispatchEvent(new GrantedMotionEvent('devicemotion'))
    expect(samples.find((sample) => sample.channel === 'longitudinalAcceleration')?.value).toBeCloseTo(0)
    expect(samples.find((sample) => sample.channel === 'lateralAcceleration')?.value).toBeCloseTo(0)
    expect(samples.find((sample) => sample.channel === 'longitudinalAcceleration')?.provenance.method).toMatch(/zéro de fixation/)
    await source.stop()
  })
})
