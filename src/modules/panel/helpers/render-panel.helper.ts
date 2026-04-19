import { Request } from 'express';

type PanelSessionLike = {
  username?: string;
};

/**
 * Authenticated panel render'ları için ortak payload üretir.
 * currentPath sidebar active-highlight için, username header/sidebar için kullanılır.
 */
export function panelRenderPayload(
  req: Request & { session?: PanelSessionLike },
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    currentPath: req.path,
    username: req.session?.username || 'Admin',
    ...extra,
  };
}
