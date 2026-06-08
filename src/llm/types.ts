export type ChatCompletionFn = (
  system: string,
  user: string,
  maxTokens: number,
  jsonMode?: boolean
) => Promise<string>;
