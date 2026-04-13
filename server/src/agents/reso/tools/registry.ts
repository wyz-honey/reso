/** 工具名 -> 执行器；function calling 启用时由 agent 循环调用 */
export type ToolHandler = (args: Record<string, unknown>) => Promise<string> | string;

export const resoToolRegistry: Record<string, ToolHandler> = {};

export function registerResoTool(name: string, handler: ToolHandler): void {
  resoToolRegistry[name] = handler;
}
