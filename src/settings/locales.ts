/**
 * Dictionaries for the Jev settings page.
 *
 * Copy is locale-owned: every string the page renders is a key here, including
 * the navigation label, which the shell resolves per render so a locale switch
 * needs no re-registration. Field copy is keyed by the field table's own keys
 * (`<field>Label` / `<field>Hint`), so a field cannot reach the validator
 * without also reaching a dictionary.
 *
 * @module dsh-compaction-jev/client/locales
 */

/** Dictionary namespace this plugin owns. */
export const JEV_LOCALE_NAMESPACE = 'settings.jev'

/** English copy. */
export const en = {
  nav: 'Jev compaction',
  title: 'Jev compaction',
  intro:
    'Jev compacts by deciding which stale tool calls and results may leave the context and keeping everything else verbatim — it never summarizes. These values are read at every compaction, so a change applies to the next one.',
  enableLabel: 'Enable Jev compaction',
  enableHint:
    'Off runs the built-in summary. Every Jev failure falls back to it as well — no credential, a transport error, an image inside the region, an unusable answer, or too little released — so an unconfigured or broken backend cannot fail a compaction.',
  stateOn: 'On',
  stateOff: 'Off',
  paramsTitle: 'Values',
  advancedSummary: 'Advanced values',
  advancedHint: 'Endpoint, credential, model, token budgets, and the ongoing goal.',
  save: 'Save',
  discard: 'Discard changes',
  pendingHint: 'Applied at the next compaction.',
  cleanHint: 'No unsaved changes.',
  overridden: 'Set here',
  reset: 'Reset',
  loading: 'Reading settings…',
  unavailable: 'This client cannot reach the dsh-compaction-jev namespace, so these values cannot be edited here.',
  notWritable: 'This connection keeps preferences process-local, so a change is not persisted to the host.',
  invalidEmpty: 'Required. Use Reset to go back to the default.',
  invalidNumber: 'Enter a number.',
  invalidRange: 'Enter a number between {min} and {max}.',
  invalidMin: 'Enter a number of at least {min}.',
  invalidMax: 'Enter a number of at most {max}.',
  enabledLabel: 'Enable Jev compaction',
  enabledHint:
    'Off runs the built-in summary. Every Jev failure falls back to it as well, so an unconfigured or broken backend cannot fail a compaction.',
  keepThresholdLabel: 'Keep threshold',
  keepThresholdHint: 'Lowest keep probability that keeps a tool call or result. Lower keeps more.',
  preserveRecentMessagesLabel: 'Recent messages kept',
  preserveRecentMessagesHint: 'Newest messages a compaction never touches. The first message is always pinned.',
  minReductionRatioLabel: 'Minimum released',
  minReductionRatioHint:
    'Share of the region a checkpoint must remove, or the built-in summary runs instead.',
  truncateHeadCharsLabel: 'Dropped result head',
  truncateHeadCharsHint: 'Characters of a dropped tool result kept before its note.',
  modelLabel: 'Model',
  modelHint: 'Jev model the backend asks for.',
  apiKeyEnvLabel: 'Credential variable',
  apiKeyEnvHint: 'Environment variable holding the TypeSafe API key. The key itself is never stored here.',
  baseUrlLabel: 'Endpoint',
  baseUrlHint: 'System One endpoint the backend posts to.',
  timeoutMsLabel: 'Timeout (ms)',
  timeoutMsHint: 'Per-request limit before the compaction falls back.',
  maxStateTokensLabel: 'State budget (tokens)',
  maxStateTokensHint: 'Estimated ceiling for the checkpoint state.',
  maxRequestTokensLabel: 'Request budget (tokens)',
  maxRequestTokensHint: 'Estimated ceiling for the state plus one batch of questions.',
  goalLabel: 'Ongoing goal',
  goalHint: 'Task description placed in the state. Empty uses the last three user prompts.',
}

/** Dictionary key domain: exactly the keys English declares. */
export type JevSettingsKey = keyof typeof en

/** Chinese copy. */
export const zh: Record<JevSettingsKey, string> = {
  nav: 'Jev 压缩',
  title: 'Jev 压缩',
  intro:
    'Jev 通过判断哪些陈旧的工具调用与结果可以离开上下文来压缩,其余内容逐字保留 —— 它不做摘要。这些取值在每次压缩时读取,改动对下一次压缩生效。',
  enableLabel: '启用 Jev 压缩',
  enableHint:
    '关闭时使用内置摘要。Jev 的任何失败也都会退回内置摘要 —— 没有凭据、传输错误、区域内含图片、回答不可用、或释放量不足 —— 所以未配置或坏掉的后端不会让压缩失败。',
  stateOn: '已开启',
  stateOff: '已关闭',
  paramsTitle: '取值',
  advancedSummary: '高级取值',
  advancedHint: '接口地址、凭据、模型、token 预算与当前目标。',
  save: '保存',
  discard: '放弃改动',
  pendingHint: '将在下一次压缩时生效。',
  cleanHint: '没有未保存的改动。',
  overridden: '此处已设',
  reset: '恢复默认',
  loading: '正在读取设置…',
  unavailable: '这个客户端访问不到 dsh-compaction-jev 命名空间,无法在此修改这些取值。',
  notWritable: '当前连接把偏好保存在进程内,改动不会写回宿主。',
  invalidEmpty: '此项必填。要回到默认值请点"恢复默认"。',
  invalidNumber: '请输入一个数字。',
  invalidRange: '请输入 {min} 到 {max} 之间的数字。',
  invalidMin: '请输入不小于 {min} 的数字。',
  invalidMax: '请输入不大于 {max} 的数字。',
  enabledLabel: '启用 Jev 压缩',
  enabledHint:
    '关闭时使用内置摘要。Jev 的任何失败也都会退回内置摘要,所以未配置或坏掉的后端不会让压缩失败。',
  keepThresholdLabel: '保留阈值',
  keepThresholdHint: '工具调用或结果被保留所需的最低保留概率。越低保留越多。',
  preserveRecentMessagesLabel: '保留最近消息数',
  preserveRecentMessagesHint: '压缩绝不触碰的最新消息条数。第一条消息始终固定保留。',
  minReductionRatioLabel: '最小释放比例',
  minReductionRatioHint: '检查点必须移除的区域占比,否则改用内置摘要。',
  truncateHeadCharsLabel: '被丢弃结果保留字符数',
  truncateHeadCharsHint: '被丢弃的工具结果在附注之前保留的字符数。',
  modelLabel: '模型',
  modelHint: '后端请求的 Jev 模型名。',
  apiKeyEnvLabel: '凭据环境变量',
  apiKeyEnvHint: '存放 TypeSafe API key 的环境变量名。key 本身不会保存在这里。',
  baseUrlLabel: '接口地址',
  baseUrlHint: '后端请求的 System One 接口地址。',
  timeoutMsLabel: '超时(毫秒)',
  timeoutMsHint: '单次请求的上限,超过即退回内置摘要。',
  maxStateTokensLabel: '状态上限(tokens)',
  maxStateTokensHint: '检查点状态的估算上限。',
  maxRequestTokensLabel: '单次请求上限(tokens)',
  maxRequestTokensHint: '状态加一批问题合计的估算上限。',
  goalLabel: '当前目标',
  goalHint: '放入状态的任务描述。留空则使用最近三条用户消息。',
}