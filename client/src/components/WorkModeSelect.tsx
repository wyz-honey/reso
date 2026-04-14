import GroupedSelect from './GroupedSelect';

/** 工作台工作模式：内置 / 自定义分组；末尾无分组项为「添加自定义目标」（打开弹窗，不切换模式）。 */
const ADD_CUSTOM_SENTINEL = '__reso_add_custom_target__';

export default function WorkModeSelect({ modes, value, onChange, onAddCustom }) {
  const builtinModes = modes.filter((m) => m.builtIn === true);
  const customModes = modes.filter((m) => m.builtIn !== true);

  const groups = [];
  if (builtinModes.length > 0) {
    groups.push({
      key: 'builtin',
      label: '内置',
      options: builtinModes.map((m) => ({ value: m.id, label: m.name })),
    });
  }
  if (customModes.length > 0) {
    groups.push({
      key: 'custom',
      label: '自定义',
      options: customModes.map((m) => ({ value: m.id, label: m.name })),
    });
  }

  return (
    <div className="work-mode-select-wrap">
      <GroupedSelect
        value={value}
        controlClassName="mode-select mode-select--workbench"
        aria-label="工作模式"
        groups={groups}
        soloOptions={[{ value: ADD_CUSTOM_SENTINEL, label: '添加自定义目标' }]}
        onChange={(e) => {
          const v = e.target.value;
          if (v === ADD_CUSTOM_SENTINEL) {
            onAddCustom();
            return;
          }
          onChange(v);
        }}
      />
    </div>
  );
}
