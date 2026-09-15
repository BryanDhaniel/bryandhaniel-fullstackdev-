import type { ApplicationStatus } from '../api/types';
import { IconCheck, IconInfo, IconSearchList, IconXCircle } from './icons';

/**
 * The glyph that represents each application status.
 *
 * A shape per status, because colour alone is not an accessible signal: the five
 * statuses are distinguishable by hue, and a colour-blind user would otherwise
 * see five identical pills. Kept in its own module so the badge in `ui.tsx` and
 * the status controls on the candidate page cannot drift apart.
 */
export const STATUS_ICONS: Record<ApplicationStatus, typeof IconCheck> = {
  APPLIED: IconSearchList,
  REVIEWING: IconInfo,
  SHORTLISTED: IconCheck,
  REJECTED: IconXCircle,
  ACCEPTED: IconCheck,
};
