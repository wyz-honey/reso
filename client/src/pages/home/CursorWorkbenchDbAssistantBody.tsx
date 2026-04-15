import { useMemo } from 'react';
import CursorCliStructuredView from '../../components/CursorCliStructuredView';
import { parseCliOutputForDelivery, sanitizeCursorStderrForDisplay } from '../../cliOutputFormats/index';
import { splitStoredCliWorkbenchAssistant } from './cursorWorkbenchStoredAssistant';

/** 数据库中已落库的助手轮次：按 stream-json 结构化展示（与当前 info.txt 一致） */
export default function CursorWorkbenchDbAssistantBody({
  content,
  deliveryType = 'cursor_cli',
}: {
  content: string;
  deliveryType?: 'cursor_cli' | 'qoder_cli';
}) {
  const { parsed, stderr } = useMemo(() => {
    const { info, err } = splitStoredCliWorkbenchAssistant(content);
    const e = sanitizeCursorStderrForDisplay(err);
    return {
      parsed: parseCliOutputForDelivery(deliveryType, info, e),
      stderr: e,
    };
  }, [content, deliveryType]);

  return <CursorCliStructuredView parsed={parsed} stderr={stderr} formatHint={null} />;
}
