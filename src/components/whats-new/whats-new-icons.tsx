import {
  BarChart3,
  Bell,
  CalendarDays,
  CircleCheck,
  CircleDollarSign,
  Clock,
  FileText,
  Mail,
  Plane,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { WhatsNewIcon } from "@/types/whats-new";

/**
 * The server's icon names, drawn in lucide. Keep in step with `WHATS_NEW_ICONS` in
 * server/src/whatsNew/types.ts and `whats_new_icons.dart` in the app. An unknown name draws
 * the sparkle rather than nothing, so an icon added on the server first still renders.
 */
const ICONS: Record<WhatsNewIcon, LucideIcon> = {
  bell: Bell,
  calendar: CalendarDays,
  chart: BarChart3,
  check: CircleCheck,
  clock: Clock,
  document: FileText,
  mail: Mail,
  money: CircleDollarSign,
  people: Users,
  person: User,
  plane: Plane,
  receipt: Receipt,
  search: Search,
  settings: Settings,
  shield: ShieldCheck,
  sparkles: Sparkles,
  sync: RefreshCw,
  wrench: Wrench,
};

export function whatsNewIcon(name: string): LucideIcon {
  return ICONS[name as WhatsNewIcon] ?? Sparkles;
}
