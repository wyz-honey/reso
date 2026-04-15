export function micErrorMessage(err: unknown) {
  if (!err) return '无法访问麦克风';
  const e = err as { name?: string; message?: string };
  const name = e.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return '麦克风权限被拒绝：请在浏览器地址栏左侧允许本站使用麦克风，或到系统设置里为本浏览器开启麦克风权限。';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return '未检测到麦克风设备，请连接麦克风或检查系统输入设备。';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return '麦克风被其他应用占用或无法打开，请关闭其他使用麦克风的程序后重试。';
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return '当前浏览器不支持所请求的麦克风参数，已自动尝试兼容模式。若仍失败请更换浏览器。';
  }
  if (name === 'SecurityError') {
    return '安全限制：请使用 https 或 http://localhost / 127.0.0.1 访问本页，不要用局域网 IP 打开（部分浏览器会禁止麦克风）。';
  }
  return e.message || '无法访问麦克风';
}

export async function acquireMicStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      '当前环境不支持 getUserMedia。请使用较新版本的 Chrome / Edge / Safari，并确保通过 localhost 或 https 访问。'
    );
  }
  if (!window.isSecureContext) {
    throw new Error(
      '非安全上下文：请用 http://localhost:端口 或 https 打开页面；用 http://192.168.x.x 访问时多数浏览器不允许麦克风。'
    );
  }
  const tryConstraints = [
    { audio: true },
    {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    },
    {
      audio: {
        channelCount: { ideal: 1 },
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
      },
    },
  ];
  let lastErr;
  for (const c of tryConstraints) {
    try {
      return await navigator.mediaDevices.getUserMedia(c);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}
