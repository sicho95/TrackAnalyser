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

  protected emit(sample: SensorSample, qualityCeiling = 1): void {
    this.diagnostics.observe(sample)
    const quality = Math.min(qualityCeiling, this.diagnostics.quality(sample.channel))
    const enriched = { ...sample, quality, provenance: { ...sample.provenance, quality } }
    this.listeners.forEach((listener) => listener(enriched))
  }
}

export class PhoneMotionSensorSource extends BrowserSensorSource {
  private active = false
  private readonly sourceId: string
  private permission: 'UNKNOWN' | 'GRANTED' | 'DENIED' | 'NOT_REQUIRED' = 'UNKNOWN'
  private gravity = { x: 0, y: 0, z: 0 }
  private gravityInitialized = false

  constructor(deviceId: string) {
    super()
    this.sourceId = `${deviceId}:motion`
  }

  async requestPermission(): Promise<boolean> {
    if (this.permission !== 'UNKNOWN') return this.permission === 'GRANTED' || this.permission === 'NOT_REQUIRED'
    if (typeof DeviceMotionEvent === 'undefined') {
      this.permission = 'DENIED'
      return false
    }
    const constructor = DeviceMotionEvent as unknown as PermissionAwareConstructor
    if (constructor.requestPermission === undefined) {
      this.permission = 'NOT_REQUIRED'
      return true
    }
    try {
      const granted = (await constructor.requestPermission()) === 'granted'
      this.permission = granted ? 'GRANTED' : 'DENIED'
      return granted
    } catch {
      this.permission = 'DENIED'
      return false
    }
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
    const acceleration = event.acceleration ?? this.removeGravity(event.accelerationIncludingGravity)
    if (acceleration !== null) {
      const x = acceleration.x ?? 0
      const y = acceleration.y ?? 0
      const z = acceleration.z ?? 0
      this.emit(this.sample(timestamp, 'acceleration', Math.hypot(x, y, z), 'm/s²'))
      this.emit(this.sample(timestamp, 'custom:acceleration-x', x, 'm/s²'))
      this.emit(this.sample(timestamp, 'custom:acceleration-y', y, 'm/s²'))
      this.emit(this.sample(timestamp, 'custom:acceleration-z', z, 'm/s²'))
      const screenFrame = this.toScreenFrame(x, y)
      this.emit(this.sample(timestamp, 'lateralAcceleration', screenFrame.x, 'm/s²', false, 'Projection dans le repère écran non calibré'), 0.55)
      this.emit(this.sample(timestamp, 'longitudinalAcceleration', screenFrame.y, 'm/s²', false, 'Projection dans le repère écran non calibré'), 0.55)
      this.emit(this.sample(timestamp, 'verticalAcceleration', z, 'm/s²', false, 'Axe vertical du smartphone non calibré'), 0.55)
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

  private removeGravity(acceleration: DeviceMotionEventAcceleration | null): DeviceMotionEventAcceleration | null {
    if (acceleration === null) return null
    const measured = { x: acceleration.x ?? 0, y: acceleration.y ?? 0, z: acceleration.z ?? 0 }
    if (!this.gravityInitialized) {
      this.gravity = measured
      this.gravityInitialized = true
    } else {
      // Estimer lentement la gravité afin de ne jamais présenter 1 g comme une accélération du véhicule.
      const alpha = 0.08
      this.gravity = {
        x: this.gravity.x + alpha * (measured.x - this.gravity.x),
        y: this.gravity.y + alpha * (measured.y - this.gravity.y),
        z: this.gravity.z + alpha * (measured.z - this.gravity.z),
      }
    }
    return {
      x: measured.x - this.gravity.x,
      y: measured.y - this.gravity.y,
      z: measured.z - this.gravity.z,
    }
  }

  private toScreenFrame(x: number, y: number): { x: number; y: number } {
    const angle = typeof screen !== 'undefined' && 'orientation' in screen ? screen.orientation.angle : 0
    const radians = (angle * Math.PI) / 180
    return {
      x: x * Math.cos(radians) - y * Math.sin(radians),
      y: x * Math.sin(radians) + y * Math.cos(radians),
    }
  }

  private sample(timestamp: number, channel: MetricChannel, value: number, unit: string, original = true, method = 'DeviceMotion observé'): SensorSample {
    return {
      timestamp,
      channel,
      value,
      unit,
      sourceId: this.sourceId,
      quality: 0,
      stage: 'RAW',
      provenance: { sourceId: this.sourceId, channel, sampleCount: 1, coverage: 0, quality: 0, method, original },
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
