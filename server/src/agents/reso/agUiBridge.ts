import type { AgentEvent } from '@mariozechner/pi-agent-core';
import type { AssistantMessageEvent } from '@mariozechner/pi-ai';

const ts = () => Date.now();

export type AgUiSseWriter = (obj: Record<string, unknown>) => void;

/**
 * 将 Pi Agent 事件映射为 AG-UI 风格事件（见 https://docs.ag-ui.com/sdk/js/core/events ）。
 */
export function createAgUiPiBridge(opts: {
  threadId: string;
  runId: string;
  writeSse: AgUiSseWriter;
}) {
  const { threadId, runId, writeSse } = opts;
  let assistantMessageId = '';
  let textStarted = false;

  const emit = (o: Record<string, unknown>) => {
    writeSse({ timestamp: ts(), ...o });
  };

  const endTextIfOpen = () => {
    if (textStarted && assistantMessageId) {
      emit({ type: 'TEXT_MESSAGE_END', messageId: assistantMessageId });
    }
    textStarted = false;
    assistantMessageId = '';
  };

  const ensureTextMessage = () => {
    if (textStarted) return;
    assistantMessageId = crypto.randomUUID();
    emit({
      type: 'TEXT_MESSAGE_START',
      messageId: assistantMessageId,
      role: 'assistant',
    });
    textStarted = true;
  };

  const mapAssistantStream = (ev: AssistantMessageEvent) => {
    switch (ev.type) {
      case 'text_delta':
        if (ev.delta) {
          ensureTextMessage();
          emit({
            type: 'TEXT_MESSAGE_CONTENT',
            messageId: assistantMessageId,
            delta: ev.delta,
          });
        }
        break;
      case 'text_end':
        if (textStarted && assistantMessageId) {
          emit({ type: 'TEXT_MESSAGE_END', messageId: assistantMessageId });
          textStarted = false;
        }
        break;
      default:
        break;
    }
  };

  const onAgentEvent = (event: AgentEvent) => {
    switch (event.type) {
      case 'agent_start':
        emit({
          type: 'RUN_STARTED',
          threadId,
          runId,
        });
        endTextIfOpen();
        break;
      case 'message_update': {
        const inner = event.assistantMessageEvent;
        if (inner) {
          mapAssistantStream(inner);
        }
        break;
      }
      case 'message_end':
        endTextIfOpen();
        break;
      case 'tool_execution_start':
        endTextIfOpen();
        emit({
          type: 'TOOL_CALL_START',
          toolCallId: event.toolCallId,
          toolCallName: event.toolName,
          parentMessageId: assistantMessageId || undefined,
        });
        if (event.args !== undefined) {
          const delta = typeof event.args === 'string' ? event.args : JSON.stringify(event.args, null, 2);
          if (delta) {
            emit({
              type: 'TOOL_CALL_ARGS',
              toolCallId: event.toolCallId,
              delta,
            });
          }
        }
        break;
      case 'tool_execution_update':
        if (event.partialResult !== undefined) {
          const delta =
            typeof event.partialResult === 'string'
              ? event.partialResult
              : JSON.stringify(event.partialResult, null, 2);
          if (delta) {
            emit({
              type: 'TOOL_CALL_ARGS',
              toolCallId: event.toolCallId,
              delta,
            });
          }
        }
        break;
      case 'tool_execution_end': {
        const content =
          typeof event.result === 'string' ? event.result : JSON.stringify(event.result, null, 2);
        emit({
          type: 'TOOL_CALL_RESULT',
          messageId: assistantMessageId || crypto.randomUUID(),
          toolCallId: event.toolCallId,
          content: content ?? '',
          role: 'tool',
        });
        emit({
          type: 'TOOL_CALL_END',
          toolCallId: event.toolCallId,
        });
        break;
      }
      case 'agent_end':
        endTextIfOpen();
        emit({
          type: 'RUN_FINISHED',
          threadId,
          runId,
        });
        break;
      default:
        break;
    }
  };

  return { onAgentEvent };
}
