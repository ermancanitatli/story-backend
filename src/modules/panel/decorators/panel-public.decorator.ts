import { SetMetadata } from '@nestjs/common';

export const PANEL_PUBLIC_KEY = 'panelPublic';

/**
 * Panel route'larında SessionAuthGuard'ı bypass eder.
 * Login sayfası ve login POST için kullanılır.
 */
export const PanelPublic = () => SetMetadata(PANEL_PUBLIC_KEY, true);
