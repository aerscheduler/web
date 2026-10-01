import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Mail, Phone, Wrench } from "lucide-react";
import type { OrganizationUser, Role } from "@/types/api";
import { useMember } from "@/features/queries";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { memberEmail } from "@/components/people/util";
import { RoleBadges } from "@/components/role-badges";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A person in the workspace, wherever the console shows one: their avatar, optionally their name,
 * a card with more about them on hover (roles, how to reach them, a technician's certificate),
 * and a click on the avatar or the name through to their profile (the card itself has no link:
 * Tony took it out, the click is the way in). Tony asked for this to be THE avatar (2026-09-30): any
 * new place that shows a person uses it, so they all behave the same.
 *
 * The card reads the person when it opens, never before, so a list of fifty rows makes no
 * requests until somebody hovers. Somebody the viewer may not look up (the server says no) gets
 * the name alone in the card.
 *
 * On a touch screen there is no hover: a tap goes straight to the profile.
 */
export type WorkspacePerson = { id: number; name: string | null | undefined; profileImage?: string | null };

/** xs is a tag's height (ListTag is h-5), so an avatar beside labels lines up with them. */
const SIZES = { xs: "size-5", sm: "size-6", md: "size-8", lg: "size-10" } as const;
/** On the initials themselves: the fallback sets its own size, which would override one on the avatar. */
const INITIALS = { xs: "text-[8px] tracking-tight", sm: "text-[10px]", md: "text-xs", lg: "text-sm" } as const;

export function WorkspaceUserAvatar({
  person,
  showName = false,
  size = "xs",
  className,
  nameClassName,
}: {
  person: WorkspacePerson;
  /** The name beside the avatar. */
  showName?: boolean;
  size?: keyof typeof SIZES;
  className?: string;
  nameClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const name = person.name?.trim() || "Unknown";
  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={350} closeDelay={120}>
      <HoverCardTrigger asChild>
        <Link
          to="/people/$orgUserId"
          params={{ orgUserId: String(person.id) }}
          aria-label={showName ? undefined : name}
          className={cn("inline-flex min-w-0 items-center gap-1.5 rounded-full outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring underline-offset-2", className)}
        >
          <PersonAvatar name={name} image={person.profileImage} size={size} />
          {showName && <span className={cn("truncate", nameClassName)}>{name}</span>}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-72 p-0">
        {open && <PersonCard person={person} name={name} />}
      </HoverCardContent>
    </HoverCard>
  );
}

/** The avatar alone: the person's picture, or their initials on a colour that is always theirs. */
export function PersonAvatar({ name, image, size = "xs", className }: { name: string; image?: string | null; size?: keyof typeof SIZES; className?: string }) {
  return (
    <Avatar className={cn(SIZES[size], "shrink-0", className)}>
      {image && <AvatarImage src={image} alt="" />}
      <AvatarFallback className={cn("font-semibold text-white", INITIALS[size])} style={{ background: colourFor(name) }}>
        {initialsOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}

/** Several people as overlapping avatars, each with its own card: the technicians on a job. */
export function WorkspaceUserAvatars({ people, max = 3 }: { people: WorkspacePerson[]; max?: number }) {
  const shown = people.slice(0, max);
  const more = people.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((p, i) => (
        <WorkspaceUserAvatar key={p.id} person={p} className={cn("ring-2 ring-card", i > 0 && "-ml-1.5")} />
      ))}
      {more > 0 && <span className="ml-1 text-[11px] text-muted-foreground">+{more}</span>}
    </span>
  );
}

function PersonCard({ person, name }: { person: WorkspacePerson; name: string }) {
  const q = useMember(person.id);
  const m = q.data;
  const roles = m ? rolesOf(m) : [];
  const email = m ? memberEmail(m) : null;
  // Only sent to those allowed to see it; an owner the shop typed in carries the number it recorded.
  const details = m?.user?.details;
  const rawPhone = details?.phone ?? (m as (OrganizationUser & { contactPhone?: string | null }) | undefined)?.contactPhone ?? null;
  const phone = rawPhone ? formatPhone(rawPhone, details?.phoneCountry) : null;
  const outside = !!m?.external && !m.claimedAt;
  return (
    <div className="space-y-3 p-4 text-[13px]">
      <div className="flex items-center gap-3">
        <PersonAvatar name={name} image={person.profileImage ?? m?.profileImage} size="lg" />
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          {q.isPending ? (
            <Skeleton className="mt-1 h-4 w-24" />
          ) : outside ? (
            <p className="text-[12px] text-muted-foreground">Aircraft owner, not a member</p>
          ) : m ? (
            <div className="mt-1">
              <RoleBadges roles={roles} />
            </div>
          ) : null}
        </div>
      </div>
      {m && (email || phone || (m.technicianRole && m.mechanicCertificateNumber)) && (
        <div className="space-y-1.5 text-[12px] text-muted-foreground">
          {email && (
            <p className="flex min-w-0 items-center gap-2">
              <Mail className="size-3.5 shrink-0" /> <span className="truncate">{email}</span>
            </p>
          )}
          {phone && (
            <p className="flex items-center gap-2">
              <Phone className="size-3.5 shrink-0" /> {phone}
            </p>
          )}
          {m.technicianRole && m.mechanicCertificateNumber && (
            <p className="flex items-center gap-2">
              <Wrench className="size-3.5 shrink-0" />
              {[m.mechanicCertificateType, m.mechanicCertificateNumber].filter(Boolean).join(" ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function rolesOf(m: OrganizationUser): Role[] {
  const out: Role[] = [];
  if (m.ownerRole) out.push("owner");
  if (m.adminRole) out.push("admin");
  if (m.dispatcherRole) out.push("dispatcher");
  if (m.instructorRole) out.push("instructor");
  if (m.technicianRole) out.push("technician");
  if (m.studentRole) out.push("student");
  if (m.renterRole) out.push("renter");
  return out;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** The same colour for the same name every time, soft enough for white initials on both themes. */
function colourFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 42% 50%)`;
}
