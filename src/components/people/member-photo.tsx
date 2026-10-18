import { useRef } from "react";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { UploadError } from "@/lib/upload";
import { cn, initials } from "@/lib/utils";
import { PROFILE_PHOTO_TYPES, useRemoveMemberPhoto, useUpdateMemberPhoto } from "@/features/queries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** An avatar never needs more than this; a phone photo is 4000px and several megabytes. */
const MAX_EDGE = 800;

/**
 * Shrink a picked photo to `MAX_EDGE` on its long side, as JPEG. Keeps a small file as it is,
 * so a GIF stays animated and a PNG keeps its transparency when there is no need to touch it.
 */
async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1024 * 1024) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

/**
 * A member's avatar that changes their profile photo when `editable`: the member on their own
 * profile, or an owner/admin on anyone's. Click to pick a photo; with one already set, a menu
 * offers to replace or remove it. Without `editable` it is the plain avatar.
 */
export function MemberPhoto({
  orgUserId,
  name,
  image,
  editable,
  className,
  fallbackClassName,
  onChanged,
}: {
  orgUserId: number;
  name: string | null | undefined;
  image: string | null | undefined;
  editable: boolean;
  className?: string;
  fallbackClassName?: string;
  /** After a change lands, e.g. to refresh the signed-in session when it is your own. */
  onChanged?: () => void | Promise<unknown>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUpdateMemberPhoto(orgUserId);
  const remove = useRemoveMemberPhoto(orgUserId);
  const busy = upload.isPending || remove.isPending;

  const avatar = (
    <Avatar className={className}>
      {image && <AvatarImage src={image} alt={name ?? ""} className="object-cover" />}
      <AvatarFallback className={fallbackClassName}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
  if (!editable) return avatar;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    if (!PROFILE_PHOTO_TYPES.includes(picked.type)) {
      toast.error("Pick a JPG, PNG, WebP or GIF image.");
      return;
    }
    try {
      await upload.mutateAsync(await shrink(picked));
      await onChanged?.();
      toast.success("Photo updated");
    } catch (err) {
      toast.error(err instanceof ApiError || err instanceof UploadError ? err.message : "Couldn't upload the photo");
    }
  }

  async function onRemove() {
    try {
      await remove.mutateAsync();
      await onChanged?.();
      toast.success("Photo removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't remove the photo");
    }
  }

  const face = (
    <span className="relative inline-flex shrink-0 rounded-full">
      {avatar}
      <span
        className={cn(
          "absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity",
          "group-hover/photo:opacity-100 group-focus-visible/photo:opacity-100",
          busy && "opacity-100"
        )}
      >
        {busy ? <Loader2 className="size-1/3 animate-spin" /> : <Camera className="size-1/3" />}
      </span>
    </span>
  );

  const label = image ? "Change photo" : "Add photo";

  return (
    <>
      <input ref={input} type="file" accept={PROFILE_PHOTO_TYPES.join(",")} className="hidden" onChange={onPick} />
      {image ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={busy}>
            <button type="button" aria-label={label} title={label} className="group/photo inline-flex shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {face}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => input.current?.click()}>
              <ImagePlus className="size-4" />
              Upload new photo
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => void onRemove()}>
              <Trash2 className="size-4" />
              Remove photo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button
          type="button"
          aria-label={label}
          title={label}
          disabled={busy}
          onClick={() => input.current?.click()}
          className="group/photo inline-flex shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {face}
        </button>
      )}
    </>
  );
}
