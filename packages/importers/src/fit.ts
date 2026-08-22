import { Decoder, Profile, Stream, type Mesg, type MesgDefinition, type RecordMesg } from '@garmin/fitsdk'
import { finiteExtent, type ActivityType, type ImportResult, type MetricChannel, type OpaqueImportRecord, type SensorSample } from '@track-analyser/domain'
import { createImportedSample, parseTimestamp, semicirclesToDegrees, serializableValue, sha256Hex } from './shared'

interface FitRecordMapping {
  field: keyof RecordMesg
  channel: MetricChannel
  unit: string
  transform?: (value: number) => number
}

const RECORD_MAPPINGS: readonly FitRecordMapping[] = [
  { field: 'distance', channel: 'distance', unit: 'm' },
  { field: 'enhancedSpeed', channel: 'speed', unit: 'm/s' },
  { field: 'speed', channel: 'speed', unit: 'm/s' },
  { field: 'enhancedAltitude', channel: 'altitude', unit: 'm' },
  { field: 'altitude', channel: 'altitude', unit: 'm' },
  { field: 'heartRate', channel: 'heartRate', unit: 'bpm' },
  { field: 'cadence256', channel: 'cadence', unit: 'rpm' },
  { field: 'cadence', channel: 'cadence', unit: 'rpm' },
  { field: 'power', channel: 'power', unit: 'W' },
  { field: 'verticalSpeed', channel: 'verticalSpeed', unit: 'm/s' },
  { field: 'verticalOscillation', channel: 'verticalOscillation', unit: 'm', transform: (value) => value / 1000 },
  { field: 'stanceTime', channel: 'groundContactTime', unit: 'ms' },
  { field: 'stanceTimeBalance', channel: 'groundContactBalance', unit: '%' },
  { field: 'stepLength', channel: 'strideLength', unit: 'm', transform: (value) => value / 1000 },
  { field: 'verticalRatio', channel: 'verticalRatio', unit: '%' },
  { field: 'temperature', channel: 'temperature', unit: '°C' },
  { field: 'absolutePressure', channel: 'pressure', unit: 'Pa' },
]

function mapRecord(record: RecordMesg, fileName: string, sourceId: string): SensorSample[] {
  const timestamp = parseTimestamp(record.timestamp)
  if (timestamp === undefined) return []
  const samples: SensorSample[] = []
  if (typeof record.positionLat === 'number' && typeof record.positionLong === 'number') {
    samples.push(
      createImportedSample(
        timestamp,
        'position',
        { latitude: semicirclesToDegrees(record.positionLat), longitude: semicirclesToDegrees(record.positionLong) },
        'WGS84',
        sourceId,
        fileName,
      ),
    )
  }
  const emitted = new Set<MetricChannel>()
  for (const mapping of RECORD_MAPPINGS) {
    if (emitted.has(mapping.channel)) continue
    const value = record[mapping.field]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    samples.push(createImportedSample(timestamp, mapping.channel, mapping.transform?.(value) ?? value, mapping.unit, sourceId, fileName))
    emitted.add(mapping.channel)
  }
  return samples
}

function inferActivityType(messages: Record<string, unknown>): ActivityType {
  const serialized = JSON.stringify(serializableValue(messages)).toLowerCase()
  if (serialized.includes('paragliding')) return 'PARAGLIDING'
  if (serialized.includes('motorcycling')) return 'MOTORCYCLE'
  if (serialized.includes('cycling')) return 'BIKE'
  if (serialized.includes('running')) return 'RUNNING'
  if (serialized.includes('walking') || serialized.includes('hiking')) return 'HIKING'
  if (serialized.includes('flying')) return 'AIRCRAFT'
  if (serialized.includes('boating')) return 'BOAT'
  return 'GENERIC'
}

function opaqueFields(messageNumber: number, message: Mesg, index: number): OpaqueImportRecord[] {
  const name = Profile.messages[messageNumber]?.name
  return Object.entries(message as unknown as Record<string, unknown>).map(([fieldName, value]) => ({
    messageNumber,
    ...(name === undefined ? {} : { messageName: name }),
    ...(Number.isInteger(Number(fieldName)) ? { fieldNumber: Number(fieldName) } : { fieldName }),
    rawType: Array.isArray(value) ? 'array' : typeof value,
    value: serializableValue(value),
    context: { messageIndex: index, developer: fieldName === 'developerFields' },
  }))
}

export function parseFit(bytes: Uint8Array, fileName: string): ImportResult {
  const stream = Stream.fromByteArray(bytes)
  const decoder = new Decoder(stream)
  if (!decoder.isFIT()) throw new Error('Le fichier ne contient pas un en-tête FIT valide.')
  const integrityValid = decoder.checkIntegrity()
  const definitions: MesgDefinition[] = []
  const opaqueRecords: OpaqueImportRecord[] = []
  const records: RecordMesg[] = []
  const messageCounts = new Map<number, number>()
  const { messages, profileVersion, errors } = decoder.read({
    includeUnknownData: true,
    applyScaleAndOffset: true,
    expandSubFields: true,
    expandComponents: true,
    convertTypesToStrings: true,
    convertDateTimesToDates: true,
    mergeHeartRates: true,
    decodeMemoGlobs: true,
    mesgDefinitionListener: (definition) => definitions.push(definition),
    mesgListener: (messageNumber, message) => {
      const index = messageCounts.get(messageNumber) ?? 0
      messageCounts.set(messageNumber, index + 1)
      opaqueFields(messageNumber, message, index).forEach((field) => opaqueRecords.push(field))
      if (messageNumber === Profile.MesgNum.RECORD) records.push(message as RecordMesg)
    },
    fieldDescriptionListener: (key, developerDataId, fieldDescription) => {
      opaqueRecords.push({
        messageNumber: Profile.MesgNum.FIELD_DESCRIPTION ?? 206,
        messageName: 'fieldDescription',
        fieldNumber: key,
        rawType: 'developer-field-description',
        value: serializableValue(fieldDescription),
        context: { developerDataId: serializableValue(developerDataId) },
      })
    },
  })
  definitions.forEach((definition, index) => {
    opaqueRecords.push({
      messageNumber: definition.globalMessageNumber,
      messageName: Profile.messages[definition.globalMessageNumber]?.name ?? 'unknown',
      rawType: 'message-definition',
      value: serializableValue(definition),
      context: { definitionIndex: index },
    })
  })
  const sha256 = sha256Hex(bytes)
  const sourceId = `fit:${sha256}`
  const samples = records.flatMap((record) => mapRecord(record, fileName, sourceId))
  const timestamps = samples.map((sample) => sample.timestamp)
  const timestampExtent = finiteExtent(timestamps)
  const channels = [...new Set(samples.map((sample) => sample.channel))]
  const activityType = inferActivityType(messages as unknown as Record<string, unknown>)
  return {
    identity: {
      format: 'FIT',
      fileName,
      sha256,
      ...(timestampExtent === undefined ? {} : { startTime: new Date(timestampExtent[0]).toISOString(), endTime: new Date(timestampExtent[1]).toISOString() }),
      activityType,
      channels,
    },
    samples,
    opaqueRecords,
    rawBytes: bytes,
    metadata: {
      integrityValid,
      profileVersion,
      sdkProfileVersion: Profile.version,
      messageCounts: Object.fromEntries([...messageCounts.entries()].map(([number, count]) => [Profile.messages[number]?.name ?? String(number), count])),
      definitionCount: definitions.length,
      decodedMessages: serializableValue(messages),
    },
    warnings: errors.map((error) => error.message),
  }
}
