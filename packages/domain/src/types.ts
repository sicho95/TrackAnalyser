export const ACTIVITY_TYPES = [
  'GENERIC',
  'CAR',
  'MOTORCYCLE',
  'BIKE',
  'BOAT',
  'AIRCRAFT',
  'PARAGLIDING',
  'HIKING',
  'TRAIL_RUNNING',
  'RUNNING',
] as const

export type ActivityType = (typeof ACTIVITY_TYPES)[number]

export const PIPELINE_STAGES = [
  'RAW',
  'NORMALIZED',
  'SYNCHRONIZED',
  'FUSED',
  'DERIVED',
  'ANALYSIS',
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]

export type MetricChannel =
  | 'position'
  | 'distance'
  | 'speed'
  | 'altitude'
  | 'verticalSpeed'
  | 'acceleration'
  | 'longitudinalAcceleration'
  | 'lateralAcceleration'
  | 'verticalAcceleration'
  | 'jerk'
  | 'roll'
  | 'pitch'
  | 'yaw'
  | 'rotationRate'
  | 'heartRate'
  | 'cadence'
  | 'strideLength'
  | 'power'
  | 'temperature'
  | 'pressure'
  | 'groundContactTime'
  | 'groundContactBalance'
  | 'verticalOscillation'
  | 'verticalRatio'
  | `custom:${string}`

export interface GeoPoint {
  latitude: number
  longitude: number
  altitude?: number
  accuracy?: number
}

export type MetricValue = number | GeoPoint | string | boolean | number[]

export interface Participant {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  archived: boolean
  metadata?: Record<string, unknown>
}

export interface ActivityGroup {
  id: string
  activityType: ActivityType
  title?: string
  startTime?: string
  endTime?: string
  routeFingerprint?: string
  sessionIds: string[]
  metadata?: Record<string, unknown>
}

export interface Equipment {
  id: string
  type: string
  name: string
  manufacturer?: string
  model?: string
  metadata?: Record<string, unknown>
}

export interface SensorCapability {
  channel: MetricChannel
  declared: boolean
  observed: boolean
  requestedFrequencyHz?: number
  observedFrequencyHz?: number
  jitterMs?: number
  gapCount?: number
  coverage?: number
  accuracy?: number
  quality?: number
}

export interface SensorCapabilities {
  channels: SensorCapability[]
  measuredAt?: string
}

export interface DeviceProfile {
  id: string
  displayName: string
  manufacturer?: string
  model?: string
  deviceType: string
  os?: string
  osVersion?: string
  capabilities: SensorCapabilities
  calibrationProfiles?: string[]
  assignedParticipantId?: string
  createdAt: string
  updatedAt: string
}

export interface CalibrationSnapshot {
  id: string
  deviceId: string
  createdAt: string
  quality: number
  matrix: readonly [number, number, number, number, number, number, number, number, number]
  biases: readonly [number, number, number]
  method: string
}

export interface RawDataReference {
  id: string
  sessionId: string
  sourceId: string
  storage: 'OPFS' | 'INDEXED_DB'
  path: string
  mediaType: string
  byteLength: number
  sha256: string
  chunkCount: number
  immutable: true
  importedFileName?: string
  createdAt: string
}

export interface Session {
  id: string
  participantId: string
  activityGroupId?: string
  activityType: ActivityType
  equipmentId?: string
  sourceIds: string[]
  startTime: string
  endTime?: string
  calibration?: CalibrationSnapshot
  schemaVersion: number
  rawDataReferences: RawDataReference[]
  normalizedDataReference?: string
  fusedDataReference?: string
  analysisRunIds: string[]
  originalAnalysisRunId?: string
  latestAnalysisRunId?: string
  status: 'DRAFT' | 'RECORDING' | 'INTERRUPTED' | 'COMPLETED'
  checkpointAt?: string
  title?: string
}

export interface MetricProvenance {
  sourceId: string
  deviceId?: string
  fileName?: string
  channel: MetricChannel
  sampleCount: number
  coverage: number
  quality: number
  method: string
  original: boolean
}

export interface SensorSample {
  id?: string
  timestamp: number
  channel: MetricChannel
  value: MetricValue
  unit: string
  sourceId: string
  sequence?: number
  accuracy?: number
  quality: number
  stage: PipelineStage
  provenance: MetricProvenance
}

export interface ChannelSeries {
  channel: MetricChannel
  unit: string
  samples: readonly SensorSample[]
  provenance: readonly MetricProvenance[]
  selectedSourceId?: string
  divergences?: readonly ChannelDivergence[]
}

export interface ChannelDivergence {
  timestamp: number
  sourceIds: readonly string[]
  absoluteDifference: number
}

export interface PipelineDataset {
  sessionId: string
  participantId: string
  stage: PipelineStage
  channels: ReadonlyMap<MetricChannel, ChannelSeries>
  sourceIds: readonly string[]
  createdAt: string
  synchronization?: SynchronizationReport
}

export interface SynchronizationReport {
  method: 'UTC' | 'EVENT_CORRELATION' | 'MANUAL'
  offsetsMs: Record<string, number>
  driftPpm: Record<string, number>
  confidence: number
}

export type FusionStrategy = 'PRIORITY' | 'AUTO' | 'FUSION' | 'PARALLEL'

export interface ChannelFusionPolicy {
  channel: MetricChannel
  strategy: FusionStrategy
  prioritySourceIds?: string[]
  minimumQuality?: number
}

export interface FusionDecision {
  channel: MetricChannel
  strategy: FusionStrategy
  selectedSourceIds: string[]
  rejectedSourceIds: string[]
  reason: string
  quality: number
  coverage: number
  switches: number
}

export interface FusionReport {
  sessionId: string
  participantId: string
  decisions: FusionDecision[]
  generatedAt: string
  engineVersion: string
}

export interface AnalysisProfile {
  id: string
  activityType: ActivityType
  version: string
  name: string
  parameters: Readonly<Record<string, number>>
  createdAt: string
  notes: string[]
}

export interface MetricStatistics {
  count: number
  minimum: number
  maximum: number
  mean: number
  median: number
  p50: number
  p90: number
  p95: number
  p99: number
  rms: number
  variance: number
  standardDeviation: number
}

export interface AnalysisMetric {
  id: string
  label: string
  status: 'AVAILABLE' | 'UNAVAILABLE'
  value?: number
  unit?: string
  statistics?: MetricStatistics
  sampleCount: number
  confidence: number
  provenance: MetricProvenance[]
  method: string
  unavailableReason?: string
}

export interface AnalysisEvent {
  id: string
  type: string
  startTime: number
  endTime: number
  severity?: number
  metrics: Record<string, number>
  context?: ComparableContext
}

export interface ComparableContext {
  type: string
  slope?: number
  radius?: number
  speed?: number
  duration?: number
  altitude?: number
  quality: number
}

export interface AnalysisResult {
  activityType: ActivityType
  metrics: AnalysisMetric[]
  events: AnalysisEvent[]
  quality: SessionQuality
  warnings: string[]
  visualizationSeries: Record<string, number[]>
  routePreview: GeoPoint[]
}

export interface SessionQuality {
  gnss: number
  imu: number
  clock: number
  calibration: number
  coverage: number
  fusion: number
  confidence: number
}

export interface AnalysisRun {
  id: string
  sessionId: string
  analysisVersion: string
  analysisProfileVersion: string
  engineBuildId: string
  gitCommit?: string
  createdAt: string
  isOriginal: boolean
  metricsReference: string
  eventsReference: string
  scoresReference?: string
  qualityReference?: string
  result: AnalysisResult
  inputFingerprint: string
}

export interface Segment {
  id: string
  sessionId: string
  name: string
  startTime: number
  endTime: number
  startDistance?: number
  endDistance?: number
  routeFingerprint?: string
  manual: boolean
}

export interface ComparisonSeries {
  id: string
  label: string
  unit: string
  values: readonly number[]
  sampleCount: number
  coverage: number
  confidence: number
}

export interface ComparisonResult {
  metricId: string
  unit: string
  commonMinimum: number
  commonMaximum: number
  includeZero: boolean
  series: ComparisonSeries[]
  absoluteDifference?: number
  relativeDifference?: number
}

export type VisualizationType =
  | 'SUMMARY_CARD'
  | 'GAUGE'
  | 'DIVERGING_GAUGE'
  | 'TIME_SERIES'
  | 'PROFILE'
  | 'HISTOGRAM'
  | 'DISTRIBUTION'
  | 'COMPARISON_BAR'
  | 'DUMBBELL'
  | 'SCATTER'
  | 'ROUTE_MAP'
  | 'HEATMAP'
  | 'EVENTS'

export interface ScalePolicy {
  mode: 'PHYSICAL' | 'REFERENCE' | 'DYNAMIC_SHARED'
  minimum?: number
  maximum?: number
  includeZero: boolean
  symmetricAroundZero: boolean
}

export interface ReferenceZone {
  minimum: number
  maximum: number
  label: string
  colorToken: string
}

export interface VisualizationSpec {
  metricId: string
  semanticType: string
  preferredLiveView: VisualizationType
  preferredSessionView: VisualizationType
  preferredComparisonView: VisualizationType
  unitPolicy: string
  scalePolicy: ScalePolicy
  referenceZones?: ReferenceZone[]
}

export interface AppSettings {
  schemaVersion: number
  theme: 'light' | 'dark' | 'system'
  locale: 'fr'
  unitSystem: 'metric' | 'imperial' | 'aviation' | 'nautical'
  mapProvider: string
  activeSessionId?: string
  pendingUpdate: boolean
}

export interface ImportIdentity {
  format: 'FIT' | 'GPX' | 'TCX' | 'TRACK_ANALYSER_JSON' | 'TATRIP' | 'TABACKUP' | 'APPLE_XML' | 'APPLE_WORKOUT'
  fileName: string
  sha256: string
  startTime?: string
  endTime?: string
  activityType?: ActivityType
  channels: MetricChannel[]
  suggestedParticipantId?: string
}

export interface ImportTargetDecision {
  participantId: string
  sessionId?: string
  createSession: boolean
  activityGroupCandidateId?: string
}

export interface ImportResult {
  identity: ImportIdentity
  samples: SensorSample[]
  opaqueRecords: OpaqueImportRecord[]
  rawBytes: Uint8Array
  metadata: Record<string, unknown>
  warnings: string[]
}

export interface OpaqueImportRecord {
  messageNumber: number
  messageName?: string
  fieldNumber?: number
  fieldName?: string
  rawType?: string
  value: unknown
  context: Record<string, unknown>
}

export interface SensorSource {
  start(): Promise<void>
  stop(): Promise<void>
  getCapabilities(): Promise<SensorCapabilities>
  subscribe(callback: (sample: SensorSample) => void): () => void
}
