import type { OrganizationUser } from "@/types/api";
import { useEmergencyContacts } from "@/features/queries";
import { ageFrom, formatDateOfBirth, formatPhone, telHref } from "@/lib/phone";
import {
  CardEmpty,
  CardSkeleton,
  DetailCard,
  KeyValue,
  KeyValueList,
} from "@/components/detail/detail-page";
import { Badge } from "@/components/ui/badge";

/**
 * How to reach this person, and who to call if something happens to them.
 *
 * Shown only when the server actually returned `user.details`. That is the whole access
 * check on this side, and deliberately so: whether a viewer may see contact details
 * depends on a relationship the client cannot evaluate — an instructor gets it for their
 * OWN students and nobody else's — so re-deriving it here would be a second, wrong copy
 * of `canViewContactDetails`. If the details arrived, the server said yes.
 */
export function PersonContact({ ou, isSelf }: { ou: OrganizationUser; isSelf: boolean }) {
  const details = ou.user?.details;

  // No details means "not for you". Rendering an empty card would tell every student
  // that the field exists and is hidden, which is noise on most of the roster.
  if (!details) return null;

  const dob = formatDateOfBirth(details.dateOfBirth);
  const age = ageFrom(details.dateOfBirth);

  const hasAnything =
    details.phone || details.homePhone || details.workPhone || dob || details.preferredName;

  return (
    <>
      <DetailCard
        title="Contact"
        description={isSelf ? "How your school reaches you." : "How to reach them."}
      >
        {!hasAnything ? (
          <CardEmpty>
            {isSelf
              ? "Nothing on file — add a number from your profile."
              : "No contact details on file."}
          </CardEmpty>
        ) : (
          <KeyValueList>
            {details.phone && (
              <KeyValue label="Mobile">
                <PhoneLink value={details.phone} country={details.phoneCountry} />
              </KeyValue>
            )}
            {details.homePhone && (
              <KeyValue label="Home">
                <PhoneLink value={details.homePhone} />
              </KeyValue>
            )}
            {details.workPhone && (
              <KeyValue label="Work">
                <PhoneLink value={details.workPhone} />
              </KeyValue>
            )}
            {details.preferredName && (
              <KeyValue label="Goes by">{details.preferredName}</KeyValue>
            )}
            {dob && (
              <KeyValue label="Date of birth">
                {dob}
                {age != null && (
                  <span className="ml-1.5 text-muted-foreground">({age})</span>
                )}
              </KeyValue>
            )}
          </KeyValueList>
        )}
      </DetailCard>

      <PersonEmergencyContacts ou={ou} isSelf={isSelf} />
    </>
  );
}

/**
 * The emergency list.
 *
 * Fetched separately rather than read off `details.emergencyContacts`, even though the
 * member read carries them: this card is the one somebody opens in a hurry, and the
 * dedicated query refetches on focus so a number corrected two minutes ago at the front
 * desk is the one on screen. Gated on `details` having arrived at all, so it inherits
 * the same permission answer as the card above and never fires a request that would 403.
 */
function PersonEmergencyContacts({ ou, isSelf }: { ou: OrganizationUser; isSelf: boolean }) {
  const userId = ou.user?.id ?? null;
  const allowed = ou.user?.details != null;

  const q = useEmergencyContacts(userId, { enabled: allowed });
  const contacts = q.data ?? [];

  if (!allowed) return null;

  return (
    <DetailCard
      title="Emergency contacts"
      description={isSelf ? "Who we'd call for you." : "Who to call in an emergency."}
    >
      {q.isPending ? (
        <CardSkeleton rows={2} />
      ) : q.isError ? (
        <CardEmpty>Couldn&apos;t load emergency contacts.</CardEmpty>
      ) : contacts.length === 0 ? (
        <CardEmpty>
          {isSelf
            ? "Nobody on file — add someone from your profile."
            : "Nobody on file. Worth asking them to add someone."}
        </CardEmpty>
      ) : (
        <ul className="divide-y divide-border">
          {contacts.map((c) => (
            <li key={c.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{c.name}</span>
                {c.isPrimary && (
                  <Badge variant="secondary" className="text-[11px]">
                    Primary
                  </Badge>
                )}
                {c.relationship && (
                  <span className="text-xs text-muted-foreground">{c.relationship}</span>
                )}
              </div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                <PhoneLink value={c.phone} country={c.phoneCountry} />
                {c.altPhone && (
                  <>
                    {" · "}
                    <PhoneLink value={c.altPhone} country={c.altPhoneCountry} />
                  </>
                )}
              </div>
              {c.notes && <p className="mt-0.5 text-xs italic text-muted-foreground">{c.notes}</p>}
            </li>
          ))}
        </ul>
      )}
    </DetailCard>
  );
}

/** A number you can click to dial. Displayed nationally, dialed as E.164. */
function PhoneLink({ value, country }: { value: string; country?: string | null }) {
  return (
    <a href={telHref(value)} className="tabular-nums hover:text-foreground hover:underline">
      {formatPhone(value, country)}
    </a>
  );
}
