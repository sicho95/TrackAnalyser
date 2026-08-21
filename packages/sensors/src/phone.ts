import type {
  DeviceProfile,
  GeoPoint,
  MetricChannel,
  SensorCapabilities,
  SensorSample,
  SensorSource,
} from '@track-analyser/domain'
import { SourceDiagnostics } from './diagnostics'

type SampleListener = (sample: SensorSample) => void

interface PermissionAwareConstructor {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
}

abstract class BrowserSensorSource implements SensorSource {
  protected readonly listeners = new Set<SampleListener>()
  protected readonly diagnostics = new SourceDiagnostics()

  abstract start(): Promise<void>
  abstract stop(): Promise<void>
  abstract getCapabilities(): Promise<SensorCapabilities>

  subscribe(callback: SampleListener): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  protected emit(sample: SensorSample): void {
    this.diagnostics.observe(sample)
    const quality = this.diagnostics.quality(sample.channel)
    const enriched = { ...sample, quality, provenance: { ...sample.provenance, quality } }
    this.listeners.forEach((listener) => listener(enriched))
  }
}

export class PhoneMotionSensorSource extends BrowserSensorSource {
  private active = false
  private readonly sourceId: string

  constructor(deviceId: string) {
    super()
    this.sourceId = `${deviceId}:motion`
  }

  async requestPermission(): Promise<boolean> {
    const constructor = DeviceMotionEvent as unknown as PermissionAwareConstructor
    if (constructor.requestPermission === undefined) return true
    return (await constructor.requestPermission()) === 'granted'
  }

  async start(): Promise<void> {
    if (typeof DeviceMotionEvent === 'undefined') throw new Error('DeviceMotion indisponible sur cet appareil.')
    if (!(await this.requestPermission())) throw new Error('Permission de mouvement refusée.')
    window.addEventListener('devicemotion', this.onMotion)
    this.active = true
  }

  async stop(): Promise<void> {
    window.removeEventListener('devicemotion', this.onMotion)
    this.active = false
  }

  async getCapabilities(): Promise<SensorCapabilities> {
    const channels: MetricChannel[] = ['acceleration', 'rotationRate']
    return { channels: channels.map((channel) => this.diagnostics.capability(channel, typeof DeviceMotionEvent !== 'undefined')), measuredAt: new Date().toISOString() }
  }

  private readonly onMotion = (event: DeviceMotionEvent): void => {
    if (!this.active) return
    const timestamp = performance.timeOrigin + event.timeStamp
    const acceleration = event.acceleration ?? event.accelerationIncludingGravity
    if (acceleration !== null) {
      const x = acceleration.x ?? 0
      const y = acceleration.y ?? 0
      const z = acceleration.z ?? 0
      this.emit(this.sample(timestamp, 'acceleration', Math.hypot(x, y, z), 'm/s²'))
      this.emit(this.sample(timestamp, 'custom:acceleration-x', x, 'm/s²'))
      this.emit(this.sample(timestamp, 'custom:acceleration-y', y, 'm/s²'))
      this.emit(this.sample(timestamp, 'custom:acceleration-z', z, 'm/s²'))
    }
    if (event.rotationRate !== null) {
      const alpha = ((event.rotationRate.alpha ?? 0) * Math.PI) / 180
      const beta = ((event.rotationRate.beta ?? 0) * Math.PI) / 180
      const gamma = ((event.rotationRate.gamma ?? 0) * Math.PI) / 180
      this.emit(this.sample(timestamp, 'rotationRate', Math.hypot(alpha, beta, gamma), 'rad/s'))
      this.emit(this.sample(timestamp, 'custom:rotation-alpha', alpha, 'rad/s'))
      this.emit(this.sample(timestamp, 'custom:rotation-beta', beta, 'rad/s'))
      this.emit(this.sample(timestamp, 'custom:rotation-gamma', gamma, 'rad/s'))
    }
  }

  private sample(timestamp: number, channel: MetricChannel, value: number, unit: string): SensorSample {
    return {
      timestamp,
      channel,
      value,
      unit,
      sourceId: this.sourceId,
      quality: 0,
      stage: 'RAW',
      provenance: { sourceId: this.sourceId, channel, sampleCount: 1, coverage: 0, quality: 0, method: 'DeviceMotion observé', original: true },
    }
  }
}

export class PhoneLocationSensorSource extends BrowserSensorSource {
  private watchId: number | undefined
  private readonly sourceId: string

  constructor(deviceId: string) {
    super()
    this.sourceId = `${deviceId}:geolocation`
  }

  async requestPermission(): Promise<PermissionState | 'unknown'> {
    if (!('permissions' in navigator)) return 'unknown'
    try {
      return (await navigator.permissions.query({ name: 'geolocation' })).state
    } catch {
      return 'unknown'
    }
  }

  async start(): Promise<void> {
    if (!('geolocation' in navigator)) throw new Error('Géolocalisation indisponible.')
    this.watchId = navigator.geolocation.watchPosition(this.onPosition, this.onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15_000,
    })
  }

  async stop(): Promise<void> {
    if (this.watchId !== undefined) navigator.geolocation.clearWatch(this.watchId)
    this.watchId = undefined
  }

  async getCapabilities(): Promise<SensorCapabilities> {
    const channels: MetricChannel[] = ['position', 'speed', 'altitude']
    return { channels: channels.map((channel) => this.diagnostics.capability(channel, 'geolocation' in navigator)), measuredAt: new Date().toISOString() }
  }

  private readonly onPosition = (position: GeolocationPosition): void => {
    const timestamp = position.timestamp
    const point: GeoPoint = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      ...(position.coords.altitude === null ? {} : { altitude: position.coords.altitude }),
      accuracy: position.coords.accuracy,
    }
    this.emit(this.sample(timestamp, 'position', point, 'WGS84', position.coords.accuracy))
    if (position.coords.speed !== null) this.emit(this.sample(timestamp, 'speed', Math.max(0, position.coords.speed), 'm/s', position.coords.accuracy))
    if (position.coords.altitude !== null) this.emit(this.sample(timestamp, 'altitude', position.coords.altitude, 'm', position.coords.altitudeAccuracy ?? undefined))
  }

  private readonly onError = (error: GeolocationPositionError): void => {
    window.dispatchEvent(new CustomEvent('track-analyser:sensor-error', { detail: { sourceId: this.sourceId, code: error.code, message: error.message } }))
  }

  private sample(timestamp: number, channel: MetricChannel, value: SensorSample['value'], unit: string, accuracy?: number): SensorSample {
    return {
      timestamp,
      channel,
      value,
      unit,
      sourceId: this.sourceId,
      ...(accuracy === undefined ? {} : { accuracy }),
      quality: 0,
      stage: 'RAW',
      provenance: { sourceId: this.sourceId, channel, sampleCount: 1, coverage: 0, quality: 0, method: 'Geolocation observée', original: true },
    }
  }
}

export function createObservedPhoneProfile(id = crypto.randomUUID()): DeviceProfile {
  const userAgentData = navigator.userAgent
  const platform = navigator.platform || 'web'
  const now = new Date().toISOString()
  return {
    id,
    displayName: `Smartphone ${platform}`,
    deviceType: 'SMARTPHONE',
    os: platform,
    osVersion: userAgentData,
    capabilities: { channels: [] },
    createdAt: now,
    updatedAt: now,
  }
}

