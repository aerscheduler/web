import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Loader2, PlaneTakeoff } from "lucide-react";
import type { Resource } from "@/types/api";
import { api } from "@/lib/api";
import { presignedObjectUrl, uploadToPresignedPost, type PresignedPost } from "@/lib/upload";

/**
 * The aircraft's photograph in its page header. Owners and admins click it to choose another;
 * the phone app could always set one and the console could only show it.
 */
export function AircraftPhoto({ resource, title, editable }: { resource: Resource; title: string; editable: boolean }) {
  const qc = useQueryClient();
  const input = React.useRef<HTMLInputElement>(null);
  const [broken, setBroken] = React.useState(false);
  // The object key is fixed per aircraft, so a replaced photo needs the browser's cache told.
  const [version, setVersion] = React.useState(0);
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const presigned = await api<PresignedPost>(`/resources/${resource.id}/featuredImage/signedUrl`);
      await uploadToPresignedPost(presigned, file);
      await api<void>(`/resources/${resource.id}/featuredImage`, { method: "PATCH", body: { featuredImageUrl: presignedObjectUrl(presigned) } });
    },
    onSuccess: () => {
      setBroken(false);
      setVersion(Date.now());
      toast.success("Photo updated");
      void qc.invalidateQueries({ queryKey: ["resources"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't update the photo"),
  });

  const picture =
    resource.featuredImage && !broken ? (
      <img src={version ? `${resource.featuredImage}?v=${version}` : resource.featuredImage} alt={title} className="size-full object-cover" onError={() => setBroken(true)} />
    ) : (
      <PlaneTakeoff className="size-7" />
    );
  const frame = "relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted text-muted-foreground";
  if (!editable) return <span className={frame}>{picture}</span>;

  return (
    <button
      type="button"
      className={`${frame} group/photo focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
      onClick={() => input.current?.click()}
      disabled={upload.isPending}
      aria-label={resource.featuredImage ? "Change the aircraft's photo" : "Add a photo of the aircraft"}
      title={resource.featuredImage ? "Change photo" : "Add a photo"}
    >
      {picture}
      <span
        className={`absolute inset-0 grid place-items-center bg-black/45 text-white transition-opacity ${upload.isPending ? "opacity-100" : "opacity-0 group-hover/photo:opacity-100 group-focus-visible/photo:opacity-100"}`}
      >
        {upload.isPending ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
      </span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        data-testid="aircraft-photo-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) upload.mutate(f);
        }}
      />
    </button>
  );
}
