import type { SupabaseClient } from "npm:@supabase/supabase-js@2.111.0";
import { z } from "npm:zod@4.4.3";
import {
  adminClient,
  callerClient,
} from "../_shared/auth.ts";
import { corsHeaders, RequestOriginError } from "../_shared/cors.ts";
import { decodeAndSanitizeImage } from "../_shared/image-decoder.ts";
import {
  executeGroupIdentityCommand,
  type GroupIdentityDependencies,
  GroupIdentityBoundaryError,
} from "../_shared/group-core.ts";
import { jsonResponse, readJson } from "../_shared/http.ts";
import {
  decodeStoredImage,
  MediaBoundaryError,
  validateIncomingUpload,
} from "../_shared/media-core.ts";
import type {
  GroupIdentityCommand,
  PublicGroupIdentity,
} from "../../../src/shared/api/contracts.ts";

const mediaCommandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("prepare-upload"),
    groupId: z.uuid(),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    byteSize: z.number().int().positive(),
    requestKey: z.uuid(),
  }),
  z.object({
    action: z.literal("finalize-upload"),
    groupId: z.uuid(),
    objectPath: z.string().min(20).max(300),
    requestKey: z.uuid(),
  }),
  z.object({
    action: z.literal("get-image-url"),
    groupId: z.uuid(),
    requestKey: z.uuid(),
  }),
  z.object({
    action: z.literal("remove-image"),
    groupId: z.uuid(),
    requestKey: z.uuid(),
  }),
]);

type MediaCommand = z.infer<typeof mediaCommandSchema>;
type AuditableCommand = {
  action: string;
  groupId: string;
  requestKey: string;
};

function mapGroup(row: Record<string, unknown>): PublicGroupIdentity {
  return {
    groupId: String(row.group_id),
    groupNumber: Number(row.group_number),
    displayName: String(row.display_name),
    imageObjectPath:
      typeof row.image_object_path === "string"
        ? row.image_object_path
        : null,
    lockedAt: typeof row.locked_at === "string" ? row.locked_at : null,
  };
}

function mapGroupError(message: string): never {
  if (message.includes("GROUP_IDENTITY_LOCKED")) {
    throw new GroupIdentityBoundaryError("GROUP_IDENTITY_LOCKED", 409);
  }
  if (message.includes("GROUP_MEMBER_INVALID")) {
    throw new GroupIdentityBoundaryError("GROUP_MEMBER_INVALID", 400);
  }
  if (message.includes("GROUP_ACTION_DENIED")) {
    throw new GroupIdentityBoundaryError("GROUP_ACTION_DENIED", 403);
  }
  if (message.includes("INVALID_GROUP_ACTION")) {
    throw new GroupIdentityBoundaryError("INVALID_GROUP_ACTION", 400);
  }
  throw new GroupIdentityBoundaryError("GROUP_ACTION_NOT_AVAILABLE", 409);
}

function mapMediaError(message: string): never {
  if (message.includes("MEDIA_ACTION_DENIED")) {
    throw new MediaBoundaryError("MEDIA_NOT_AVAILABLE", 403);
  }
  if (message.includes("MEDIA_TYPE_REJECTED")) {
    throw new MediaBoundaryError("MEDIA_TYPE_REJECTED", 400);
  }
  if (message.includes("MEDIA_TOO_LARGE")) {
    throw new MediaBoundaryError("MEDIA_TOO_LARGE", 413);
  }
  if (message.includes("MEDIA_SIGNATURE_MISMATCH")) {
    throw new MediaBoundaryError("MEDIA_SIGNATURE_MISMATCH", 400);
  }
  if (message.includes("MEDIA_DIMENSIONS_REJECTED")) {
    throw new MediaBoundaryError("MEDIA_DIMENSIONS_REJECTED", 400);
  }
  throw new MediaBoundaryError("MEDIA_NOT_AVAILABLE", 404);
}

function dependencies(client: SupabaseClient): GroupIdentityDependencies {
  return {
    async execute(command) {
      const result = await client.rpc("manage_group_identity", {
        p_action: command.action,
        p_group_id: command.groupId,
        p_display_name:
          command.action === "rename" ? command.displayName : null,
        p_next_editor_id:
          command.action === "transfer-editor"
            ? command.nextEditorId
            : null,
        p_request_key: command.requestKey,
      });
      if (result.error) mapGroupError(result.error.message);
      const row = result.data?.[0] as Record<string, unknown> | undefined;
      if (!row) {
        throw new GroupIdentityBoundaryError(
          "GROUP_ACTION_NOT_AVAILABLE",
          409,
        );
      }
      return mapGroup(row);
    },
  };
}

async function executeMediaCommand(
  command: MediaCommand,
  caller: SupabaseClient,
  admin: SupabaseClient,
): Promise<Record<string, unknown>> {
  const bucket = admin.storage.from("group-images");
  if (command.action === "prepare-upload") {
    validateIncomingUpload({
      mimeType: command.mimeType,
      byteSize: command.byteSize,
    });
    const authorization = await caller.rpc("authorize_group_media_upload", {
      p_group_id: command.groupId,
      p_mime_type: command.mimeType,
      p_declared_size: command.byteSize,
      p_request_key: command.requestKey,
    });
    if (authorization.error) mapMediaError(authorization.error.message);
    const row = authorization.data?.[0] as
      | { object_path?: string }
      | undefined;
    if (!row?.object_path) {
      throw new MediaBoundaryError("MEDIA_NOT_AVAILABLE", 404);
    }
    const signed = await bucket.createSignedUploadUrl(row.object_path);
    if (signed.error || !signed.data?.signedUrl) {
      throw new MediaBoundaryError("MEDIA_NOT_AVAILABLE", 409);
    }
    return {
      objectPath: row.object_path,
      uploadUrl: signed.data.signedUrl,
      uploadToken: signed.data.token,
    };
  }

  if (command.action === "get-image-url") {
    const authorization = await caller.rpc("authorize_group_media_read", {
      p_group_id: command.groupId,
    });
    if (authorization.error) mapMediaError(authorization.error.message);
    const row = authorization.data?.[0] as
      | { object_path?: string }
      | undefined;
    if (!row?.object_path) {
      throw new MediaBoundaryError("MEDIA_NOT_AVAILABLE", 404);
    }
    const signed = await bucket.createSignedUrl(row.object_path, 600);
    if (signed.error || !signed.data?.signedUrl) {
      throw new MediaBoundaryError("MEDIA_NOT_AVAILABLE", 404);
    }
    return { imageUrl: signed.data.signedUrl, expiresInSeconds: 600 };
  }

  if (command.action === "remove-image") {
    const authorization = await caller.rpc("authorize_group_media_removal", {
      p_group_id: command.groupId,
    });
    if (authorization.error) mapMediaError(authorization.error.message);
    const row = authorization.data?.[0] as { object_path?: string } | undefined;
    if (!row?.object_path) {
      throw new MediaBoundaryError("MEDIA_NOT_AVAILABLE", 404);
    }
    const removed = await bucket.remove([row.object_path]);
    if (removed.error) {
      throw new MediaBoundaryError("MEDIA_NOT_AVAILABLE", 409);
    }
    const finalized = await caller.rpc("finalize_group_media_removal", {
      p_group_id: command.groupId,
      p_object_path: row.object_path,
      p_request_key: command.requestKey,
    });
    if (finalized.error) mapMediaError(finalized.error.message);
    return { removed: true };
  }

  const authorization = await caller.rpc("authorize_group_media_finalize", {
    p_group_id: command.groupId,
    p_object_path: command.objectPath,
  });
  if (authorization.error) mapMediaError(authorization.error.message);
  const authorized = authorization.data?.[0] as
    | { object_path?: string; mime_type?: string }
    | undefined;
  if (!authorized?.object_path || !authorized.mime_type) {
    throw new MediaBoundaryError("MEDIA_NOT_AVAILABLE", 404);
  }

  const canonicalPath = authorized.object_path;
  const downloaded = await bucket.download(canonicalPath);
  if (downloaded.error || !downloaded.data) {
    throw new MediaBoundaryError("MEDIA_NOT_AVAILABLE", 404);
  }

  try {
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    const inspected = await decodeStoredImage(
      bytes,
      authorized.mime_type,
      decodeAndSanitizeImage,
    );
    const replaced = await bucket.update(
      canonicalPath,
      inspected.sanitizedBytes,
      {
        contentType: inspected.mimeType,
        upsert: true,
      },
    );
    if (replaced.error) {
      throw new MediaBoundaryError("MEDIA_NOT_AVAILABLE", 409);
    }
    const finalized = await caller.rpc("finalize_group_media_upload", {
      p_group_id: command.groupId,
      p_object_path: canonicalPath,
      p_mime_type: inspected.mimeType,
      p_verified_size: inspected.byteSize,
      p_width: inspected.width,
      p_height: inspected.height,
      p_request_key: command.requestKey,
    });
    if (finalized.error) mapMediaError(finalized.error.message);
    const row = finalized.data?.[0] as Record<string, unknown> | undefined;
    if (!row) throw new MediaBoundaryError("MEDIA_NOT_AVAILABLE", 404);
    const previousPath =
      typeof row.previous_object_path === "string"
        ? row.previous_object_path
        : null;
    if (previousPath && previousPath !== canonicalPath) {
      await bucket.remove([previousPath]);
    }
    return { group: mapGroup(row) };
  } catch (error) {
    const rejected = await caller.rpc("reject_group_media_upload", {
      p_group_id: command.groupId,
      p_object_path: canonicalPath,
    });
    const rejectedRow = rejected.data?.[0] as { object_path?: string } | undefined;
    if (!rejected.error && rejectedRow?.object_path === canonicalPath) {
      await bucket.remove([canonicalPath]);
    }
    throw error;
  }
}

Deno.serve(async (request) => {
  let headers: Record<string, string> = {};
  let actorId: string | undefined;
  let input: AuditableCommand | undefined;
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") {
      return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, headers);
    }

    const body = await readJson(request);
    input = body as AuditableCommand;
    const client = callerClient(request);
    const user = await client.auth.getUser();
    actorId = user.data.user?.id;
    if (user.error || !actorId) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, 401, headers);
    }
    const mediaCommand = mediaCommandSchema.safeParse(body);
    if (mediaCommand.success) {
      const result = await executeMediaCommand(
        mediaCommand.data,
        client,
        adminClient(),
      );
      return jsonResponse(result, 200, headers);
    }
    const group = await executeGroupIdentityCommand(
      body as GroupIdentityCommand,
      dependencies(client),
    );
    return jsonResponse({ group }, 200, headers);
  } catch (error) {
    if (actorId && input?.requestKey) {
      try {
        await adminClient().rpc("record_rejected_security_action", {
          p_actor_user_id: actorId,
          p_cohort_id: null,
          p_event_type: `group_identity.${input.action ?? "invalid"}`,
          p_entity_id: input.groupId ?? null,
          p_request_key: input.requestKey,
        });
      } catch {
        // Preserve the neutral client error even if audit storage is unavailable.
      }
    }
    const status =
      error instanceof GroupIdentityBoundaryError ||
      error instanceof MediaBoundaryError ||
      error instanceof RequestOriginError
        ? error.status
        : 400;
    return jsonResponse(
      {
        error:
          error instanceof GroupIdentityBoundaryError
            ? error.code
            : error instanceof MediaBoundaryError
              ? error.code
              : "INVALID_GROUP_ACTION",
      },
      status,
      headers,
    );
  }
});
