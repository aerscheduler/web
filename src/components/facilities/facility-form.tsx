import * as React from "react";
import { toast } from "sonner";
import { useCreateRoom, useCreateSimulator } from "@/features/queries";
import type { Location } from "@/types/api";
import { ApiError } from "@/lib/api";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Combobox, type ComboOption } from "@/components/combobox";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type FacilityKind = "simulator" | "room";

/** Create a simulator or a room. tach/hobbs are deci-hours; rate is cents (MoneyInput edge). */
export function FacilityFormModal({
  open,
  onOpenChange,
  kind,
  locations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: FacilityKind;
  locations: Location[];
}) {
  const createSim = useCreateSimulator();
  const createRoom = useCreateRoom();
  const pending = createSim.isPending || createRoom.isPending;

  const [name, setName] = React.useState("");
  const [roomNumber, setRoomNumber] = React.useState("");
  const [hobbs, setHobbs] = React.useState("");
  const [tach, setTach] = React.useState("");
  const [rateCents, setRateCents] = React.useState<number>(0);
  const [billByHobbs, setBillByHobbs] = React.useState(true);
  const [locationId, setLocationId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (open && !wasOpen.current) {
      setName("");
      setRoomNumber("");
      setHobbs("");
      setTach("");
      setRateCents(0);
      setBillByHobbs(true);
      setLocationId(locations.length === 1 ? String(locations[0].id) : "");
      setError(null);
    }
    wasOpen.current = open;
  }, [open, locations]);

  const locationOptions: ComboOption[] = locations.map((l) => ({
    value: String(l.id),
    label: l.name,
  }));
  const noLocations = locations.length === 0;

  const valid =
    !!locationId && (kind === "simulator" ? name.trim().length > 0 : roomNumber.trim().length > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!locationId) return setError("Pick a home base for this resource.");

    try {
      if (kind === "simulator") {
        if (!name.trim()) return setError("Give the simulator a name.");
        await createSim.mutateAsync({
          location: { id: Number(locationId) },
          type: {
            simulator: {
              name: name.trim(),
              hobbsTime: Math.round((Number(hobbs) || 0) * 10),
              tachTime: Math.round((Number(tach) || 0) * 10),
              cost: { rate: rateCents, billByHobbsTime: billByHobbs },
            },
          },
        });
        toast.success("Simulator added");
      } else {
        if (!roomNumber.trim()) return setError("Enter a room number.");
        await createRoom.mutateAsync({
          location: { id: Number(locationId) },
          type: { room: { roomNumber: roomNumber.trim() } },
        });
        toast.success("Room added");
      }
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : `Couldn't add the ${kind}`;
      setError(msg);
      toast.error(msg);
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={kind === "simulator" ? "Add simulator" : "Add room"}
      description={
        kind === "simulator"
          ? "A simulator can be booked for sim sessions and billed by the hour."
          : "A ground-school room can be booked for ground lessons."
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {kind === "simulator" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="sim-name">Name</Label>
              <Input
                id="sim-name"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 60))}
                placeholder="e.g. Redbird FMX"
                maxLength={60}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sim-rate">Rate (per hour)</Label>
                <MoneyInput id="sim-rate" cents={rateCents} onCentsChange={setRateCents} />
              </div>
              <div className="flex items-end justify-between gap-2 pb-2">
                <Label htmlFor="sim-billby" className="leading-tight">
                  Bill by {billByHobbs ? "Hobbs" : "tach"} time
                </Label>
                <Switch
                  id="sim-billby"
                  checked={billByHobbs}
                  onCheckedChange={setBillByHobbs}
                  aria-label="Bill by Hobbs time"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sim-hobbs">Current Hobbs</Label>
                <Input
                  id="sim-hobbs"
                  inputMode="decimal"
                  value={hobbs}
                  onChange={(e) => setHobbs(e.target.value)}
                  placeholder="0.0"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-tach">Current tach</Label>
                <Input
                  id="sim-tach"
                  inputMode="decimal"
                  value={tach}
                  onChange={(e) => setTach(e.target.value)}
                  placeholder="0.0"
                />
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="room-number">Room number / name</Label>
            <Input
              id="room-number"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              placeholder="e.g. Briefing Room 2"
              autoFocus
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Home base</Label>
          <Combobox
            options={locationOptions}
            value={locationId}
            onChange={setLocationId}
            placeholder={noLocations ? "No locations yet" : "Select location"}
            searchPlaceholder="Search locations…"
            emptyText="No locations."
          />
          {noLocations && (
            <p className="text-xs text-muted-foreground">
              Add a location under Settings first.
            </p>
          )}
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!valid || pending}>
            {pending ? "Adding…" : kind === "simulator" ? "Add simulator" : "Add room"}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
