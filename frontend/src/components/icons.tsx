import type { IconProps as PhosphorIconProps } from '@phosphor-icons/react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  CheckCircle,
  Clock,
  Coins,
  Compass,
  Eye,
  EyeSlash,
  Funnel,
  Info,
  ListMagnifyingGlass,
  MagnifyingGlass,
  MapPin,
  PaperPlaneTilt,
  Prohibit,
  SealCheck,
  SignOut,
  SlidersHorizontal,
  SpinnerGap,
  Star,
  Trash,
  User,
  WarningCircle,
  X,
  XCircle,
} from '@phosphor-icons/react';

/**
 * The app's icon vocabulary.
 *
 * Every glyph in the UI comes from this file, and every one of them ships at a
 * single stroke weight. Re-exporting from one module is what makes that
 * enforceable: there is no second place to add a one-off icon with the wrong
 * weight, and no hand-authored `<path>` anywhere in the codebase.
 *
 * Phosphor is used rather than the more common default because its shapes are
 * drawn on a 256 grid with consistent optical weight at small sizes, which
 * matters for the dense status controls on the candidate page.
 */
export type { PhosphorIconProps };

/**
 * Shared default. `1.5` matches the hairline borders in the design system; at
 * `2` the glyphs compete with the typography.
 */
const STROKE = 1.5;

/** Wraps a Phosphor glyph so the whole app shares one stroke weight and size. */
function sized(
  Icon: React.ComponentType<PhosphorIconProps>,
  defaultSize = 20,
) {
  return function AppIcon({ size = defaultSize, weight, ...rest }: PhosphorIconProps) {
    return <Icon size={size} weight={weight ?? 'regular'} strokeWidth={STROKE} {...rest} />;
  };
}

// Navigation and chrome
export const IconArrowLeft = sized(ArrowLeft, 16);
export const IconArrowRight = sized(ArrowRight, 16);
export const IconArrowUpRight = sized(ArrowUpRight, 16);
export const IconCaretLeft = sized(CaretLeft, 16);
export const IconCaretRight = sized(CaretRight, 16);
export const IconSignOut = sized(SignOut, 16);
export const IconFunnel = sized(Funnel, 16);
export const IconSliders = sized(SlidersHorizontal, 16);
export const IconX = sized(X, 16);

// Domain
export const IconBriefcase = sized(Briefcase, 18);
export const IconMapPin = sized(MapPin, 16);
export const IconCoins = sized(Coins, 16);
export const IconClock = sized(Clock, 16);
export const IconCalendar = sized(CalendarBlank, 16);
export const IconUser = sized(User, 16);
export const IconCompass = sized(Compass, 18);
export const IconPaperPlane = sized(PaperPlaneTilt, 16);
export const IconSealCheck = sized(SealCheck, 16);
export const IconStar = sized(Star, 16);

// Search
export const IconSearch = sized(MagnifyingGlass, 16);
export const IconSearchList = sized(ListMagnifyingGlass, 18);

// Feedback
export const IconWarning = sized(WarningCircle, 18);
export const IconInfo = sized(Info, 18);
export const IconCheck = sized(CheckCircle, 18);
export const IconXCircle = sized(XCircle, 18);
export const IconProhibit = sized(Prohibit, 16);
export const IconTrash = sized(Trash, 16);
export const IconEye = sized(Eye, 16);
export const IconEyeSlash = sized(EyeSlash, 16);

/**
 * The one spinner left in the app: used inside buttons that are mid-flight.
 * Page-level and list-level loading use shape-matched skeletons instead, which
 * is why this is not exported as a general-purpose `Spinner`.
 */
export const IconSpinner = sized(SpinnerGap, 16);
