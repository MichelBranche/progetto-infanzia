const REMOTE_PROXY_RE = /\/remote\/([a-f0-9]+)/i;

export function parseRemoteProxyId(streamUrl: string): string | null {
  const match = streamUrl.match(REMOTE_PROXY_RE);
  return match?.[1] ?? null;
}
