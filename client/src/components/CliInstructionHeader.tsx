import { useId } from 'react';

/** 完整指令标题行：文案 + 问号说明 + 示例 */
export const CLI_ANGLE_HELP_TEXT =
  '使用尖括号 <> 包裹占位标签，例如 <输入>。确认时按下方每项配置替换为实际内容。亦可使用双花括号变量，如 {{paragraph}}、{{sessionId}}、{{workspace}}。';

export default function CliInstructionHeader({ onExample }) {
  const tipId = useId();
  return (
    <div className="cli-instruction-header">
      <span className="cli-instruction-header-title">完整指令</span>
      <span className="cli-instruction-header-tools">
        <span className="cli-help-bubble-wrap">
          <button
            type="button"
            className="cli-help-bubble"
            aria-describedby={tipId}
            aria-label="尖括号占位说明"
          >
            ?
          </button>
          <span id={tipId} className="cli-help-tooltip" role="tooltip">
            {CLI_ANGLE_HELP_TEXT}
          </span>
        </span>
        <button type="button" className="cli-example-btn" onClick={onExample}>
          示例
        </button>
      </span>
    </div>
  );
}
