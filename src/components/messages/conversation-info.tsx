import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Bell, BellOff, CalendarDays, Camera, LogOut, Pencil, UserPlus, UserRound, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useConversationMessages, threadMessages, useEditGroup, useLeaveConversation, useMuteConversation } from "@/features/messages";
import { PROFILE_PHOTO_TYPES, useMembers } from "@/features/queries";
import { memberName } from "@/components/people/util";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ConversationSummary, MessageRef } from "@/types/messages";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PersonAvatar } from "@/components/workspace-user-avatar";
import { useConfirm } from "@/components/confirm-dialog";
import { refLink } from "@/components/messages/message-body";
import { SEARCH_TYPE_ICON } from "@/lib/search-links";

const ROLE_WORD: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  dispatcher: "Dispatcher",
  instructor: "Instructor",
  student: "Student",
  renter: "Renter",
  technician: "Technician",
};

const REF_ICON = {
  person: SEARCH_TYPE_ICON.person,
  resource: SEARCH_TYPE_ICON.resource,
  reservation: SEARCH_TYPE_ICON.reservation,
  workOrder: SEARCH_TYPE_ICON.workorder,
  squawk: SEARCH_TYPE_ICON.squawk,
} as const;

/**
 * A conversation's info, as a popover under its name (the info panel in Apple's Messages):
 * who it is with at the top, a row of actions, then the people and the records mentioned.
 * No dialog and no tabs; it closes when you click away.
 *
 * `children` is the header's name button. Pass `open`/`onOpenChange` so the faces button can
 * open the same popover. `underHeader` (the narrow dock panel) hangs it centered under the whole
 * header instead of from the name, which sits too far right for it to fit inside the panel.
 */
export function ConversationInfo({
  c,
  me,
  open,
  onOpenChange,
  onLeft,
  underHeader = false,
  children,
}: {
  c: ConversationSummary;
  me: number | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onLeft?: () => void;
  underHeader?: boolean;
  /** The element the popover hangs under (the header's name). */
  children: React.ReactNode;
}) {
  const q = useConversationMessages(open ? c.id : null);
  const mute = useMuteConversation(c.id);
  const leave = useLeaveConversation();
  const confirm = useConfirm();
  const ownRef = React.useRef<HTMLSpanElement>(null);
  // The enclosing <header>, measured when the popover opens (a virtual anchor, so the name
  // keeps its own layout).
  const headerAnchor = React.useMemo(
    () => ({
      current: {
        getBoundingClientRect: () => {
          const el = ownRef.current?.closest("header") ?? ownRef.current?.parentElement;
          return el ? el.getBoundingClientRect() : new DOMRect();
        },
      },
    }),
    []
  );
  const others = c.participants.filter((p) => p.orgUserId !== me);
  const other = c.kind === "direct" ? others[0] : null;
  const editable = c.kind === "group" && c.isParticipant;

  const mentioned = React.useMemo(() => {
    const { messages } = threadMessages(q.data);
    const seen = new Map<string, MessageRef>();
    for (let i = messages.length - 1; i >= 0; i--) {
      for (const [key, ref] of Object.entries(messages[i]!.refs)) {
        if (ref.type !== "person" && !seen.has(key)) seen.set(key, ref);
      }
    }
    return [...seen.values()];
  }, [q.data]);

  const onLeave = async () => {
    onOpenChange(false);
    const ok = await confirm({
      title: c.kind === "group" ? "Leave this group?" : "Leave this conversation?",
      description: "You stop receiving its messages. Somebody in it can add you back.",
      confirmLabel: "Leave",
      destructive: true,
    });
    if (!ok) return;
    leave.mutate(c.id, { onSuccess: () => onLeft?.(), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't leave.") });
  };

  const subtitle =
    c.kind === "direct"
      ? other?.roles.map((r) => ROLE_WORD[r] ?? r).join(", ") || "Member"
      : c.kind === "group"
        ? `${c.participants.length} people`
        : "Everyone on this booking and your organization's staff can read this";

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {underHeader ? (
        <>
          <PopoverAnchor virtualRef={headerAnchor} />
          <span ref={ownRef} className="contents">
            {children}
          </span>
        </>
      ) : (
        <PopoverAnchor asChild>{children}</PopoverAnchor>
      )}
      <PopoverContent align={underHeader ? "center" : "start"} sideOffset={underHeader ? 6 : 8} className="w-[320px] p-0">
        {/* Who it is with. A group's photo and name are edited right here, by anybody in it. */}
        <div className="flex flex-col items-center gap-2 px-5 pb-4 pt-5 text-center">
          {c.kind === "direct" ? (
            <PersonAvatar name={other?.name ?? c.title} image={other?.profileImage} size="lg" className="size-14" />
          ) : editable ? (
            <GroupPhoto c={c} />
          ) : (
            <GroupFaces c={c} />
          )}
          <div className="w-full min-w-0">
            {editable ? <GroupName c={c} /> : <p className="truncate text-base font-semibold">{c.title}</p>}
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        {/* What you can do, as a row of buttons. */}
        <div className="flex justify-center gap-2 px-4 pb-4">
          {other && (
            <ActionLink icon={UserRound} label="Profile" to="/people/$orgUserId" params={{ orgUserId: String(other.orgUserId) }} onDone={() => onOpenChange(false)} />
          )}
          {c.reservation && (
            <ActionLink
              icon={CalendarDays}
              label="Booking"
              to="/schedule/reservations/$reservationId"
              params={{ reservationId: String(c.reservation.id) }}
              onDone={() => onOpenChange(false)}
            />
          )}
          {c.isParticipant && (
            <ActionButton icon={c.muted ? Bell : BellOff} label={c.muted ? "Unmute" : "Mute"} pressed={c.muted} onClick={() => mute.mutate(!c.muted)} />
          )}
          {c.isParticipant && c.kind !== "direct" && <ActionButton icon={LogOut} label="Leave" onClick={onLeave} />}
        </div>

        {c.kind !== "direct" && (
          <Section title={`People · ${c.participants.length}`}>
            {editable && <AddPeople c={c} me={me} />}
            <PeopleList c={c} me={me} onDone={() => onOpenChange(false)} removable={editable} />
          </Section>
        )}

        {mentioned.length > 0 && (
          <Section title="Mentioned">
            <ul className="max-h-40 overflow-y-auto">
              {mentioned.map((ref) => {
                const Icon = REF_ICON[ref.type];
                const link = refLink(ref);
                const row = (
                  <>
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className={cn("truncate text-sm", !link && "text-muted-foreground")}>{ref.label}</span>
                  </>
                );
                return (
                  <li key={`${ref.type}-${ref.id}`}>
                    {link ? (
                      <Link
                        to={link.to as never}
                        params={link.params as never}
                        onClick={() => onOpenChange(false)}
                        className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent"
                      >
                        {row}
                      </Link>
                    ) : (
                      <span className="flex items-center gap-2.5 px-2 py-1.5">{row}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Just the people in a group or booking conversation, from the faces button at the right of
 * its header: a short list hung under that button, each row opening the person's profile.
 * The name's popover is the place for everything else.
 */
export function ConversationPeople({ c, me, children }: { c: ConversationSummary; me: number | null; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[280px] p-2">
        <p className="px-2 pb-1 pt-0.5 text-xs font-medium text-muted-foreground">People · {c.participants.length}</p>
        <PeopleList c={c} me={me} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function PeopleList({ c, me, onDone, removable = false }: { c: ConversationSummary; me: number | null; onDone: () => void; removable?: boolean }) {
  const edit = useEditGroup(c.id);
  // At once, no "are you sure": they can be added back the same way, and the line in the
  // conversation says who did it.
  const remove = (orgUserId: number) =>
    edit.remove.mutate(orgUserId, { onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't take them out.") });
  return (
    <ul className="max-h-64 overflow-y-auto">
      {c.participants.map((p) => (
        <li key={p.orgUserId} className="group/person relative">
          <Link
            to="/people/$orgUserId"
            params={{ orgUserId: String(p.orgUserId) }}
            onClick={onDone}
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent"
          >
            <PersonAvatar name={p.name} image={p.profileImage} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm">{p.orgUserId === me ? `${p.name} (you)` : p.name}</span>
            <span className={cn("shrink-0 text-xs text-muted-foreground", removable && p.orgUserId !== me && "group-hover/person:invisible group-focus-within/person:invisible")}>
              {p.roles.map((r) => ROLE_WORD[r] ?? r)[0] ?? ""}
            </span>
          </Link>
          {removable && p.orgUserId !== me && (
            <button
              type="button"
              aria-label={`Remove ${p.name}`}
              onClick={() => remove(p.orgUserId)}
              className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground opacity-0 hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover/person:opacity-100"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function GroupFaces({ c }: { c: ConversationSummary }) {
  if (c.photoUrl) return <img src={c.photoUrl} alt="" className="size-14 rounded-full object-cover" />;
  return (
    <span className="flex">
      {c.participants.slice(0, 3).map((p, i) => (
        <PersonAvatar key={p.orgUserId} name={p.name} image={p.profileImage} size="lg" className={cn("ring-2 ring-popover", i > 0 && "-ml-3")} />
      ))}
    </span>
  );
}

/** The group's photo, or its faces, as a button: choose a photo, or take it away. */
function GroupPhoto({ c }: { c: ConversationSummary }) {
  const edit = useEditGroup(c.id);
  const input = React.useRef<HTMLInputElement>(null);
  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!PROFILE_PHOTO_TYPES.includes(file.type)) return void toast.error("Pick a JPG, PNG, WebP or GIF image.");
    edit.photo.mutate(file, { onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't change the photo.") });
  };
  const face = (
    <span className={cn("relative block rounded-full", edit.photo.isPending && "opacity-60")}>
      <GroupFaces c={c} />
      <span className="absolute -bottom-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full border-2 border-popover bg-muted text-muted-foreground">
        <Camera className="size-3" aria-hidden />
      </span>
    </span>
  );
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={PROFILE_PHOTO_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {c.photoUrl ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Group photo" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {face}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem onSelect={() => input.current?.click()}>Choose a photo</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => edit.photo.mutate(null)}>Remove photo</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button type="button" aria-label="Add a group photo" onClick={() => input.current?.click()} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {face}
        </button>
      )}
    </>
  );
}

/** The group's name, edited in place: click it, type, Enter (Escape puts it back). */
function GroupName({ c }: { c: ConversationSummary }) {
  const edit = useEditGroup(c.id);
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(c.groupTitle ?? "");
  React.useEffect(() => {
    if (!editing) setValue(c.groupTitle ?? "");
  }, [c.groupTitle, editing]);
  const save = () => {
    setEditing(false);
    if (value.trim() === (c.groupTitle ?? "").trim()) return;
    edit.rename.mutate(value.trim(), { onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't rename the group.") });
  };
  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        maxLength={80}
        placeholder="Name this group"
        aria-label="Group name"
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            e.stopPropagation();
            setValue(c.groupTitle ?? "");
            setEditing(false);
          }
        }}
        className="w-full rounded-md border bg-background px-2 py-1 text-center text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group/name mx-auto flex max-w-full items-center justify-center gap-1.5 rounded-md px-2 py-0.5 hover:bg-accent"
    >
      <span className={cn("truncate text-base font-semibold", !c.groupTitle && "text-muted-foreground")}>{c.groupTitle || "Name this group"}</span>
      <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover/name:opacity-100" aria-hidden />
    </button>
  );
}

/** Add people to a group: type a name, pick from the list. */
function AddPeople({ c, me }: { c: ConversationSummary; me: number | null }) {
  const members = useMembers();
  const edit = useEditGroup(c.id);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const options = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const inIt = new Set(c.participants.map((p) => p.orgUserId));
    return (members.data ?? [])
      .filter((m) => m.id !== me && !m.archivedAt && !inIt.has(m.id))
      .map((m) => ({ id: m.id, name: memberName(m), image: m.profileImage ?? null }))
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 6);
  }, [members.data, c.participants, query, me]);
  const add = (id: number) =>
    edit.add.mutate([id], {
      onSuccess: () => setQuery(""),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't add them."),
    });
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-primary hover:bg-accent">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary/10">
          <UserPlus className="size-3.5" aria-hidden />
        </span>
        Add people
      </button>
    );
  }
  return (
    <div className="px-1 pb-1">
      <input
        autoFocus
        value={query}
        placeholder="Add a name"
        aria-label="Add people"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
          }
          if (e.key === "Enter" && options[0]) add(options[0].id);
        }}
        className="mb-1 h-8 w-full rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <ul role="listbox" aria-label="People to add">
        {options.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => add(o.id)}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span aria-hidden className="contents">
                <PersonAvatar name={o.name} image={o.image} size="sm" />
              </span>
              <span className="truncate">{o.name}</span>
            </button>
          </li>
        ))}
        {options.length === 0 && <li className="px-2 py-1.5 text-sm text-muted-foreground">Nobody else to add.</li>}
      </ul>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t px-2 pb-2 pt-2.5">
      <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

const ACTION = "flex w-[68px] flex-col items-center gap-1 rounded-lg bg-muted px-2 py-2 text-[11px] font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ActionButton({ icon: Icon, label, onClick, pressed }: { icon: LucideIcon; label: string; onClick: () => void; pressed?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} className={ACTION}>
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  );
}

function ActionLink({ icon: Icon, label, to, params, onDone }: { icon: LucideIcon; label: string; to: string; params: Record<string, string>; onDone: () => void }) {
  return (
    <Link to={to as never} params={params as never} onClick={onDone} className={ACTION}>
      <Icon className="size-4" aria-hidden />
      {label}
    </Link>
  );
}
