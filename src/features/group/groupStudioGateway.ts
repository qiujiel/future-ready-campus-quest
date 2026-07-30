import type { PublicGroupIdentity } from "../../shared/api/contracts";
import { getSupabaseClient } from "../../shared/api/supabase";

export interface GroupStudioGateway {
  rename(groupId: string, displayName: string): Promise<PublicGroupIdentity>;
  transferEditor(
    groupId: string,
    studentId: string,
  ): Promise<PublicGroupIdentity>;
  uploadImage(
    groupId: string,
    file: File,
    onProgress: (percent: number) => void,
  ): Promise<PublicGroupIdentity>;
}

async function invokeGroupCommand(body: Record<string, unknown>) {
  const result = await getSupabaseClient().functions.invoke(
    "manage-group-identity",
    { body },
  );
  if (result.error) {
    throw new Error("GROUP_ACTION_NOT_AVAILABLE");
  }
  return result.data as Record<string, unknown>;
}

function groupFrom(data: Record<string, unknown>) {
  const group = data.group;
  if (!group || typeof group !== "object") {
    throw new Error("GROUP_ACTION_NOT_AVAILABLE");
  }
  return group as PublicGroupIdentity;
}

function uploadToSignedUrl(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("content-type", file.type);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error("MEDIA_NOT_AVAILABLE"));
    });
    request.addEventListener("error", () =>
      reject(new Error("MEDIA_NOT_AVAILABLE")),
    );
    request.send(file);
  });
}

export const supabaseGroupStudioGateway: GroupStudioGateway = {
  async rename(groupId, displayName) {
    return groupFrom(
      await invokeGroupCommand({
        action: "rename",
        groupId,
        displayName,
        requestKey: crypto.randomUUID(),
      }),
    );
  },
  async transferEditor(groupId, studentId) {
    return groupFrom(
      await invokeGroupCommand({
        action: "transfer-editor",
        groupId,
        nextEditorId: studentId,
        requestKey: crypto.randomUUID(),
      }),
    );
  },
  async uploadImage(groupId, file, onProgress) {
    const prepared = await invokeGroupCommand({
      action: "prepare-upload",
      groupId,
      mimeType: file.type,
      byteSize: file.size,
      requestKey: crypto.randomUUID(),
    });
    if (
      typeof prepared.uploadUrl !== "string" ||
      typeof prepared.objectPath !== "string"
    ) {
      throw new Error("MEDIA_NOT_AVAILABLE");
    }
    await uploadToSignedUrl(prepared.uploadUrl, file, onProgress);
    return groupFrom(
      await invokeGroupCommand({
        action: "finalize-upload",
        groupId,
        objectPath: prepared.objectPath,
        requestKey: crypto.randomUUID(),
      }),
    );
  },
};
