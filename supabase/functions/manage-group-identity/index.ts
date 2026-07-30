import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  adminClient,
  callerClient,
} from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  executeGroupIdentityCommand,
  type GroupIdentityDependencies,
  GroupIdentityBoundaryError,
} from "../_shared/group-core.ts";
import { jsonResponse, readJson } from "../_shared/http.ts";
import type {
  GroupIdentityCommand,
  PublicGroupIdentity,
} from "../../../src/shared/api/contracts.ts";

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

Deno.serve(async (request) => {
  let headers: Record<string, string> = {};
  let actorId: string | undefined;
  let input: GroupIdentityCommand | undefined;
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") {
      return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, headers);
    }

    input = (await readJson(request)) as GroupIdentityCommand;
    const client = callerClient(request);
    const user = await client.auth.getUser();
    actorId = user.data.user?.id;
    if (user.error || !actorId) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, 401, headers);
    }
    const group = await executeGroupIdentityCommand(
      input,
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
      error instanceof GroupIdentityBoundaryError ? error.status : 400;
    return jsonResponse(
      {
        error:
          error instanceof GroupIdentityBoundaryError
            ? error.code
            : "INVALID_GROUP_ACTION",
      },
      status,
      headers,
    );
  }
});
