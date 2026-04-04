export type PrefixedString<P extends string> = `${P}${string}`;

export const ID_PREFIXES = {
  session: 'ses',
  message: 'msg',
  part: 'prt',
  toolResult: 'toolres',
  question: 'quest',
  permissionResponse: 'permres',
  permissionRule: 'perm',
  mcpServer: 'mcp',
  queuedMessage: 'qmsg',
  recording: 'rec',
  transcription: 'transcr',
  connectorInstance: 'conn',
  automation: 'auto',
  scheduledJob: 'schjob',
  scheduledJobRun: 'schrun',
} as const;

export type IdPrefix = (typeof ID_PREFIXES)[keyof typeof ID_PREFIXES];

let lastTimestamp = 0;
let counter = 0;

function randomBase62(length: number): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % 62];
  }
  return result;
}

function createId<P extends IdPrefix>(prefix: P): PrefixedString<P> {
  const currentTimestamp = Date.now();

  if (currentTimestamp !== lastTimestamp) {
    lastTimestamp = currentTimestamp;
    counter = 0;
  }
  counter++;

  const now = BigInt(currentTimestamp) * BigInt(0x1000) + BigInt(counter);

  const timeBytes = new Uint8Array(6);
  for (let i = 0; i < 6; i++) {
    timeBytes[i] = Number((now >> BigInt(40 - 8 * i)) & BigInt(0xff));
  }

  const hexPart = Array.from(timeBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return (prefix + '_' + hexPart + randomBase62(14)) as PrefixedString<P>;
}

function createIdFactory<P extends IdPrefix>(prefix: P): () => PrefixedString<P> {
  return () => createId(prefix);
}

export const createSessionId = createIdFactory(ID_PREFIXES.session);
export const createMessageId = createIdFactory(ID_PREFIXES.message);
export const createPartId = createIdFactory(ID_PREFIXES.part);
export const createToolResultId = createIdFactory(ID_PREFIXES.toolResult);
export const createQuestionId = createIdFactory(ID_PREFIXES.question);
export const createPermissionResponseId = createIdFactory(ID_PREFIXES.permissionResponse);
export const createPermissionRuleId = createIdFactory(ID_PREFIXES.permissionRule);
export const createMcpServerId = createIdFactory(ID_PREFIXES.mcpServer);
export const createQueuedMessageId = createIdFactory(ID_PREFIXES.queuedMessage);
export const createRecordingId = createIdFactory(ID_PREFIXES.recording);
export const createTranscriptionId = createIdFactory(ID_PREFIXES.transcription);
export const createConnectorInstanceId = createIdFactory(ID_PREFIXES.connectorInstance);
export const createAutomationId = createIdFactory(ID_PREFIXES.automation);
export const createScheduledJobId = createIdFactory(ID_PREFIXES.scheduledJob);
export const createScheduledJobRunId = createIdFactory(ID_PREFIXES.scheduledJobRun);

export function extractTimestamp(id: string): number {
  const prefix = id.split('_')[0];
  const hex = id.slice(prefix.length + 1, prefix.length + 13);
  const encoded = BigInt('0x' + hex);
  return Number(encoded / BigInt(0x1000));
}
