import { GraduationCap, UserRound } from "lucide-react";
import type { AssignedPerson } from "@/types/api";
import { useAuth } from "@/lib/auth";
import { isInstructor, isStudent } from "@/lib/permissions";
import { useMyInstructionPartners } from "@/features/queries";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** First letters of a name, for the avatar fallback. */
function initials(name: string | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function PersonRow({ person }: { person: AssignedPerson }) {
  const user = person.orgUser?.user;
  return (
    <li className="flex items-center gap-3">
      <Avatar className="size-8">
        <AvatarFallback className="text-xs">{initials(user?.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{user?.name ?? "Unnamed member"}</p>
        {user?.email && (
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        )}
      </div>
    </li>
  );
}

/**
 * "My students" for an instructor, "My instructors" for a student — the pairing
 * the Flutter home page shows and the web console was missing. A member who is
 * both sees both lists.
 *
 * Assignments are made by an admin (`POST /instructors/assign`); this is a
 * read-only view of who you're currently paired with.
 */
export function InstructionPartnersCard() {
  const { roles, userId } = useAuth();
  const instructs = isInstructor(roles);
  const studies = isStudent(roles);

  const q = useMyInstructionPartners(userId, { enabled: instructs || studies });

  if (!instructs && !studies) return null;

  const sections = [
    instructs && {
      key: "students",
      title: "My students",
      icon: GraduationCap,
      people: q.data?.students ?? [],
      empty: "No students are assigned to you yet.",
    },
    studies && {
      key: "instructors",
      title: "My instructors",
      icon: UserRound,
      people: q.data?.instructors ?? [],
      empty: "No instructor is assigned to you yet. Ask your school to pair you with one.",
    },
  ].filter(Boolean) as {
    key: string;
    title: string;
    icon: typeof GraduationCap;
    people: AssignedPerson[];
    empty: string;
  }[];

  return (
    <>
      {sections.map((s) => (
        <Card key={s.key}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <s.icon className="size-4 text-muted-foreground" aria-hidden />
              {s.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {q.isPending ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-2/3" />
              </div>
            ) : q.isError ? (
              // Non-critical panel — a failure here shouldn't shout on the home
              // page, and everything else on it still works.
              <p className="text-sm text-muted-foreground">Couldn&rsquo;t load this right now.</p>
            ) : s.people.length === 0 ? (
              <p className="text-sm text-muted-foreground">{s.empty}</p>
            ) : (
              <ul className="space-y-3">
                {s.people.map((p) => (
                  <PersonRow key={p.id} person={p} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </>
  );
}
