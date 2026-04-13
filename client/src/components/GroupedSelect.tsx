/**
 * 分组原生下拉：optgroup + 末尾无分组项（在多数浏览器中单独成段）。
 * 用于工作台模式等需要「内置 / 自定义 / 操作项」分层的场景。
 */
export default function GroupedSelect({
  value,
  onChange,
  groups = [],
  soloOptions = [],
  className = '',
  controlClassName = '',
  disabled = false,
  'aria-label': ariaLabel,
}) {
  return (
    <div className={`reso-grouped-select ${className}`.trim()}>
      <select
        className={`reso-grouped-select__control ${controlClassName}`.trim()}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={onChange}
      >
        {groups.map((g) => (
          <optgroup key={g.key || g.label} label={g.label}>
            {(g.options || []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
        {soloOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
